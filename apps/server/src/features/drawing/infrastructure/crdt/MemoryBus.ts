import type { IPubSub } from "../../../../shared/application/interfaces/IPubSub";

/** In-process stand-in for Redis pub/sub: asynchronous delivery that echoes to the publisher, like the real thing. */
export class MemoryBus implements IPubSub {
  private readonly handlers = new Map<string, Set<(m: Uint8Array) => void>>();

  publish(channel: string, message: Uint8Array) {
    for (const handler of this.handlers.get(channel) ?? []) {
      queueMicrotask(() => handler(message));
    }
    return Promise.resolve();
  }

  subscribe(channel: string, handler: (m: Uint8Array) => void) {
    const set = this.handlers.get(channel) ?? new Set();
    this.handlers.set(channel, set);
    set.add(handler);
    return Promise.resolve(() => {
      set.delete(handler);
      return Promise.resolve();
    });
  }

  subscribers(channel: string) {
    return this.handlers.get(channel)?.size ?? 0;
  }
}
