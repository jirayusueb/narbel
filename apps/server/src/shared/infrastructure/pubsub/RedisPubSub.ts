import type Redis from "ioredis";

import type { IPubSub } from "../../application/interfaces/IPubSub";

type Handler = (message: Uint8Array) => void;

/** Publishes on the given connection and subscribes on a duplicate (a subscribed connection can do nothing else). */
export class RedisPubSub implements IPubSub {
  private readonly subscriber: Redis;
  private readonly handlers = new Map<string, Set<Handler>>();

  constructor(private readonly publisher: Redis) {
    this.subscriber = publisher.duplicate();
    this.subscriber.on("messageBuffer", (channel: Buffer, message: Buffer) => {
      for (const handler of this.handlers.get(channel.toString()) ?? []) {
        try {
          handler(new Uint8Array(message));
        } catch (error) {
          console.error("Pub/sub handler failed", error);
        }
      }
    });
  }

  async publish(channel: string, message: Uint8Array) {
    await this.publisher.publish(channel, Buffer.from(message));
  }

  async subscribe(channel: string, handler: Handler) {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      await this.subscriber.subscribe(channel);
    }
    set.add(handler);
    return async () => {
      set.delete(handler);
      if (set.size === 0 && this.handlers.get(channel) === set) {
        this.handlers.delete(channel);
        await this.subscriber.unsubscribe(channel);
      }
    };
  }

  async close() {
    await Promise.all([this.subscriber.quit(), this.publisher.quit()]);
  }
}
