import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { Board } from "../../domain/entities/Board";
import { BoardTitle, TITLE_MAX_LENGTH } from "../../domain/values/BoardTitle";
import type { AccessPolicy } from "../AccessPolicy";
import { toBoardDto } from "../dtos/BoardDto";
import type { BoardDto } from "../dtos/BoardDto";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IDrawingCopier } from "../ports/IDrawings";

const COPY_SUFFIX = " (copy)";

const copyTitle = (title: string) =>
  `${title.slice(0, TITLE_MAX_LENGTH - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;

/** Creates the caller's own copy of a board they can read; drawing copies its content. */
export class DuplicateBoard {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly boards: IBoardRepository,
    private readonly drawings: IDrawingCopier,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<BoardDto, AppError>> {
    const { userId } = input.actor;
    if (userId === undefined) {
      return err(AppError.unauthorized());
    }
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const title = BoardTitle.create(copyTitle(granted.value.board.title.value));
    if (title.isErr()) {
      return err(title.error);
    }
    const board = Board.create(
      this.ids.generate(),
      userId,
      title.value,
      new Date()
    );
    const copied = await this.drawings.copy(input.boardId, {
      create: async () => {
        await this.boards.save(board);
        return board.id;
      },
      remove: async (id) => {
        await this.boards.setTrashed(id, new Date());
        await this.boards.deleteTrashed(id);
      },
    });
    return copied.isErr() ? err(copied.error) : ok(toBoardDto(board, "owner"));
  }
}
