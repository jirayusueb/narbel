import { describe, expect, it } from "bun:test";

import type { IdentityEvent } from "../../../../shared/application/events/IdentityEvent";
import type { OutboxEvent } from "../../../../shared/application/interfaces/IOutbox";
import { DeletePerson } from "./DeletePerson";

const setup = (avatarKey: string | null, publishFails = false) => {
  const log: string[] = [];
  const published: OutboxEvent[] = [];
  const deletePerson = new DeletePerson(
    { avatarKeyOf: () => Promise.resolve(avatarKey) },
    {
      delete: (key) => {
        log.push(`delete:${key}`);
        return Promise.resolve();
      },
    },
    {
      publish: (event) => {
        if (publishFails) {
          return Promise.reject(new Error("outbox down"));
        }
        published.push(event);
        return Promise.resolve();
      },
    }
  );
  return { log, published, deletePerson };
};

describe("DeletePerson", () => {
  it("deletes the avatar and publishes person-deleted", async () => {
    const { log, published, deletePerson } = setup("avatars/p1");
    await deletePerson.execute({ id: "p1", email: "gone@x.io" });
    expect(log).toEqual(["delete:avatars/p1"]);
    const expected: IdentityEvent = {
      type: "event.person-deleted",
      version: 1,
      personId: "p1",
      email: "gone@x.io",
    };
    expect(published).toEqual([expected]);
  });

  it("publishes without touching storage when there is no avatar", async () => {
    const { log, published, deletePerson } = setup(null);
    await deletePerson.execute({ id: "p1", email: "gone@x.io" });
    expect(log).toEqual([]);
    expect(published).toHaveLength(1);
  });

  it("a failed publish rejects so the account delete aborts", async () => {
    const { deletePerson } = setup(null, true);
    await expect(
      deletePerson.execute({ id: "p1", email: "gone@x.io" })
    ).rejects.toThrow("outbox down");
  });
});
