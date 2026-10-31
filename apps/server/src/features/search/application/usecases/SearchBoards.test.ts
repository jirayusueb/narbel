import { describe, expect, it } from "bun:test";

import type { ReadableBoard } from "../ports/IReadableBoards";
import type { RawMatch } from "../ports/ISearchIndex";
import { SearchBoards } from "./SearchBoards";

const board = (
  id: string,
  title: string,
  updatedAt: number,
  role: ReadableBoard["role"] = "owner"
): ReadableBoard => ({
  id,
  title,
  role,
  visibility: "private",
  createdAt: new Date(0),
  updatedAt: new Date(updatedAt),
});

const setup = (
  readable: ReadableBoard[],
  index: Record<string, RawMatch[]>
) => {
  const asked: string[][] = [];
  const search = new SearchBoards(
    { readableBoards: () => Promise.resolve(readable) },
    {
      matches: (boardIds, query) => {
        asked.push(boardIds);
        // the fake index holds only rows that contain the query, like the ILIKE it stands for
        return Promise.resolve(
          new Map(
            boardIds.flatMap((id) => {
              const rows = (index[id] ?? []).filter((m) =>
                query.matches(m.text)
              );
              return rows.length > 0 ? [[id, rows]] : [];
            })
          )
        );
      },
    }
  );
  const find = async (q: string) => {
    const result = await search.execute({ userId: "u", email: "u@x.io", q });
    return result.isOk() ? result.value : [];
  };
  return { find, asked };
};

describe("SearchBoards", () => {
  it("matches titles in memory without case or wildcards, then asks the index only about readable boards", async () => {
    const { find, asked } = setup(
      [board("a", "Road_map 100%", 1), board("b", "Other", 2)],
      { b: [{ kind: "text", text: "a ROAD sign", pageId: "p" }] }
    );
    expect((await find("road")).map((hit) => hit.board.id)).toEqual(["a", "b"]);
    expect(await find("d_m")).toHaveLength(1);
    expect(await find("d%m")).toHaveLength(0);
    expect(await find("100%")).toHaveLength(1);
    expect(asked.at(-1)).toEqual(["a", "b"]);
  });

  it("never returns a board the person cannot read, even if the index holds its text", async () => {
    const { find } = setup([board("mine", "Mine", 1)], {
      secret: [{ kind: "text", text: "launch codes", pageId: "p" }],
    });
    expect(await find("launch")).toEqual([]);
  });

  it("ranks title matches first, then the newest, and caps boards at 20", async () => {
    const readable = [
      board("old-title", "plan A", 1),
      board("new-text", "Notes", 50),
      board("new-title", "plan B", 10),
      ...Array.from({ length: 30 }, (_, i) => board(`t${i}`, "x", 20 + i)),
    ];
    const index = Object.fromEntries(
      readable.map((b): [string, RawMatch[]] => [
        b.id,
        b.title === "x" || b.id === "new-text"
          ? [{ kind: "text", text: "plan", pageId: "p" }]
          : [],
      ])
    );
    const hits = await setup(readable, index).find("plan");
    expect(hits).toHaveLength(20);
    expect(hits.slice(0, 3).map((hit) => hit.board.id)).toEqual([
      "new-title",
      "old-title",
      "new-text",
    ]);
  });

  it("keeps at most 3 matches per board, title before text before comments, with snippets", async () => {
    const { find } = setup([board("b", "Budget", 1, "viewer")], {
      b: [
        { kind: "text", text: "budget one", pageId: "p1" },
        { kind: "text", text: "budget two", pageId: "p2" },
        { kind: "comment", text: "budget?", pageId: "p1", commentId: "c1" },
      ],
    });
    const [hit] = await find("BUDGET");
    expect(hit?.board).toMatchObject({
      id: "b",
      role: "viewer",
      canWrite: false,
      shared: true,
      trashedAt: null,
    });
    expect(hit?.matches).toEqual([
      { kind: "title", snippet: "Budget" },
      { kind: "text", snippet: "budget one", pageId: "p1" },
      { kind: "text", snippet: "budget two", pageId: "p2" },
    ]);
  });

  it("does not search for a query under 2 characters", async () => {
    const { find, asked } = setup([board("a", "a", 1)], {});
    expect(await find(" a ")).toEqual([]);
    expect(asked).toEqual([]);
  });
});
