import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor } from "../../application/BoardAccess";
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

const elementId = z
  .string()
  .regex(/^[\w-]{1,64}$/u, "letters, digits, _ or -, at most 64");

const shape = z.object({
  type: z.enum(SHAPE_TYPES),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: elementText.optional(),
  strokeColor: elementColor.optional(),
  backgroundColor: elementColor.optional(),
  id: elementId
    .optional()
    .describe(
      "Optional id you choose so arrows later in the same call can connect to this shape"
    ),
  startElementId: elementId
    .optional()
    .describe(
      "arrow/line only: id of the element the tail attaches to (on the page or in this call)"
    ),
  endElementId: elementId
    .optional()
    .describe("arrow/line only: id of the element the head attaches to"),
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
const pageId = z
  .string()
  .optional()
  .describe("Page id from list_pages; defaults to the first page");
const pageName = z.string().describe("1 to 80 characters");

export const createMcpServer = (uc: BoardUseCases, actor: Actor): McpServer => {
  const server = new McpServer({ name: "narbel", version: "0.2.0" });
  const userId = actor.userId ?? "";

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
        "Get a board's title and the (non-deleted) elements of one page as compact JSON.",
      inputSchema: { boardId, pageId },
    },
    async (input) =>
      reply(
        await uc.getBoardScene.execute({
          actor,
          boardId: input.boardId,
          pageId: input.pageId,
        })
      )
  );
  server.registerTool(
    "list_pages",
    {
      description: "List a board's pages in order.",
      inputSchema: { boardId },
    },
    async (input) =>
      reply(await uc.listPages.execute({ actor, boardId: input.boardId }))
  );
  server.registerTool(
    "add_page",
    {
      description: "Add a page to a board. Returns the new page.",
      inputSchema: { boardId, name: pageName },
    },
    async (input) =>
      reply(
        await uc.addPage.execute({
          actor,
          boardId: input.boardId,
          name: input.name,
        })
      )
  );
  server.registerTool(
    "rename_page",
    {
      description: "Rename a page.",
      inputSchema: { boardId, pageId: z.string(), name: pageName },
    },
    async (input) =>
      reply(
        await uc.renamePage.execute({
          actor,
          boardId: input.boardId,
          pageId: input.pageId,
          name: input.name,
        })
      )
  );
  server.registerTool(
    "delete_page",
    {
      description:
        "Delete a page and every element on it (nothing is moved). The last page cannot be deleted.",
      inputSchema: { boardId, pageId: z.string() },
    },
    async (input) =>
      reply(
        await uc.deletePage.execute({
          actor,
          boardId: input.boardId,
          pageId: input.pageId,
        })
      )
  );
  server.registerTool(
    "add_elements",
    {
      description:
        "Add shapes to a page; connected browsers see them live. Returns the new element ids. To connect two shapes, give them ids and add an arrow with startElementId/endElementId: the arrow is drawn edge to edge and stays attached when either shape moves (x/y/width/height on the arrow are then ignored).",
      inputSchema: {
        boardId,
        pageId,
        elements: z.array(shape).min(1).max(200),
      },
    },
    async (input) =>
      reply(
        await uc.addBoardElements.execute({
          actor,
          boardId: input.boardId,
          pageId: input.pageId,
          shapes: input.elements,
        })
      )
  );
  server.registerTool(
    "update_element",
    {
      description:
        "Change properties of one element (position, size, text, colors). Moving a shape re-routes the arrows attached to it. For an arrow/line, startElementId/endElementId reattach that end to another element, null detaches it.",
      inputSchema: {
        boardId,
        id: z.string(),
        patch,
        startElementId: elementId.nullable().optional(),
        endElementId: elementId.nullable().optional(),
      },
    },
    async (input) =>
      reply(
        await uc.updateBoardElement.execute({
          actor,
          boardId: input.boardId,
          id: input.id,
          patch: input.patch,
          rebind: {
            startElementId: input.startElementId,
            endElementId: input.endElementId,
          },
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
          actor,
          boardId: input.boardId,
          ids: input.ids,
        })
      )
  );
  server.registerTool(
    "get_selection",
    {
      description:
        "Get the elements currently selected on the board. Selection follows the client that changed its selection most recently; errors when no browser is connected.",
      inputSchema: { boardId },
    },
    async (input) =>
      reply(await uc.getSelection.execute({ actor, boardId: input.boardId }))
  );
  server.registerTool(
    "select",
    {
      description:
        "Select elements by id, shown to collaborators as an MCP selection and used as the newest selection by get_selection and edit_selection. Returns the selected elements.",
      inputSchema: { boardId, ids: z.array(z.string()).min(1).max(500) },
    },
    async (input) =>
      reply(
        await uc.selectElements.execute({
          actor,
          boardId: input.boardId,
          ids: input.ids,
        })
      )
  );
  server.registerTool(
    "edit_selection",
    {
      description:
        "Apply a patch (position, size, text, colors) to every element in the current selection. Selection follows the newest client selection, see get_selection.",
      inputSchema: { boardId, patch },
    },
    async (input) =>
      reply(
        await uc.editSelection.execute({
          actor,
          boardId: input.boardId,
          patch: input.patch,
        })
      )
  );
  server.registerTool(
    "list_comments",
    {
      description:
        "List comment threads of a board, newest first, with author, assignee, reactions and reply count. Page with nextCursor (pass it back as cursor).",
      inputSchema: {
        boardId,
        pageId: pageId.describe("Only this page; omit for the whole board"),
        status: z
          .enum(["open", "resolved", "all"])
          .optional()
          .describe("Defaults to open"),
        cursor: z
          .string()
          .optional()
          .describe("nextCursor of the previous call"),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (input) =>
      reply(
        await uc.listComments.execute({
          actor,
          boardId: input.boardId,
          pageId: input.pageId,
          status: input.status,
          cursor: input.cursor,
          limit: input.limit,
        })
      )
  );
  server.registerTool(
    "reply_comment",
    {
      description:
        "Reply to a comment thread as the owner of the API key. The thread author and assignee are notified like for any reply. Markdown, up to 2000 characters; @username mentions notify board members.",
      inputSchema: {
        boardId,
        commentId: z.string().describe("Id of a comment from list_comments"),
        body: z.string().describe("Reply text in markdown"),
      },
    },
    async (input) =>
      reply(
        await uc.replyToComment.execute({
          actor,
          boardId: input.boardId,
          commentId: input.commentId,
          body: input.body,
        })
      )
  );
  return server;
};
