import { describe, expect, it } from "bun:test";

import {
  newBoard,
  setupAccess,
} from "../../../boards/application/usecases/fakes";
import { CommentActivityFeed } from "../../../discussion/application/CommentActivityFeed";
import { FakeComments } from "../../../discussion/application/usecases/fakes";
import type { Comment } from "../../../discussion/domain/entities/Comment";
import { FakeScenes } from "./fakes";
import { GetBoardChanges, MAX_COMMENT_CHANGES } from "./GetBoardChanges";
import { SelectElements } from "./Selection";

const actor = { userId: "owner" };
const start = new Date("2026-01-01T00:00:00.000Z");
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

const comment = (id: string, patch: Partial<Comment> = {}): Comment => ({
  id,
  boardId: "b1",
  pageId: "page:main",
  x: 1.23456,
  y: 2,
  body: `body ${id}`,
  authorId: "owner",
  createdAt: at(1),
  editedAt: null,
  resolvedAt: null,
  resolvedById: null,
  assigneeId: null,
  parentId: null,
  ...patch,
});

const setup = () => {
  const access = { ...setupAccess(), scenes: new FakeScenes() };
  access.profiles.add("owner");
  const comments = new FakeComments();
  const usecase = new GetBoardChanges(
    access.policy,
    access.scenes,
    new CommentActivityFeed(comments, access.profiles),
    () => start
  );
  const call = async (since?: string) => {
    const result = await usecase.execute({ actor, boardId: "b1", since });
    if (result.isErr()) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    return result.value;
  };
  return { ...access, comments, usecase, call };
};

describe("GetBoardChanges", () => {
  it("starts a watch without changes, and the cursor works as the next since", async () => {
    const { call, comments } = setup();
    const first = await call();
    expect(first).toMatchObject({
      pages: [],
      omitted: 0,
      comments: [],
      moreComments: false,
    });
    await comments.save(comment("c1", { createdAt: at(5) }));
    const second = await call(first.cursor);
    expect(second.comments.map((c) => c.id)).toEqual(["c1"]);
  });

  it("returns comment activity after the cursor, oldest first, and nothing before it", async () => {
    const { call, comments } = setup();
    await comments.save(comment("old", { createdAt: at(-60) }));
    await comments.save(
      comment("edited", { createdAt: at(-30), editedAt: at(10) })
    );
    await comments.save(
      comment("reply", { createdAt: at(5), parentId: "old" })
    );
    await comments.save(
      comment("resolved", { createdAt: at(-20), resolvedAt: at(20) })
    );
    const { cursor } = await call();
    const changes = await call(cursor);
    expect(changes.comments.map((c) => c.id)).toEqual([
      "reply",
      "edited",
      "resolved",
    ]);
  });

  it("pages comment activity without skipping or repeating", async () => {
    const { call, comments } = setup();
    const { cursor } = await call();
    const total = MAX_COMMENT_CHANGES + 1;
    for (let i = 0; i < total; i += 1) {
      await comments.save(
        comment(`c${String(i).padStart(3, "0")}`, { createdAt: at(1 + i) })
      );
    }
    const first = await call(cursor);
    expect(first.moreComments).toBe(true);
    expect(first.comments).toHaveLength(MAX_COMMENT_CHANGES);
    const second = await call(first.cursor);
    expect(second.moreComments).toBe(false);
    expect(second.comments.map((c) => c.id)).toEqual([
      `c${String(MAX_COMMENT_CHANGES).padStart(3, "0")}`,
    ]);
  });

  it("rejects a garbage or foreign cursor with Validation and hides the board from non-members", async () => {
    const { usecase, call, boards } = setup();
    boards.rows.set("b2", newBoard("b2"));
    const minted = (await call()).cursor;
    const rejected = [
      await usecase.execute({ actor, boardId: "b2", since: minted }),
      await usecase.execute({ actor, boardId: "b1", since: "garbage" }),
      await usecase.execute({
        actor,
        boardId: "b1",
        since: minted.slice(0, -4),
      }),
    ];
    for (const result of rejected) {
      expect(result.isErr() && result.error.code).toBe("ValidationFailed");
    }
    const stranger = await usecase.execute({
      actor: { userId: "stranger" },
      boardId: "b1",
    });
    expect(stranger.isErr() && stranger.error.code).toBe("NotFound");
  });
});

const fakeScene = (scenes: FakeScenes) => {
  const base = { type: "rectangle", version: 1, versionNonce: 1, x: 0, y: 0 };
  scenes.pageList.push({ id: "page:two", name: "Two" });
  scenes.elements.set("page:main:on1", { ...base, id: "on1" });
  scenes.elements.set("page:two:on2", { ...base, id: "on2" });
  scenes.elements.set("page:two:dead", {
    ...base,
    id: "dead",
    isDeleted: true,
  });
};

describe("focus", () => {
  it("selects, publishes the page of the first live element and asks viewers to reveal", async () => {
    const { policy, scenes } = { ...setupAccess(), scenes: new FakeScenes() };
    fakeScene(scenes);
    const result = await new SelectElements(policy, scenes).execute({
      actor,
      boardId: "b1",
      ids: ["ghost", "on2", "on1"],
      reveal: true,
    });
    expect(result.isOk() && result.value.ids).toEqual(["on2", "on1"]);
    expect(scenes.lastSelection).toEqual({
      pageId: "page:two",
      ids: ["on2", "on1"],
      reveal: true,
    });
  });

  it("is NotFound when no id is live, and publishes nothing", async () => {
    const { policy, scenes } = { ...setupAccess(), scenes: new FakeScenes() };
    fakeScene(scenes);
    const result = await new SelectElements(policy, scenes).execute({
      actor,
      boardId: "b1",
      ids: ["ghost", "dead"],
      reveal: true,
    });
    expect(result.isErr() && result.error.code).toBe("NotFound");
    expect(scenes.lastSelection).toBeUndefined();
  });

  it("select sets the page but never asks for a reveal", async () => {
    const { policy, scenes } = { ...setupAccess(), scenes: new FakeScenes() };
    fakeScene(scenes);
    await new SelectElements(policy, scenes).execute({
      actor,
      boardId: "b1",
      ids: ["on1"],
    });
    expect(scenes.lastSelection).toEqual({
      pageId: "page:main",
      ids: ["on1"],
      reveal: false,
    });
  });
});
