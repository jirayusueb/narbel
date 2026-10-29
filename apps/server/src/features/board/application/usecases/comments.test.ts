import { describe, expect, it } from "bun:test";

import { newComment } from "../../domain/entities/Comment";
import { AddComment } from "./AddComment";
import { DeleteComment } from "./DeleteComment";
import { ListComments } from "./ListComments";
import { ResolveComment } from "./ResolveComment";
import { ids, setupAccess } from "./fakes";

const base = { id: "c", boardId: "b1", authorId: "u", authorName: "U", parentId: null };

describe("comment validation", () => {
  it("trims and accepts 1 to 2000 characters", () => {
    const ok = newComment({ ...base, pageId: "p", x: 1, y: 2, body: "  hi  " }, new Date());
    expect(ok.isOk() && ok.value.body).toBe("hi");
    expect(newComment({ ...base, pageId: "p", x: 1, y: 2, body: "a".repeat(2000) }, new Date()).isOk()).toBe(true);
  });

  it("rejects empty, oversized, non-finite and pageless comments", () => {
    const bad = (patch: object) =>
      newComment({ ...base, pageId: "p", x: 1, y: 2, body: "ok", ...patch }, new Date()).isErr();
    expect(bad({ body: "   " })).toBe(true);
    expect(bad({ body: "a".repeat(2001) })).toBe(true);
    expect(bad({ x: Number.NaN })).toBe(true);
    expect(bad({ y: Number.POSITIVE_INFINITY })).toBe(true);
    expect(bad({ pageId: "" })).toBe(true);
  });
});

describe("comment use cases", () => {
  const setup = () => {
    const s = setupAccess();
    s.grants.members.push(
      { boardId: "b1", userId: "ed", email: "ed@x.io", name: "Ed", role: "editor" },
      { boardId: "b1", userId: "vi", email: "vi@x.io", name: "Vi", role: "viewer" }
    );
    return {
      ...s,
      add: new AddComment(s.guard, s.comments, ids),
      list: new ListComments(s.guard, s.comments),
      resolve: new ResolveComment(s.guard, s.comments),
      del: new DeleteComment(s.guard, s.comments),
    };
  };
  const put = { boardId: "b1", pageId: "page:main", x: 10, y: 20, body: "hello" };

  it("lets writers comment, lists per page, and refuses viewers and anonymous callers", async () => {
    const { add, list } = setup();
    const created = await add.execute({ ...put, actor: { userId: "ed", name: "Ed" } });
    expect(created.isOk() && created.value).toMatchObject({ authorId: "ed", authorName: "Ed", resolvedAt: null });
    const viewer = await add.execute({ ...put, actor: { userId: "vi" } });
    expect(viewer.isErr() && viewer.error.code).toBe("Forbidden");
    const stranger = await add.execute({ ...put, actor: { userId: "zz" } });
    expect(stranger.isErr() && stranger.error.code).toBe("NotFound");
    const mine = await list.execute({ actor: { userId: "vi" }, boardId: "b1", pageId: "page:main" });
    expect(mine.isOk() && mine.value).toHaveLength(1);
    const other = await list.execute({ actor: { userId: "vi" }, boardId: "b1", pageId: "page:two" });
    expect(other.isOk() && other.value).toHaveLength(0);
  });

  it("rejects a reply to an unknown parent", async () => {
    const { add } = setup();
    const result = await add.execute({ ...put, actor: { userId: "ed" }, parentId: "ghost" });
    expect(result.isErr() && result.error.code).toBe("NotFound");
  });

  it("resolves idempotently", async () => {
    const { add, resolve } = setup();
    const created = await add.execute({ ...put, actor: { userId: "ed" } });
    const commentId = (created.isOk() && created.value.id) || "";
    const first = await resolve.execute({ actor: { userId: "ed" }, boardId: "b1", commentId });
    const again = await resolve.execute({ actor: { userId: "owner" }, boardId: "b1", commentId });
    expect(first.isOk() && first.value.resolvedAt).not.toBeNull();
    expect(again.isOk() && again.value.resolvedAt).toBe(first.isOk() ? first.value.resolvedAt : "");
  });

  it("deletes only for the author or the owner", async () => {
    const { add, del, comments } = setup();
    const created = await add.execute({ ...put, actor: { userId: "ed" } });
    const commentId = (created.isOk() && created.value.id) || "";
    const viewer = await del.execute({ actor: { userId: "vi" }, boardId: "b1", commentId });
    expect(viewer.isErr() && viewer.error.code).toBe("Forbidden");
    expect(comments.rows.size).toBe(1);
    expect((await del.execute({ actor: { userId: "owner" }, boardId: "b1", commentId })).isOk()).toBe(true);
    expect(comments.rows.size).toBe(0);
  });
});
