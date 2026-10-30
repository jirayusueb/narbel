import { expect, test } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { okEmpty } from "../../../../shared/kernel/types/Result";
import type { BoardUseCases } from "../../ioc";
import { createMcpServer } from "./createMcpServer";

const connect = async (uc: Partial<BoardUseCases> = {}) => {
  // registration never touches the use cases; only calls do
  const server = createMcpServer(uc as BoardUseCases, { userId: "u1" });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
};

test("an MCP client sees every board tool and the drawing guide", async () => {
  const client = await connect();

  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).toSorted()).toEqual(
    [
      "add_comment",
      "add_elements",
      "add_image",
      "add_page",
      "align_elements",
      "connect",
      "create_board",
      "delete_elements",
      "delete_page",
      "distribute_elements",
      "edit_selection",
      "export_scene",
      "focus",
      "get_board",
      "get_board_image",
      "get_changes",
      "get_selection",
      "group_elements",
      "list_boards",
      "list_comments",
      "list_pages",
      "list_replies",
      "list_shared_boards",
      "rename_board",
      "rename_page",
      "list_viewers",
      "reply_comment",
      "resolve_comment",
      "search_boards",
      "select",
      "ungroup_elements",
      "update_element",
    ].toSorted()
  );
  expect(client.getInstructions()).toContain("add_image");
});

test("a tool whose use case returns nothing still answers the client", async () => {
  const client = await connect({
    deletePage: { execute: () => Promise.resolve(okEmpty()) },
  } as unknown as Partial<BoardUseCases>);
  const res = await client.callTool({
    name: "delete_page",
    arguments: { boardId: "b", pageId: "p" },
  });
  expect(res.isError).toBeUndefined();
});
