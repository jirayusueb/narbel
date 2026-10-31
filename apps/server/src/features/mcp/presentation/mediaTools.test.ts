import { describe, expect, it } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerMediaTools } from "./mediaTools";
import type { McpUseCases } from "./toolKit";

const connect = async () => {
  const calls: unknown[] = [];
  const execute = (input: unknown) => {
    calls.push(input);
    return Promise.resolve({ isOk: () => true, value: {} });
  };
  const uc = {
    addBoardImage: { execute },
    exportBoardScene: { execute },
  } as unknown as McpUseCases;
  const server = new McpServer({ name: "t", version: "0" });
  registerMediaTools(server, uc, { userId: "owner" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, calls };
};

describe("registerMediaTools", () => {
  it("lists add_image and export_scene", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).toSorted()).toEqual([
      "add_image",
      "export_scene",
    ]);
  });

  it("decodes base64 and data URLs, and rejects anything else", async () => {
    const { client, calls } = await connect();
    const bytes = Buffer.from("abc!");
    const ok = await client.callTool({
      name: "add_image",
      arguments: {
        boardId: "b",
        data: `data:image/png;base64,${bytes.toString("base64")}`,
      },
    });
    expect(ok.isError).toBeFalsy();
    expect((calls[0] as { bytes: Buffer }).bytes.equals(bytes)).toBe(true);
    const bad = await client.callTool({
      name: "add_image",
      arguments: { boardId: "b", data: "not base64 !!" },
    });
    expect(bad.isError).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
