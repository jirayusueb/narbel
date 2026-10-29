import { describe, expect, it } from "bun:test";

import type { BoardAccessGuard, Actor, Need } from "../BoardAccess";
import { fakeUnlock, ids, newBoard, setupAccess } from "./fakes";
import { GetBoard } from "./GetBoard";
import { InviteBoardMember } from "./InviteBoardMember";
import { RemoveBoardMember } from "./RemoveBoardMember";
import { UnlockBoard } from "./UnlockBoard";
import { UpdateBoardAccess } from "./UpdateBoardAccess";

const TOKEN = "t".repeat(43);
const future = new Date(Date.now() + 3_600_000);
const past = new Date(Date.now() - 3_600_000);

const outcome = async (
  guard: BoardAccessGuard,
  actor: Actor,
  need: Need = "read"
) => {
  const result = await guard.require("b1", actor, need);
  return result.isOk()
    ? `${result.value.access.role}:${result.value.access.canWrite}`
    : `${result.error.code}${result.error.details ? "+details" : ""}`;
};

describe("access matrix", () => {
  it("private board: owner, invited editor and viewer; everyone else gets 404", async () => {
    const { guard, grants } = setupAccess();
    grants.members.push(
      {
        boardId: "b1",
        userId: "ed",
        email: "ed@x.io",
        name: "Ed",
        role: "editor",
      },
      {
        boardId: "b1",
        userId: null,
        email: "vi@x.io",
        name: "Vi",
        role: "viewer",
      }
    );
    expect(await outcome(guard, { userId: "owner" })).toBe("owner:true");
    expect(await outcome(guard, { userId: "ed" })).toBe("editor:true");
    expect(await outcome(guard, { userId: "zzz", email: "vi@x.io" })).toBe(
      "viewer:false"
    );
    expect(await outcome(guard, { userId: "zzz" })).toBe("NotFound");
    expect(await outcome(guard, {})).toBe("NotFound");
  });

  it("enforces need: viewers cannot write, only the owner passes owner routes", async () => {
    const { guard, grants } = setupAccess();
    grants.members.push(
      {
        boardId: "b1",
        userId: "vi",
        email: "vi@x.io",
        name: "Vi",
        role: "viewer",
      },
      {
        boardId: "b1",
        userId: "ed",
        email: "ed@x.io",
        name: "Ed",
        role: "editor",
      }
    );
    expect(await outcome(guard, { userId: "vi" }, "write")).toBe("Forbidden");
    expect(await outcome(guard, { userId: "ed" }, "write")).toBe("editor:true");
    expect(await outcome(guard, { userId: "ed" }, "owner")).toBe("NotFound");
    expect(await outcome(guard, { userId: "owner" }, "owner")).toBe(
      "owner:true"
    );
  });

  it("link visibility grants anonymous viewers", async () => {
    const { guard, boards } = setupAccess();
    boards.rows.set("b1", newBoard().withProtection("link", null, new Date()));
    expect(await outcome(guard, {})).toBe("viewer:false");
    expect(await outcome(guard, {}, "write")).toBe("Forbidden");
  });

  it("share token grants its role, and expired or wrong tokens grant nothing", async () => {
    const { guard, grants } = setupAccess();
    grants.share = {
      boardId: "b1",
      token: TOKEN,
      role: "editor",
      createdAt: past,
      expiresAt: future,
    };
    expect(await outcome(guard, { shareToken: TOKEN })).toBe("editor:true");
    expect(await outcome(guard, { shareToken: "x".repeat(43) })).toBe(
      "NotFound"
    );
    grants.share = {
      boardId: "b1",
      token: TOKEN,
      role: "editor",
      createdAt: past,
      expiresAt: past,
    };
    expect(await outcome(guard, { shareToken: TOKEN })).toBe("NotFound");
    grants.share = {
      boardId: "b1",
      token: TOKEN,
      role: "viewer",
      createdAt: past,
      expiresAt: null,
    };
    expect(await outcome(guard, { shareToken: TOKEN })).toBe("viewer:false");
  });

  it("password board asks for the password until a valid unlock proof is presented", async () => {
    const { guard, boards } = setupAccess();
    boards.rows.set(
      "b1",
      newBoard().withProtection("password", "hash", new Date())
    );
    expect(await outcome(guard, {})).toBe("Forbidden+details");
    expect(await outcome(guard, { unlockProof: "forged" })).toBe(
      "Forbidden+details"
    );
    expect(await outcome(guard, { unlockProof: "ok:b1" })).toBe("viewer:false");
    expect(await outcome(guard, {}, "owner")).toBe("NotFound");
  });

  it("an unlock proof is worthless once the board is no longer password protected", async () => {
    const { guard, boards } = setupAccess();
    boards.rows.set(
      "b1",
      newBoard().withProtection("private", "hash", new Date())
    );
    expect(await outcome(guard, { unlockProof: "ok:b1" })).toBe("NotFound");
  });
});

describe("unlock", () => {
  const verify = (plain: string, hash: string) =>
    Promise.resolve(hash === `h(${plain})`);
  const hasher = { hash: (p: string) => Promise.resolve(`h(${p})`), verify };

  const setup = () => {
    const base = setupAccess();
    base.boards.rows.set(
      "b1",
      newBoard().withProtection("password", "h(secret-pass)", new Date())
    );
    const failures: string[] = [];
    const limiter = {
      isBlocked: (key: string) => failures.filter((k) => k === key).length >= 2,
      recordFailure: (key: string) => failures.push(key),
    };
    return {
      ...base,
      unlock: new UnlockBoard(base.boards, hasher, fakeUnlock, limiter),
    };
  };

  it("rejects a wrong password with 403, accepts the right one, and blocks after repeated failures", async () => {
    const { unlock } = setup();
    const input = { boardId: "b1", attemptKey: "b1:ip" };
    const wrong = await unlock.execute({ ...input, password: "nope" });
    expect(wrong.isErr() && wrong.error.code).toBe("Forbidden");
    const right = await unlock.execute({ ...input, password: "secret-pass" });
    expect(right.isOk() && right.value.proof).toBe("ok:b1");
    await unlock.execute({ ...input, password: "nope" });
    const blocked = await unlock.execute({ ...input, password: "secret-pass" });
    expect(blocked.isErr() && blocked.error.message).toContain("Too many");
  });

  it("is a 404 for boards that are not password protected", async () => {
    const { unlock, boards } = setup();
    boards.rows.set("b1", newBoard());
    const result = await unlock.execute({
      boardId: "b1",
      password: "x",
      attemptKey: "k",
    });
    expect(result.isErr() && result.error.code).toBe("NotFound");
  });
});

describe("access administration", () => {
  const hasher = {
    hash: (p: string) => Promise.resolve(`h(${p})`),
    verify: () => Promise.resolve(true),
  };
  const setup = () => {
    const base = setupAccess();
    const update = new UpdateBoardAccess(
      base.guard,
      base.uow,
      hasher,
      ids,
      "http://web"
    );
    return { ...base, update };
  };
  const actor = { userId: "owner" };

  it("refuses non-owners", async () => {
    const { update } = setup();
    const result = await update.execute({
      actor: { userId: "x" },
      boardId: "b1",
      patch: { visibility: "link" },
    });
    expect(result.isErr() && result.error.code).toBe("NotFound");
  });

  it("requires a password before the board can be locked, then hashes it", async () => {
    const { update, boards } = setup();
    const early = await update.execute({
      actor,
      boardId: "b1",
      patch: { visibility: "password" },
    });
    expect(early.isErr() && early.error.code).toBe("ValidationFailed");
    const short = await update.execute({
      actor,
      boardId: "b1",
      patch: { visibility: "password", password: "short" },
    });
    expect(short.isErr()).toBe(true);
    const ok = await update.execute({
      actor,
      boardId: "b1",
      patch: { visibility: "password", password: "long-enough-pw" },
    });
    expect(ok.isOk() && ok.value).toMatchObject({
      visibility: "password",
      hasPassword: true,
    });
    expect(boards.rows.get("b1")?.passwordHash).toBe("h(long-enough-pw)");
    const cleared = await update.execute({
      actor,
      boardId: "b1",
      patch: { password: null },
    });
    expect(cleared.isErr()).toBe(true);
  });

  it("creates, reconfigures and removes the share link", async () => {
    const { update } = setup();
    const on = await update.execute({
      actor,
      boardId: "b1",
      patch: { shareTokenEnabled: true, shareRole: "editor" },
    });
    expect(on.isOk() && on.value.share).toEqual({
      enabled: true,
      url: `http://web/boards/b1?share=${TOKEN}`,
      role: "editor",
      expiresAt: null,
    });
    const expiry = new Date(Date.now() + 86_400_000).toISOString();
    const timed = await update.execute({
      actor,
      boardId: "b1",
      patch: { shareExpiresAt: expiry },
    });
    expect(timed.isOk() && timed.value.share?.expiresAt).toBe(expiry);
    const bad = await update.execute({
      actor,
      boardId: "b1",
      patch: { shareExpiresAt: past.toISOString() },
    });
    expect(bad.isErr()).toBe(true);
    const off = await update.execute({
      actor,
      boardId: "b1",
      patch: { shareTokenEnabled: false },
    });
    expect(off.isOk() && off.value.share).toBeNull();
  });
});

describe("invites", () => {
  const setup = () => {
    const base = setupAccess();
    base.profiles.add("owner", "olive", "Olive");
    base.profiles.add("ann", "ann");
    return {
      ...base,
      invite: new InviteBoardMember(base.guard, base.uow, ids),
    };
  };
  const input = {
    actor: { userId: "owner", email: "own@x.io", name: "Olive" },
    boardId: "b1",
    role: "editor" as const,
  };

  it("stores the invite by lowercased email and queues the email with the notification", async () => {
    const { invite, grants, outbox, notifications } = setup();
    grants.findUserIdByEmail = () => Promise.resolve("ann");
    const result = await invite.execute({ ...input, email: " Ann@X.io " });
    expect(result.isOk() && result.value).toEqual({ queued: true });
    expect(grants.members[0]).toMatchObject({
      email: "ann@x.io",
      userId: "ann",
      role: "editor",
    });
    expect(outbox.messages[0]?.message).toEqual({
      type: "email.board-invite",
      to: "ann@x.io",
      boardId: "b1",
      boardTitle: "Mine",
      inviterName: "Olive",
    });
    expect(notifications.kinds("ann")).toEqual(["board.invited"]);
  });

  it("queues the email but notifies nobody when the invitee has no account yet", async () => {
    const { invite, outbox, notifications } = setup();
    await invite.execute({ ...input, email: "new@x.io" });
    expect(outbox.messages).toHaveLength(1);
    expect(notifications.sent).toHaveLength(0);
  });

  it("rejects bad addresses, self-invites and non-owners without side effects", async () => {
    const { invite, grants, outbox } = setup();
    expect((await invite.execute({ ...input, email: "nope" })).isErr()).toBe(
      true
    );
    expect(
      (await invite.execute({ ...input, email: "OWN@x.io" })).isErr()
    ).toBe(true);
    const outsider = await invite.execute({
      ...input,
      actor: { userId: "x", email: "x@x.io" },
      email: "ann@x.io",
    });
    expect(outsider.isErr() && outsider.error.code).toBe("NotFound");
    expect(grants.members).toHaveLength(0);
    expect(outbox.messages).toHaveLength(0);
  });

  it("removes members by user id or pending email; the owner is protected", async () => {
    const { grants, guard, uow, comments } = setup();
    grants.members.push(
      {
        boardId: "b1",
        userId: "u1",
        email: "a@x.io",
        name: "A",
        role: "viewer",
      },
      {
        boardId: "b1",
        userId: null,
        email: "p@x.io",
        name: "P",
        role: "viewer",
      }
    );
    comments.rows.set("c1", {
      id: "c1",
      boardId: "b1",
      pageId: "p",
      x: 0,
      y: 0,
      body: "hi",
      authorId: "owner",
      createdAt: new Date(),
      editedAt: null,
      resolvedAt: null,
      resolvedById: null,
      assigneeId: "u1",
      parentId: null,
    });
    const remove = new RemoveBoardMember(guard, uow);
    const actor = { userId: "owner" };
    expect(
      (await remove.execute({ actor, boardId: "b1", member: "u1" })).isOk()
    ).toBe(true);
    expect(comments.rows.get("c1")?.assigneeId).toBeNull();
    expect(
      (await remove.execute({ actor, boardId: "b1", member: "p@x.io" })).isOk()
    ).toBe(true);
    expect(
      (await remove.execute({ actor, boardId: "b1", member: "owner" })).isErr()
    ).toBe(true);
    expect(
      (await remove.execute({ actor, boardId: "b1", member: "ghost" })).isErr()
    ).toBe(true);
  });

  it("GetBoard reports the shared role to an invited viewer", async () => {
    const { grants, guard } = setup();
    grants.members.push({
      boardId: "b1",
      userId: "u1",
      email: "a@x.io",
      name: "A",
      role: "viewer",
    });
    const view = await new GetBoard(guard).execute({
      actor: { userId: "u1" },
      boardId: "b1",
    });
    expect(view.isOk() && view.value).toMatchObject({
      role: "viewer",
      canWrite: false,
      shared: true,
    });
  });
});
