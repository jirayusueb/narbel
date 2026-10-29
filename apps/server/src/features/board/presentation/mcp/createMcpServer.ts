import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Result } from "../../../../shared/kernel/types/Result";
import { SHAPE_TYPES } from "../../domain/shapes/ShapeRegistry";
import type { BoardUseCases } from "../../ioc";

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

const reply = <T>(result: Result<T, AppError>) =>
  result.isOk()
    ? text(result.value)
    : {
        isError: true as const,
        content: [
          {
            type: "text" as const,
            text: `${result.error.code}: ${result.error.message}`,
          },
        ],
      };

// bounds keep a runaway agent from bloating the shared doc every browser downloads
const elementText = z.string().max(10_000);
const elementColor = z.string().max(32);

const shape = z.object({
  type: z.enum(SHAPE_TYPES),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: elementText.optional(),
  strokeColor: elementColor.optional(),
  backgroundColor: elementColor.optional(),
});

const patch = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    angle: z.number(),
    text: elementText,
    strokeColor: elementColor,
    backgroundColor: elementColor,
    opacity: z.number().min(0).max(100),
  })
  .partial();

const boardId = z
  .string()
  .describe("Board id from list_boards or create_board");

export const createMcpServer = (
  uc: BoardUseCases,
  userId: string
): McpServer => {
  const server = new McpServer({ name: "narbel", version: "0.1.0" });

  server.registerTool(
    "list_boards",
    { description: "List the boards you own, newest-updated first." },
    async () => reply(await uc.listBoards.execute({ userId }))
  );
  server.registerTool(
    "create_board",
    {
      description: "Create an empty board.",
      inputSchema: { title: z.string().describe("1 to 120 characters") },
    },
    async ({ title }) => reply(await uc.createBoard.execute({ userId, title }))
  );
  server.registerTool(
    "get_board",
    {
      description:
        "Get a board's title and its (non-deleted) elements as compact JSON.",
      inputSchema: { boardId },
    },
    async (input) =>
      reply(await uc.getBoardScene.execute({ userId, boardId: input.boardId }))
  );
  server.registerTool(
    "add_elements",
    {
      description:
        "Add shapes to a board; connected browsers see them live. Returns the new element ids.",
      inputSchema: { boardId, elements: z.array(shape).min(1).max(200) },
    },
    async (input) =>
      reply(
        await uc.addBoardElements.execute({
          userId,
          boardId: input.boardId,
          shapes: input.elements,
        })
      )
  );
  server.registerTool(
    "update_element",
    {
      description:
        "Change properties of one element (position, size, text, colors).",
      inputSchema: { boardId, id: z.string(), patch },
    },
    async (input) =>
      reply(
        await uc.updateBoardElement.execute({
          userId,
          boardId: input.boardId,
          id: input.id,
          patch: input.patch,
        })
      )
  );
  server.registerTool(
    "delete_elements",
    {
      description: "Delete elements by id.",
      inputSchema: { boardId, ids: z.array(z.string()).min(1).max(500) },
    },
    async (input) =>
      reply(
        await uc.deleteBoardElements.execute({
          userId,
          boardId: input.boardId,
          ids: input.ids,
        })
      )
  );
  return server;
};
