import { describe, expect, test } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ok } from "../../../../shared/kernel/types/Result";
import type { BoardUseCases } from "../../ioc";
import { registerCollabTools } from "./collabTools";
import { DESIGN_GUIDE } from "./designGuide";

const FINAL_TOOLS = [
  "list_boards",
  "create_board",
  "get_board",
  "get_board_image",
  "list_pages",
  "add_page",
  "rename_page",
  "delete_page",
  "add_elements",
  "update_element",
  "delete_elements",
  "get_selection",
  "select",
  "edit_selection",
  "list_comments",
  "reply_comment",
  "list_replies",
  "add_comment",
  "resolve_comment",
  "list_shared_boards",
  "search_boards",
  "rename_board",
  "group_elements",
  "ungroup_elements",
  "align_elements",
  "distribute_elements",
  "export_scene",
  "add_image",
];

const connect = async () => {
  const calls: Record<string, unknown>[] = [];
  const fake = {
    listReplies: { execute: () => Promise.resolve(ok({ items: [] })) },
    addComment: {
      execute: (input: Record<string, unknown>) => {
        calls.push(input);
        return Promise.resolve(ok({ id: "c1" }));
      },
    },
    resolveComment: {
      execute: (input: Record<string, unknown>) => {
        calls.push(input);
        return Promise.resolve(ok({ id: "c1" }));
      },
    },
    listSharedBoards: { execute: () => Promise.resolve(ok([])) },
    searchBoards: { execute: () => Promise.resolve(ok([])) },
    renameBoard: { execute: () => Promise.resolve(ok({})) },
    listPages: {
      execute: () => Promise.resolve(ok([{ id: "page:main", name: "Page 1" }])),
    },
  } as unknown as BoardUseCases;
  const server = new McpServer({ name: "t", version: "0" });
  registerCollabTools(server, fake, { userId: "u1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, calls };
};

describe("collab tools", () => {
  test("registers exactly the six collaboration tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).toSorted()).toEqual([
      "add_comment",
      "list_replies",
      "list_shared_boards",
      "rename_board",
      "resolve_comment",
      "search_boards",
    ]);
  });

  test("add_comment on an unknown page explains the fix and writes nothing", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({
      name: "add_comment",
      arguments: { boardId: "b", pageId: "nope", x: 1, y: 2, body: "hi" },
    });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("list_pages");
    expect(calls).toEqual([]);
  });

  test("add_comment on a known page reaches the use case", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({
      name: "add_comment",
      arguments: { boardId: "b", pageId: "page:main", x: 1, y: 2, body: "hi" },
    });
    expect(res.isError).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  test("resolve_comment resolves unless told to reopen", async () => {
    const { client, calls } = await connect();
    await client.callTool({
      name: "resolve_comment",
      arguments: { boardId: "b", commentId: "c1" },
    });
    await client.callTool({
      name: "resolve_comment",
      arguments: { boardId: "b", commentId: "c1", resolve: false },
    });
    expect(calls.map((c) => c.resolve)).toEqual([true, false]);
  });
});

describe("DESIGN_GUIDE", () => {
  test("names every final tool and no other", () => {
    // `select` has no underscore, so the snake_case scan cannot see it
    const named = new Set(DESIGN_GUIDE.match(/\b[a-z]+(?:_[a-z]+)+\b/gu));
    expect(DESIGN_GUIDE).toContain("select ");
    expect([...named].toSorted()).toEqual(
      FINAL_TOOLS.filter((t) => t !== "select").toSorted()
    );
  });

  test("stays small enough for server instructions", () => {
    expect(DESIGN_GUIDE.length).toBeLessThan(5000);
  });
});
