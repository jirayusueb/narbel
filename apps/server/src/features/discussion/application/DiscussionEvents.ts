import type { DiscussionEvent } from "../../../shared/application/events/DiscussionEvent";
import type { Person } from "../../../shared/application/interfaces/IProfiles";
import { threadIdOf } from "../domain/entities/Comment";
import type { Comment } from "../domain/entities/Comment";
import { excerptOf, extractMentions } from "../domain/rules/mentions";
import type { DiscussionTx } from "./ports/DiscussionTx";

const audience = (root: Comment) =>
  new Set(
    [root.authorId, root.assigneeId].filter((id): id is string => id !== null)
  );

/**
 * What a comment change tells other contexts, written into the caller's transaction
 * as an outbox event. Notification renders and delivers; discussion decides who hears.
 * Nobody is ever told about their own action.
 */
export class DiscussionEvents {
  constructor(
    private readonly tx: Pick<DiscussionTx, "outbox" | "profiles">,
    private readonly actor: Person,
    private readonly comment: Comment
  ) {}

  private get base() {
    return {
      version: 1 as const,
      boardId: this.comment.boardId,
      commentId: this.comment.id,
      threadId: threadIdOf(this.comment),
      actor: {
        userId: this.actor.id,
        username: this.actor.username,
        name: this.actor.name,
      },
    };
  }

  private excerpt = () => excerptOf(this.comment.body);

  private publish(event: DiscussionEvent) {
    return this.tx.outbox.publish(event);
  }

  async assigned(recipient: Person) {
    if (recipient.id === this.actor.id) {
      return;
    }
    await this.publish({
      type: "event.comment-assigned",
      ...this.base,
      excerpt: this.excerpt(),
      recipient: { id: recipient.id, email: recipient.email },
    });
  }

  /**
   * Names every board member written with `@username` in the body, except those already
   * named in `alreadyMentioned` (usernames). Returns the user ids that were named.
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
    if (targets.length > 0) {
      await this.publish({
        type: "event.people-mentioned",
        ...this.base,
        excerpt: this.excerpt(),
        recipients: targets.map((person) => ({
          id: person.id,
          email: person.email,
        })),
      });
    }
    return new Set(targets.map((person) => person.id));
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
    if (recipients.length > 0) {
      await this.publish({
        type: "event.thread-replied",
        ...this.base,
        excerpt: this.excerpt(),
        recipientIds: recipients,
      });
    }
  }

  async resolved(root: Comment, members: Set<string>) {
    const recipients = [...audience(root)].filter(
      (id) => id !== this.actor.id && members.has(id)
    );
    if (recipients.length > 0) {
      await this.publish({
        type: "event.thread-resolved",
        ...this.base,
        recipientIds: recipients,
      });
    }
  }
}
