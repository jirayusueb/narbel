import { describe, expect, spyOn, test } from "bun:test";

import { RedisSecondaryStorage } from "./RedisSecondaryStorage";
import type { SecondaryRedisLike } from "./RedisSecondaryStorage";

const down = () => Promise.reject(new Error("redis down"));

const brokenRedis: SecondaryRedisLike = {
  get: down,
  set: down,
  del: down,
  getdel: down,
  multi: () => {
    const chain = {
      incr: () => chain,
      expire: () => chain,
      exec: down,
    };
    return chain;
  },
};

describe("RedisSecondaryStorage with Redis down", () => {
  const storage = new RedisSecondaryStorage(brokenRedis);

  test("reads and writes degrade so Postgres answers", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    expect(await storage.get("k")).toBeNull();
    await storage.set("k", "v", 60);
    log.mockRestore();
  });

  test("deletes propagate so a revoke never reports success", async () => {
    await expect(storage.delete("k")).rejects.toThrow("redis down");
    await expect(storage.getAndDelete("k")).rejects.toThrow("redis down");
  });

  test("rate-limit increment fails open", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    expect(await storage.increment("k", 60)).toBe(1);
    log.mockRestore();
  });
});
