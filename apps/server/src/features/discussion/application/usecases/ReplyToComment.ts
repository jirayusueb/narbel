import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { requirePerson } from "../../../../shared/application/requirePerson";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { isThread, replyTo } from "../../domain/entities/Thread";
import { presentOne } from "../CommentPresenter";
import { DiscussionEvents } from "../DiscussionEvents";
import type { CommentDto } from "../dtos/CommentDto";
import type { DiscussionTx } from "../ports/DiscussionTx";
import type { IBoardAccess } from "../ports/IBoardAccess";

export class ReplyToComment {
  constructor(
    private readonly access: IBoardAccess,
    private readonly uow: IUnitOfWork<DiscussionTx>,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    commentId: string;
    body: string;
  }): Promise<Result<CommentDto, AppError>> {
    const granted = await this.access.decide(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const { board } = granted.value;
    return await this.uow.run(async (tx) => {
      const actor = await requirePerson(tx.profiles, input.actor.userId);
      if (actor.isErr()) {
        return err(actor.error);
      }
      const target = await tx.comments.findById(board.id, input.commentId);
      // replies are one level deep: answering a reply answers its thread
      const root = target?.parentId
        ? await tx.comments.findById(board.id, target.parentId)
        : target;
      if (!(root && isThread(root))) {
        return err(AppError.notFound("Comment"));
      }
      const reply = replyTo(
        root,
        { id: this.ids.generate(), body: input.body, authorId: actor.value.id },
        new Date()
      );
      if (reply.isErr()) {
        return err(reply.error);
      }
      await tx.comments.save(reply.value);
      const events = new DiscussionEvents(tx, actor.value, reply.value);
      const members = await tx.members.memberIds(board);
      const mentioned = await events.mentions(members);
      await events.reply(root, mentioned, members);
      return await presentOne(
        tx.comments,
        tx.profiles,
        board.id,
        reply.value.id,
        actor.value.id
      );
    });
  }
}
