import { describe, expect, it } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerLayoutTools } from "./layoutTools";
import type { McpUseCases } from "./toolKit";

const connect = async () => {
  const calls: unknown[] = [];
  const execute = (input: unknown) => {
    calls.push(input);
    return Promise.resolve({ isOk: () => true, value: {} });
  };
  const uc = {
    groupElements: { group: execute, ungroup: execute },
    arrangeElements: { execute },
  } as unknown as McpUseCases;
  const server = new McpServer({ name: "t", version: "0" });
  registerLayoutTools(server, uc, { userId: "owner" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, calls };
};

describe("registerLayoutTools", () => {
  it("lists the four layout tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).toSorted()).toEqual([
      "align_elements",
      "distribute_elements",
      "group_elements",
      "ungroup_elements",
    ]);
  });

  it("maps edge and axis to an arrangement and enforces id counts", async () => {
    const { client, calls } = await connect();
    await client.callTool({
      name: "align_elements",
      arguments: { boardId: "b", ids: ["a", "b"], edge: "left" },
    });
    expect(calls[0]).toMatchObject({ how: { kind: "align", edge: "left" } });
    const few = await client.callTool({
      name: "distribute_elements",
      arguments: { boardId: "b", ids: ["a", "b"], axis: "horizontal" },
    });
    expect(few.isError).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
