import type { ActorRef } from "../../../shared/application/interfaces/INotifications";
import type { Person } from "../../../shared/application/interfaces/IProfiles";
import { threadIdOf } from "../domain/entities/Comment";
import type { Comment } from "../domain/entities/Comment";
import { excerptOf, extractMentions } from "../domain/rules/mentions";
import type { BoardTx } from "./ports/BoardTx";

const audience = (root: Comment) =>
  new Set(
    [root.authorId, root.assigneeId].filter((id): id is string => id !== null)
  );

type Sink = Pick<BoardTx, "notifications" | "outbox" | "profiles">;

/**
 * What a comment change tells other people, written into the caller's transaction.
 * Nobody is ever told about their own action.
 */
export class CommentEvents {
  private readonly actorRef: ActorRef;

  constructor(
    private readonly tx: Sink,
    private readonly actor: Person,
    private readonly comment: Comment
  ) {
    this.actorRef = {
      userId: actor.id,
      username: actor.username,
      name: actor.name,
    };
  }

  private get base() {
    return {
      boardId: this.comment.boardId,
      commentId: this.comment.id,
      threadId: threadIdOf(this.comment),
      actor: this.actorRef,
    };
  }

  private excerpt = () => excerptOf(this.comment.body);

  async assigned(recipient: Person) {
    if (recipient.id === this.actor.id) {
      return;
    }
    await this.tx.notifications.add(recipient.id, {
      kind: "comment.assigned",
      ...this.base,
      excerpt: this.excerpt(),
    });
    await this.tx.outbox.enqueue(
      {
        type: "email.comment-assigned",
        to: recipient.email,
        boardId: this.comment.boardId,
        commentId: this.comment.id,
        actorName: this.actor.name,
        excerpt: this.excerpt(),
      },
      `assigned:${this.comment.id}:${recipient.id}`
    );
  }

  /**
   * Tells every board member named with `@username` in the body, except those already
   * named in `alreadyMentioned` (usernames). Returns the user ids that were notified.
   */
  async mentions(
    members: Set<string>,
    alreadyMentioned: string[] = []
  ): Promise<Set<string>> {
    const skip = new Set(alreadyMentioned);
    const usernames = extractMentions(this.comment.body).filter(
      (name) => !skip.has(name)
    );
    const named = await this.tx.profiles.findByUsernames(usernames);
    const targets = named.filter(
      (person) => person.id !== this.actor.id && members.has(person.id)
    );
    await Promise.all(targets.map((person) => this.mentioned(person)));
    return new Set(targets.map((person) => person.id));
  }

  private async mentioned(person: Person) {
    await this.tx.notifications.add(person.id, {
      kind: "comment.mentioned",
      ...this.base,
      excerpt: this.excerpt(),
    });
    await this.tx.outbox.enqueue(
      {
        type: "email.mentioned",
        to: person.email,
        boardId: this.comment.boardId,
        commentId: this.comment.id,
        actorName: this.actor.name,
        excerpt: this.excerpt(),
      },
      `mentioned:${this.comment.id}:${person.id}`
    );
  }

  /** Tells the thread's people (author, assignee) that something was added, unless they were told already. */
  async reply(
    root: Comment,
    alreadyNotified: Set<string>,
    members: Set<string>
  ) {
    const recipients = [...audience(root)].filter(
      (id) =>
        id !== this.actor.id && !alreadyNotified.has(id) && members.has(id)
    );
    await Promise.all(
      recipients.map((id) =>
        this.tx.notifications.add(id, {
          kind: "comment.reply",
          ...this.base,
          excerpt: this.excerpt(),
        })
      )
    );
  }

  async resolved(root: Comment, members: Set<string>) {
    const recipients = [...audience(root)].filter(
      (id) => id !== this.actor.id && members.has(id)
    );
    await Promise.all(
      recipients.map((id) =>
        this.tx.notifications.add(id, {
          kind: "comment.resolved",
          ...this.base,
        })
      )
    );
  }
}
