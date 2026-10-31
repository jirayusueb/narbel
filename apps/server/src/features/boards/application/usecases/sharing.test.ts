import { describe, expect, it } from "bun:test";

import type { Actor } from "../../../../shared/kernel/types/Actor";
import {
  fakeUnlock,
  ids,
  newBoard,
  protectedBoard,
  setupAccess,
} from "../../../../testing";
import { HmacUnlockTokens } from "../../infrastructure/services/HmacUnlockTokens";
import { AccessPolicy } from "../AccessPolicy";
import type { Need } from "../AccessPolicy";
import { GetBoard } from "./GetBoard";
import { InviteBoardMember } from "./InviteBoardMember";
import { RemoveBoardMember } from "./RemoveBoardMember";
import { UnlockBoard } from "./UnlockBoard";
import { UpdateBoardAccess } from "./UpdateBoardAccess";
import type { AccessPatch } from "./UpdateBoardAccess";

const TOKEN = "t".repeat(43);
const future = new Date(Date.now() + 3_600_000);
const past = new Date(Date.now() - 3_600_000);

const outcome = async (
  policy: AccessPolicy,
  actor: Actor,
  need: Need = "read"
) => {
  const result = await policy.decide("b1", actor, need);
  return result.isOk()
    ? `${result.value.access.role}:${result.value.access.canWrite}`
    : `${result.error.code}${result.error.details ? "+details" : ""}`;
};

describe("access matrix", () => {
  it("private board: owner, invited editor and viewer; everyone else gets 404", async () => {
    const { policy, grants } = setupAccess();
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
    expect(await outcome(policy, { userId: "owner" })).toBe("owner:true");
    expect(await outcome(policy, { userId: "ed" })).toBe("editor:true");
    expect(await outcome(policy, { userId: "zzz", email: "vi@x.io" })).toBe(
      "viewer:false"
    );
    // zzz claimed vi's invitation above, so the stranger is someone else
    expect(await outcome(policy, { userId: "yyy" })).toBe("NotFound");
    expect(await outcome(policy, {})).toBe("NotFound");
  });

  it("enforces need: viewers cannot write, only the owner passes owner routes", async () => {
    const { policy, grants } = setupAccess();
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
    expect(await outcome(policy, { userId: "vi" }, "write")).toBe("Forbidden");
    expect(await outcome(policy, { userId: "ed" }, "write")).toBe(
      "editor:true"
    );
    expect(await outcome(policy, { userId: "ed" }, "owner")).toBe("NotFound");
    expect(await outcome(policy, { userId: "owner" }, "owner")).toBe(
      "owner:true"
    );
  });

  it("link visibility grants anonymous viewers", async () => {
    const { policy, boards } = setupAccess();
    boards.rows.set("b1", protectedBoard("link", null));
    expect(await outcome(policy, {})).toBe("viewer:false");
    expect(await outcome(policy, {}, "write")).toBe("Forbidden");
  });

  it("share token grants its role, and expired or wrong tokens grant nothing", async () => {
    const { policy, grants } = setupAccess();
    grants.share = {
      boardId: "b1",
      token: TOKEN,
      role: "editor",
      createdAt: past,
      expiresAt: future,
    };
    expect(await outcome(policy, { userId: "u1", shareToken: TOKEN })).toBe(
      "editor:true"
    );
    expect(await outcome(policy, { shareToken: TOKEN })).toBe("viewer:false");
    expect(await outcome(policy, { shareToken: TOKEN }, "write")).toBe(
      "Forbidden"
    );
    expect(await outcome(policy, { shareToken: "x".repeat(43) })).toBe(
      "NotFound"
    );
    grants.share = {
      boardId: "b1",
      token: TOKEN,
      role: "editor",
      createdAt: past,
      expiresAt: past,
    };
    expect(await outcome(policy, { shareToken: TOKEN })).toBe("NotFound");
    grants.share = {
      boardId: "b1",
      token: TOKEN,
      role: "viewer",
      createdAt: past,
      expiresAt: null,
    };
    expect(await outcome(policy, { shareToken: TOKEN })).toBe("viewer:false");
  });

  it("password board asks for the password until a valid unlock proof is presented", async () => {
    const { policy, boards } = setupAccess();
    boards.rows.set("b1", protectedBoard("password", "hash"));
    expect(await outcome(policy, {})).toBe("Forbidden+details");
    expect(await outcome(policy, { unlockProof: "forged" })).toBe(
      "Forbidden+details"
    );
    expect(await outcome(policy, { unlockProof: "ok:b1" })).toBe(
      "viewer:false"
    );
    expect(await outcome(policy, {}, "owner")).toBe("NotFound");
  });

  it("an unlock proof is worthless once the board is no longer password protected", async () => {
    const { policy, boards } = setupAccess();
    boards.rows.set("b1", protectedBoard("private", "hash"));
    expect(await outcome(policy, { unlockProof: "ok:b1" })).toBe("NotFound");
  });

  it("tells a viewer asking to write that the board is read-only", async () => {
    const { policy, grants } = setupAccess();
    grants.members.push({
      boardId: "b1",
      userId: "vi",
      email: "vi@x.io",
      name: "Vi",
      role: "viewer",
    });
    const result = await policy.decide("b1", { userId: "vi" }, "write");
    expect(result.isErr() && result.error.message).toBe(
      "This board is read-only for you"
    );
  });

  it("changing the password invalidates every unlock proof", async () => {
    const { boards, grants } = setupAccess();
    const tokens = new HmacUnlockTokens("secret-secret-secret-secret-secret");
    const policy = new AccessPolicy(boards, grants, tokens);
    boards.rows.set("b1", protectedBoard("password", "hash-1"));
    const proof = tokens.issue("b1", "hash-1");
    expect(await outcome(policy, { unlockProof: proof })).toBe("viewer:false");
    boards.rows.set("b1", protectedBoard("password", "hash-2"));
    expect(await outcome(policy, { unlockProof: proof })).toBe(
      "Forbidden+details"
    );
  });

  it("the first access through an invited email claims the invitation, once", async () => {
    const { policy, grants } = setupAccess();
    grants.members.push({
      boardId: "b1",
      userId: null,
      email: "vi@x.io",
      name: "Vi",
      role: "viewer",
    });
    expect(await outcome(policy, { userId: "vi", email: "vi@x.io" })).toBe(
      "viewer:false"
    );
    expect(grants.members[0]?.userId).toBe("vi");
    await policy.decide("b1", { userId: "other", email: "vi@x.io" }, "read");
    expect(grants.members[0]?.userId).toBe("vi");
    expect(await outcome(policy, { userId: "vi" })).toBe("viewer:false");
  });
});

describe("unlock", () => {
  const verify = (plain: string, hash: string) =>
    Promise.resolve(hash === `h(${plain})`);
  const hasher = { hash: (p: string) => Promise.resolve(`h(${p})`), verify };

  const setup = () => {
    const base = setupAccess();
    base.boards.rows.set("b1", protectedBoard("password", "h(secret-pass)"));
    const failures: string[] = [];
    const limiter = {
      isBlocked: (key: string) =>
        Promise.resolve(failures.filter((k) => k === key).length >= 2),
      recordFailure: (key: string) => {
        failures.push(key);
        return Promise.resolve();
      },
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
      base.policy,
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

  it("tells live peers only when protection or the share link changes", async () => {
    const { update, outbox } = setup();
    const run = (patch: AccessPatch) =>
      update.execute({ actor, boardId: "b1", patch });
    await run({ visibility: "private" });
    await run({});
    expect(outbox.events()).toEqual([]);
    await run({ visibility: "link" });
    await run({ shareTokenEnabled: true });
    await run({ shareTokenEnabled: false });
    await run({ shareTokenEnabled: false });
    expect(outbox.events()).toEqual(
      Array.from({ length: 3 }, () => ({
        type: "event.access-changed",
        version: 1,
        boardId: "b1",
      }))
    );
  });
});

describe("invites", () => {
  const setup = () => {
    const base = setupAccess();
    base.profiles.add("owner", "olive", "Olive");
    base.profiles.add("ann", "ann");
    return {
      ...base,
      invite: new InviteBoardMember(base.policy, base.uow),
    };
  };
  const input = {
    actor: { userId: "owner", email: "own@x.io", name: "Olive" },
    boardId: "b1",
    role: "editor" as const,
  };

  it("stores the invite by lowercased email and publishes member-invited, writing no notification or email itself", async () => {
    const { invite, grants, outbox, notifications } = setup();
    grants.findUserIdByEmail = () => Promise.resolve("ann");
    const result = await invite.execute({ ...input, email: " Ann@X.io " });
    expect(result.isOk() && result.value).toEqual({ queued: true });
    expect(grants.members[0]).toMatchObject({
      email: "ann@x.io",
      userId: "ann",
      role: "editor",
    });
    expect(outbox.emails()).toHaveLength(0);
    expect(notifications.sent).toHaveLength(0);
    expect(outbox.events()).toContainEqual({
      type: "event.member-invited",
      version: 1,
      boardId: "b1",
      boardTitle: "Mine",
      email: "ann@x.io",
      inviteeId: "ann",
      inviterId: "owner",
      inviterName: "Olive",
      firstInvite: true,
    });
  });

  it("publishes inviteeId null when the invitee has no account yet", async () => {
    const { invite, outbox } = setup();
    await invite.execute({ ...input, email: "new@x.io" });
    expect(outbox.events()).toContainEqual(
      expect.objectContaining({
        type: "event.member-invited",
        inviteeId: null,
        firstInvite: true,
      })
    );
  });

  it("a re-invite publishes member-invited with firstInvite false; a new role also tells live peers", async () => {
    const { invite, grants, outbox } = setup();
    grants.findUserIdByEmail = () => Promise.resolve("ann");
    await invite.execute({ ...input, email: "ann@x.io" });
    await invite.execute({ ...input, email: "Ann@x.io", role: "viewer" });
    await invite.execute({ ...input, email: "ann@x.io", role: "viewer" });
    expect(grants.members).toHaveLength(1);
    expect(grants.members[0]?.role).toBe("viewer");
    const events = outbox.events() as { type: string; firstInvite?: boolean }[];
    expect(
      events
        .filter((e) => e.type === "event.member-invited")
        .map((e) => e.firstInvite)
    ).toEqual([true, false, false]);
    // the first grant and the role change; the same role again changes nothing
    expect(
      events.filter((e) => e.type === "event.access-changed")
    ).toHaveLength(2);
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

  it("removes members by user id or pending email and tells the other contexts; the owner is protected", async () => {
    const { grants, policy, uow, outbox } = setup();
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
    const remove = new RemoveBoardMember(policy, uow);
    const actor = { userId: "owner" };
    expect(
      (await remove.execute({ actor, boardId: "b1", member: "u1" })).isOk()
    ).toBe(true);
    expect(
      (await remove.execute({ actor, boardId: "b1", member: "p@x.io" })).isOk()
    ).toBe(true);
    expect(
      (await remove.execute({ actor, boardId: "b1", member: "owner" })).isErr()
    ).toBe(true);
    expect(
      (await remove.execute({ actor, boardId: "b1", member: "ghost" })).isErr()
    ).toBe(true);
    const removed = { type: "event.member-removed", version: 1, boardId: "b1" };
    expect(outbox.events()).toEqual([
      { ...removed, email: "a@x.io", personId: "u1" },
      { ...removed, email: "p@x.io", personId: null },
    ]);
  });

  it("GetBoard reports the shared role to an invited viewer", async () => {
    const { grants, policy } = setup();
    grants.members.push({
      boardId: "b1",
      userId: "u1",
      email: "a@x.io",
      name: "A",
      role: "viewer",
    });
    const view = await new GetBoard(policy).execute({
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
