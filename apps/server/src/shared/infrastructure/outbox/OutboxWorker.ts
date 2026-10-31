import { setTimeout as sleep } from "node:timers/promises";

import type {
  Email,
  IEmailSender,
} from "../../application/interfaces/IEmailSender";
import type {
  ClaimedMessage,
  IOutboxStore,
} from "../../application/interfaces/IOutboxStore";
import { renderOutboxMessage } from "./registry";
import type { RenderContext } from "./registry";

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Hands one `event.*` message to the consumers that read it. Throwing `UnreadableEventError`
 * parks the message as dead; any other error retries it with the email backoff.
 */
export type EventConsumer = (id: string, payload: unknown) => Promise<void>;

export class UnreadableEventError extends Error {
  override name = "UnreadableEventError";
}

const noConsumer: EventConsumer = () =>
  Promise.reject(
    new UnreadableEventError("no consumer is registered for events")
  );

export interface OutboxPolicy {
  batchSize: number;
  /** attempts after which a still-failing message is parked as dead */
  maxAttempts: number;
  baseDelaySeconds: number;
  capSeconds: number;
  /** longest a single send may take before it counts as failed */
  sendTimeoutMs: number;
}

export const DEFAULT_OUTBOX_POLICY: OutboxPolicy = {
  batchSize: 20,
  maxAttempts: 8,
  baseDelaySeconds: 30,
  capSeconds: 3600,
  sendTimeoutMs: 10_000,
};

export const backoffSeconds = (attemptsBefore: number, policy: OutboxPolicy) =>
  Math.min(policy.capSeconds, policy.baseDelaySeconds * 2 ** attemptsBefore);

/**
 * Delivers queued emails and integration events. Correct on many instances and across crashes:
 * rows are leased on claim, the outbox id is the provider's Idempotency-Key, and each event
 * consumer records the ids it handled, so a delivery repeated after a crash is a no-op.
 */
export class OutboxWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<number> | undefined;
  private woken = false;
  private stopped = false;

  constructor(
    private readonly store: IOutboxStore,
    private readonly sender: IEmailSender,
    private readonly context: RenderContext,
    private readonly policy: OutboxPolicy = DEFAULT_OUTBOX_POLICY,
    private readonly now: () => Date = () => new Date(),
    private readonly consume: EventConsumer = noConsumer
  ) {}

  start(intervalMs = 2000) {
    this.timer = setInterval(() => this.tickLogged(), intervalMs);
  }

  /** After this resolves no pass is running and none will start. */
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.running;
  }

  /** One polling pass; resolves with the number of messages handled. Overlapping calls share a pass. */
  tick(): Promise<number> {
    this.running ??= this.run();
    return this.running;
  }

  /** Runs a pass now instead of at the next poll; called after a commit that queued something. */
  wake() {
    if (this.stopped) {
      return;
    }
    this.woken = true;
    void this.tickLogged();
  }

  private async tickLogged() {
    try {
      await this.tick();
    } catch (error) {
      console.error("Outbox tick failed", error);
    }
  }

  private async run() {
    try {
      return await this.passes();
    } finally {
      this.running = undefined;
      // a wake that landed after the last pass checked for one still gets its pass
      if (this.woken && !this.stopped) {
        void this.tickLogged();
      }
    }
  }

  // a wake during a pass, or an event whose consumer queued emails, gets another pass right after
  private async passes(): Promise<number> {
    this.woken = false;
    const handled = await this.pass();
    return this.woken ? handled + (await this.passes()) : handled;
  }

  private async pass() {
    const now = this.now();
    const claimed = await this.store.claimDue(
      now,
      this.policy.batchSize,
      // a whole batch of sends may each run to the timeout before the first retry becomes due
      (attemptsBefore) =>
        new Date(
          now.getTime() +
            backoffSeconds(attemptsBefore, this.policy) * 1000 +
            this.policy.batchSize * this.policy.sendTimeoutMs
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
    if (message.type.startsWith("event.")) {
      await this.deliverEvent(message);
      return;
    }
    let email;
    try {
      email = renderOutboxMessage(message.type, message.payload, this.context);
    } catch (error) {
      // a message that cannot be rendered will never become renderable by retrying
      await this.store.markFailed(
        message.id,
        describe(error),
        true,
        this.now()
      );
      return;
    }
    try {
      await this.send(email, message.id);
    } catch (error) {
      await this.store.markFailed(
        message.id,
        describe(error),
        message.attempts >= this.policy.maxAttempts,
        new Date(
          this.now().getTime() +
            backoffSeconds(message.attempts - 1, this.policy) * 1000
        )
      );
      return;
    }
    await this.store.markSent(message.id, this.now());
  }

  private async deliverEvent(message: ClaimedMessage) {
    try {
      await this.consume(message.id, message.payload);
    } catch (error) {
      const unreadable = error instanceof UnreadableEventError;
      await this.store.markFailed(
        message.id,
        describe(error),
        unreadable || message.attempts >= this.policy.maxAttempts,
        unreadable
          ? this.now()
          : new Date(
              this.now().getTime() +
                backoffSeconds(message.attempts - 1, this.policy) * 1000
            )
      );
      return;
    }
    await this.store.markSent(message.id, this.now());
    // the consumer may have queued emails in its transaction; send them now, not at the next poll
    this.woken = true;
  }

  // bounds a sender that ignores its own timeout so stop() and the lease stay predictable
  private async send(email: Email, key: string) {
    const cancel = new AbortController();
    const timeout = async () => {
      await sleep(this.policy.sendTimeoutMs, null, { signal: cancel.signal });
      throw new Error(`send timed out after ${this.policy.sendTimeoutMs}ms`);
    };
    try {
      await Promise.race([this.sender.send(email, key), timeout()]);
    } finally {
      cancel.abort();
    }
  }
}
