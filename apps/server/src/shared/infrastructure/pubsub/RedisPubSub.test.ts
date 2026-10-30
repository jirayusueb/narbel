import { expect, test } from "bun:test";

import type Redis from "ioredis";

import { RedisPubSub } from "./RedisPubSub";

type Listener = (channel: Buffer, message: Buffer) => void;

test("a SUBSCRIBE that failed during an outage is sent again by the next subscriber", async () => {
  let deliver: Listener = () => {};
  const subscriber = {
    sent: [] as string[],
    down: true,
    on(_event: string, listener: Listener) {
      deliver = listener;
    },
    subscribe(channel: string) {
      if (this.down) {
        return Promise.reject(new Error("redis down"));
      }
      this.sent.push(channel);
      return Promise.resolve(1);
    },
  };
  const bus = new RedisPubSub({
    duplicate: () => subscriber,
  } as unknown as Redis);

  await expect(bus.subscribe("sync:b1", () => {})).rejects.toThrow();
  subscriber.down = false;
  const received: string[] = [];
  await bus.subscribe("sync:b1", (m) =>
    received.push(Buffer.from(m).toString())
  );
  deliver(Buffer.from("sync:b1"), Buffer.from("hi"));

  expect(subscriber.sent).toEqual(["sync:b1"]);
  expect(received).toEqual(["hi"]);
});
