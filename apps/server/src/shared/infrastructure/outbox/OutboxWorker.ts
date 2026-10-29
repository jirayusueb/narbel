import type { IEmailSender } from "../../application/interfaces/IEmailSender";
import type { ClaimedMessage, IOutboxStore } from "./OutboxStore";
import { renderOutboxMessage } from "./registry";
import type { RenderContext } from "./registry";

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export interface OutboxPolicy {
  batchSize: number;
  /** attempts after which a still-failing message is parked as dead */
  maxAttempts: number;
  baseDelaySeconds: number;
  capSeconds: number;
}

export const DEFAULT_OUTBOX_POLICY: OutboxPolicy = {
  batchSize: 20,
  maxAttempts: 8,
  baseDelaySeconds: 30,
  capSeconds: 3600,
};

export const backoffSeconds = (attemptsBefore: number, policy: OutboxPolicy) =>
  Math.min(policy.capSeconds, policy.baseDelaySeconds * 2 ** attemptsBefore);

/**
 * Delivers queued emails. Correct on many instances and across crashes: rows are leased on claim,
 * and the outbox id is the provider's Idempotency-Key, so a send repeated after a crash is a no-op.
 */
export class OutboxWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<number> | undefined;

  constructor(
    private readonly store: IOutboxStore,
    private readonly sender: IEmailSender,
    private readonly context: RenderContext,
    private readonly policy: OutboxPolicy = DEFAULT_OUTBOX_POLICY,
    private readonly now: () => Date = () => new Date()
  ) {}

  start(intervalMs = 2000) {
    this.timer = setInterval(async () => {
      try {
        await this.tick();
      } catch (error) {
        console.error("Outbox tick failed", error);
      }
    }, intervalMs);
  }

  async stop() {
    clearInterval(this.timer);
    await this.running;
  }

  /** One polling pass; resolves with the number of messages handled. Overlapping calls share a pass. */
  tick(): Promise<number> {
    this.running ??= this.run();
    return this.running;
  }

  private async run() {
    try {
      return await this.pass();
    } finally {
      this.running = undefined;
    }
  }

  private async pass() {
    const now = this.now();
    const claimed = await this.store.claimDue(
      now,
      this.policy.batchSize,
      (attemptsBefore) =>
        new Date(
          now.getTime() + backoffSeconds(attemptsBefore, this.policy) * 1000
        )
    );
    await this.deliverInOrder(claimed);
    return claimed.length;
  }

  // one at a time: the provider rate-limits per second, and a retry then simply waits for its backoff
  private async deliverInOrder(messages: ClaimedMessage[]) {
    const [head, ...rest] = messages;
    if (head) {
      await this.deliver(head);
      await this.deliverInOrder(rest);
    }
  }

  private async deliver(message: ClaimedMessage) {
    let email;
    try {
      email = renderOutboxMessage(message.type, message.payload, this.context);
    } catch (error) {
      // a message that cannot be rendered will never become renderable by retrying
      await this.store.markFailed(message.id, describe(error), true);
      return;
    }
    try {
      await this.sender.send(email, message.id);
    } catch (error) {
      await this.store.markFailed(
        message.id,
        describe(error),
        message.attempts >= this.policy.maxAttempts
      );
      return;
    }
    await this.store.markSent(message.id, this.now());
  }
}
