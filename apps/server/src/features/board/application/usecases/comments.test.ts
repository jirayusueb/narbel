import { describe, expect, it } from "bun:test";

import { newComment } from "../../domain/entities/Comment";
import { excerptOf, extractMentions } from "../../domain/rules/mentions";
import { parseReaction } from "../../domain/values/Reaction";
import { AddComment } from "./AddComment";
import { AssignComment } from "./AssignComment";
import { DeleteComment } from "./DeleteComment";
import { EditComment } from "./EditComment";
import { ids, setupAccess } from "./fakes";
import { ListComments } from "./ListComments";
import { ListReplies } from "./ListReplies";
import { ReplyToComment } from "./ReplyToComment";
import { ResolveComment } from "./ResolveComment";
import { SetCommentReaction } from "./SetCommentReaction";

const base = {
  id: "c",
  boardId: "b1",
  authorId: "u",
  parentId: null,
  assigneeId: null,
};

describe("comment validation", () => {
  it("trims and accepts 1 to 2000 characters", () => {
    const ok = newComment(
      { ...base, pageId: "p", x: 1, y: 2, body: "  hi  " },
      new Date()
    );
    expect(ok.isOk() && ok.value.body).toBe("hi");
    expect(
      newComment(
        { ...base, pageId: "p", x: 1, y: 2, body: "a".repeat(2000) },
        new Date()
      ).isOk()
    ).toBe(true);
  });

  it("rejects empty, oversized, non-finite and pageless comments", () => {
    const bad = (patch: object) =>
      newComment(
        { ...base, pageId: "p", x: 1, y: 2, body: "ok", ...patch },
        new Date()
      ).isErr();
    expect(bad({ body: "   " })).toBe(true);
    expect(bad({ body: "a".repeat(2001) })).toBe(true);
    expect(bad({ x: Number.NaN })).toBe(true);
    expect(bad({ y: Number.POSITIVE_INFINITY })).toBe(true);
    expect(bad({ pageId: "" })).toBe(true);
  });
});

describe("mentions and reactions", () => {
  it("finds distinct lowercase @usernames and ignores emails and short names", () => {
    expect(
      extractMentions("hi @Bob and @bob, mail a@bob.io, @al, (@carol_9)!")
    ).toEqual(["bob", "carol_9"]);
  });

  it("turns markdown into plain-text excerpts and keeps @mentions and snake_case", () => {
    expect(
      excerptOf(
        "## Plan\n- check the **API** and `cache`\n> see [the doc](https://x.y) @ada_l, ~~old~~ my_var"
      )
    ).toBe("Plan check the API and cache see the doc @ada_l, old my_var");
  });

  it("accepts the eight emoji with or without the variation selector", () => {
    for (const emoji of ["👍", "❤️", "❤", "😂", "🎉", "😮", "😢", "👀", "🚀"]) {
      expect(parseReaction(emoji).isOk()).toBe(true);
    }
    expect(parseReaction("💩").isErr()).toBe(true);
    const heart = parseReaction("❤");
    expect(heart.isOk() && heart.value).toBe("❤️");
  });
});

describe("comment use cases", () => {
  const setup = () => {
    const s = setupAccess();
    s.grants.members.push(
      {
        boardId: "b1",
        userId: "ed",
        email: "ed@x.io",
        name: "Ed",
        role: "editor",
      },
      {
        boardId: "b1",
        userId: "vi",
        email: "vi@x.io",
        name: "Vi",
        role: "viewer",
      }
    );
    s.profiles.add("owner", "olive");
    s.profiles.add("ed", "ed_");
    s.profiles.add("vi", "vivi");
    return {
      ...s,
      add: new AddComment(s.guard, s.uow, ids),
      reply: new ReplyToComment(s.guard, s.uow, ids),
      edit: new EditComment(s.guard, s.uow),
      resolve: new ResolveComment(s.guard, s.uow),
      assign: new AssignComment(s.guard, s.uow),
      react: new SetCommentReaction(s.guard, s.comments, s.profiles),
      list: new ListComments(s.guard, s.comments, s.profiles),
      replies: new ListReplies(s.guard, s.comments, s.profiles),
      del: new DeleteComment(s.guard, s.comments),
    };
  };
  const put = {
    boardId: "b1",
    pageId: "page:main",
    x: 10,
    y: 20,
    body: "hello",
  };
  const ed = { userId: "ed", name: "Ed" };
  const owner = { userId: "owner" };
  const idOf = (result: { isOk(): boolean; value?: { id: string } }) =>
    (result.isOk() && result.value?.id) || "";

  it("lets writers comment, lists per page, and refuses viewers and anonymous callers", async () => {
    const { add, list } = setup();
    const created = await add.execute({ ...put, actor: ed });
    expect(created.isOk() && created.value).toMatchObject({
      author: { id: "ed", name: "ED" },
      threadId: created.isOk() ? created.value.id : "",
      parentId: null,
      resolvedAt: null,
      assignee: null,
      replyCount: 0,
      reactions: [],
    });
    const viewer = await add.execute({ ...put, actor: { userId: "vi" } });
    expect(viewer.isErr() && viewer.error.code).toBe("Forbidden");
    const stranger = await add.execute({ ...put, actor: { userId: "zz" } });
    expect(stranger.isErr() && stranger.error.code).toBe("NotFound");
    const mine = await list.execute({
      actor: { userId: "vi" },
      boardId: "b1",
      pageId: "page:main",
    });
    expect(mine.isOk() && mine.value.items).toHaveLength(1);
    const other = await list.execute({
      actor: { userId: "vi" },
      boardId: "b1",
      pageId: "page:two",
    });
    expect(other.isOk() && other.value.items).toHaveLength(0);
  });

  it("assigns and mentions in one transaction: notifications plus emails, never to the actor", async () => {
    const { add, notifications, outbox } = setup();
    const created = await add.execute({
      ...put,
      body: "ping @ed_ and @olive and @ghost and @vivi",
      assigneeId: "ed",
      actor: owner,
    });
    expect(created.isOk()).toBe(true);
    expect(notifications.kinds("ed")).toEqual([
      "comment.assigned",
      "comment.mentioned",
    ]);
    expect(notifications.kinds("vi")).toEqual(["comment.mentioned"]);
    expect(notifications.kinds("owner")).toEqual([]);
    expect(outbox.messages.map((m) => m.message.type)).toEqual([
      "email.comment-assigned",
      "email.mentioned",
      "email.mentioned",
    ]);
  });

  it("refuses assignees without access to the board, leaving nothing behind", async () => {
    const { add, comments, notifications } = setup();
    const result = await add.execute({
      ...put,
      assigneeId: "stranger",
      actor: owner,
    });
    expect(result.isErr() && result.error.code).toBe("ValidationFailed");
    expect(comments.rows.size).toBe(0);
    expect(notifications.sent).toHaveLength(0);
  });

  it("replies attach to the thread root and notify its author once, mention wins over reply", async () => {
    const { add, reply, replies, notifications } = setup();
    const root = idOf(await add.execute({ ...put, actor: ed }));
    const first = await reply.execute({
      actor: owner,
      boardId: "b1",
      commentId: root,
      body: "first",
    });
    const second = await reply.execute({
      actor: { userId: "vi" },
      boardId: "b1",
      commentId: first.isOk() ? first.value.id : "",
      body: "re @ed_",
    });
    expect(second.isErr() && second.error.code).toBe("Forbidden");
    const third = await reply.execute({
      actor: owner,
      boardId: "b1",
      commentId: first.isOk() ? first.value.id : "",
      body: "second @ed_",
    });
    expect(first.isOk() && first.value).toMatchObject({
      parentId: root,
      threadId: root,
      pageId: "page:main",
    });
    expect(third.isOk() && third.value.parentId).toBe(root);
    expect(notifications.kinds("ed")).toEqual([
      "comment.reply",
      "comment.mentioned",
    ]);
    const list = await replies.execute({
      actor: { userId: "vi" },
      boardId: "b1",
      commentId: root,
    });
    expect(list.isOk() && list.value.items.map((c) => c.body)).toEqual([
      "first",
      "second @ed_",
    ]);
  });

  it("does not notify a removed member about replies or resolution", async () => {
    const { add, reply, resolve, grants, notifications } = setup();
    const root = idOf(await add.execute({ ...put, actor: ed }));
    grants.members.splice(
      grants.members.findIndex((m) => m.userId === "ed"),
      1
    );
    await reply.execute({
      actor: owner,
      boardId: "b1",
      commentId: root,
      body: "still there?",
    });
    await resolve.execute({
      actor: owner,
      boardId: "b1",
      commentId: root,
      resolve: true,
    });
    expect(notifications.kinds("ed")).toEqual([]);
  });

  it("assigning from a stale read keeps a concurrent edit", async () => {
    const { add, edit, assign, comments } = setup();
    const root = idOf(await add.execute({ ...put, actor: ed }));
    const stale = comments.rows.get(root);
    await edit.execute({
      actor: ed,
      boardId: "b1",
      commentId: root,
      body: "edited",
    });
    comments.findById = () => Promise.resolve(stale ?? null);
    await assign.execute({
      actor: ed,
      boardId: "b1",
      commentId: root,
      assigneeId: "vi",
    });
    expect(comments.rows.get(root)).toMatchObject({
      body: "edited",
      assigneeId: "vi",
    });
  });

  it("rejects a reply to an unknown comment", async () => {
    const { reply } = setup();
    const result = await reply.execute({
      actor: ed,
      boardId: "b1",
      commentId: "ghost",
      body: "x",
    });
    expect(result.isErr() && result.error.code).toBe("NotFound");
  });

  it("resolves and reopens idempotently and tells the author and assignee once", async () => {
    const { add, resolve, notifications } = setup();
    const root = idOf(
      await add.execute({ ...put, assigneeId: "vi", actor: ed })
    );
    const step = (resolveIt: boolean, actor = owner) =>
      resolve.execute({
        actor,
        boardId: "b1",
        commentId: root,
        resolve: resolveIt,
      });
    const first = await step(true);
    const again = await step(true);
    expect(first.isOk() && first.value.resolvedBy?.id).toBe("owner");
    expect(again.isOk() && again.value.resolvedAt).toBe(
      first.isOk() ? first.value.resolvedAt : ""
    );
    expect(notifications.kinds("ed")).toEqual(["comment.resolved"]);
    expect(notifications.kinds("vi")).toEqual([
      "comment.assigned",
      "comment.resolved",
    ]);
    const reopened = await step(false);
    expect(reopened.isOk() && reopened.value).toMatchObject({
      resolvedAt: null,
      resolvedBy: null,
    });
    const viewer = await step(true, { userId: "vi" });
    expect(viewer.isErr() && viewer.error.code).toBe("Forbidden");
  });

  it("filters threads by status", async () => {
    const { add, resolve, list } = setup();
    const a = idOf(await add.execute({ ...put, actor: ed }));
    await add.execute({ ...put, actor: ed });
    await resolve.execute({
      actor: ed,
      boardId: "b1",
      commentId: a,
      resolve: true,
    });
    const count = async (status: "open" | "resolved" | "all") => {
      const result = await list.execute({ actor: ed, boardId: "b1", status });
      return result.isOk() ? result.value.items.length : -1;
    };
    expect([
      await count("open"),
      await count("resolved"),
      await count("all"),
    ]).toEqual([1, 1, 2]);
  });

  it("reassigns, unassigns and edits; only the author may edit", async () => {
    const { add, assign, edit, notifications } = setup();
    const root = idOf(await add.execute({ ...put, actor: ed }));
    const to = (assigneeId: string | null) =>
      assign.execute({ actor: ed, boardId: "b1", commentId: root, assigneeId });
    const assigned = await to("vi");
    expect(assigned.isOk() && assigned.value.assignee?.id).toBe("vi");
    await to("vi");
    expect(notifications.kinds("vi")).toEqual(["comment.assigned"]);
    const none = await to(null);
    expect(none.isOk() && none.value.assignee).toBeNull();
    const edited = await edit.execute({
      actor: ed,
      boardId: "b1",
      commentId: root,
      body: "changed @vivi",
    });
    expect(edited.isOk() && edited.value.editedAt).not.toBeNull();
    expect(notifications.kinds("vi")).toEqual([
      "comment.assigned",
      "comment.mentioned",
    ]);
    const other = await edit.execute({
      actor: owner,
      boardId: "b1",
      commentId: root,
      body: "nope",
    });
    expect(other.isErr() && other.error.code).toBe("Forbidden");
  });

  it("lets viewers react once per emoji and toggles it off again", async () => {
    const { add, react } = setup();
    const root = idOf(await add.execute({ ...put, actor: ed }));
    const as = (userId: string, emoji: string, present: boolean) =>
      react.execute({
        actor: { userId },
        boardId: "b1",
        commentId: root,
        emoji,
        present,
      });
    await as("vi", "👍", true);
    await as("vi", "👍", true);
    const both = await as("ed", "👍", true);
    expect(both.isOk() && both.value.reactions).toEqual([
      { emoji: "👍", count: 2, mine: true },
    ]);
    const off = await as("vi", "👍", false);
    expect(off.isOk() && off.value.reactions).toEqual([
      { emoji: "👍", count: 1, mine: false },
    ]);
    expect((await as("vi", "💩", true)).isErr()).toBe(true);
  });

  it("pages thread roots newest first with an opaque cursor", async () => {
    const { add, list, comments } = setup();
    for (let i = 0; i < 3; i += 1) {
      await add.execute({ ...put, body: `c${i}`, actor: ed });
    }
    for (const [i, comment] of [...comments.rows.values()].entries()) {
      comments.rows.set(comment.id, {
        ...comment,
        createdAt: new Date(1000 + i),
      });
    }
    const first = await list.execute({ actor: ed, boardId: "b1", limit: 2 });
    expect(first.isOk() && first.value.items.map((c) => c.body)).toEqual([
      "c2",
      "c1",
    ]);
    const cursor = (first.isOk() && first.value.nextCursor) || "";
    expect(cursor).not.toBe("");
    const second = await list.execute({
      actor: ed,
      boardId: "b1",
      limit: 2,
      cursor,
    });
    expect(second.isOk() && second.value).toMatchObject({ nextCursor: null });
    expect(second.isOk() && second.value.items.map((c) => c.body)).toEqual([
      "c0",
    ]);
    const bad = await list.execute({
      actor: ed,
      boardId: "b1",
      cursor: "garbage",
    });
    expect(bad.isErr() && bad.error.code).toBe("ValidationFailed");
  });

  it("deletes only for the author or the owner", async () => {
    const { add, del, comments } = setup();
    const commentId = idOf(await add.execute({ ...put, actor: ed }));
    const viewer = await del.execute({
      actor: { userId: "vi" },
      boardId: "b1",
      commentId,
    });
    expect(viewer.isErr() && viewer.error.code).toBe("Forbidden");
    expect(comments.rows.size).toBe(1);
    expect(
      (await del.execute({ actor: owner, boardId: "b1", commentId })).isOk()
    ).toBe(true);
    expect(comments.rows.size).toBe(0);
  });
});
