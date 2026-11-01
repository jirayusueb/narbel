import { describe, expect, it } from "bun:test";

import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import type { ICommentRepository } from "../ports/i-comment-repository";
import { UnassignRemovedMember } from "./unassign-removed-member";
import type { UnassignTx } from "./unassign-removed-member";

const setup = () => {
  const cleared: string[] = [];
  const seen = new Set<string>();
  const tx: UnassignTx = {
    comments: {
      clearAssignee: (boardId: string, userId: string) => {
        cleared.push(`${boardId}:${userId}`);
        return Promise.resolve();
      },
    } as unknown as ICommentRepository,
    processed: {
      claim: (consumer, id) => {
        const fresh = !seen.has(`${consumer}:${id}`);
        seen.add(`${consumer}:${id}`);
        return Promise.resolve(fresh);
      },
    },
  };
  const uow: IUnitOfWork<UnassignTx> = { run: (work) => work(tx) };
  return { cleared, seen, unassign: new UnassignRemovedMember(uow) };
};

const removed = {
  type: "event.member-removed" as const,
  version: 1 as const,
  boardId: "b1",
  email: "a@x.io",
  personId: "u1",
};

describe("UnassignRemovedMember", () => {
  it("clears the removed person as assignee once per event, under its own consumer name", async () => {
    const { cleared, seen, unassign } = setup();
    await unassign.execute("e1", removed);
    await unassign.execute("e1", removed);
    expect(cleared).toEqual(["b1:u1"]);
    expect([...seen]).toEqual(["discussion:e1"]);
    await unassign.execute("e2", removed);
    expect(cleared).toEqual(["b1:u1", "b1:u1"]);
  });

  it("does nothing for an invite nobody claimed", async () => {
    const { cleared, unassign } = setup();
    await unassign.execute("e1", { ...removed, personId: null });
    expect(cleared).toEqual([]);
  });
});
