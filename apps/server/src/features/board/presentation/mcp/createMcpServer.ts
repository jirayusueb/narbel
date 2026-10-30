import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor } from "../../application/BoardAccess";
import type { CommentDto } from "../../application/dtos/CommentDto";
import { roundCoord } from "../../application/dtos/SceneDto";
import {
  DEFAULT_MAX_SIZE,
  MAX_MAX_SIZE,
  MIN_MAX_SIZE,
} from "../../domain/rendering/sceneSvg";
import { SHAPE_TYPES } from "../../domain/shapes/ShapeRegistry";
import type { BoardUseCases } from "../../ioc";
import { MCP_INSTRUCTIONS } from "./instructions";

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
  x: z
    .number()
    .optional()
    .describe("Omit x and y to have the shape laid out for you"),
  y: z.number().optional(),
  width: z
    .number()
    .optional()
    .describe("Omit to fit the text (100x100 for an empty shape)"),
  height: z.number().optional(),
  text: elementText
    .optional()
    .describe(
      "Content of a text element, or the label centered inside a rectangle/ellipse/diamond"
    ),
  strokeColor: elementColor.optional().describe("Defaults to #1e1e1e"),
  backgroundColor: elementColor.optional().describe("Defaults to transparent"),
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
    text: elementText.describe(
      "Text element content, or a shape's label (empty string removes the label)"
    ),
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

const roundComment = (c: CommentDto): CommentDto => ({
  ...c,
  x: roundCoord(c.x),
  y: roundCoord(c.y),
});

export const createMcpServer = (uc: BoardUseCases, actor: Actor): McpServer => {
  const server = new McpServer(
    { name: "narbel", version: "0.2.0" },
    { instructions: MCP_INSTRUCTIONS }
  );
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
        "Get a board's title and the (non-deleted) elements of one page as compact JSON, bottom to top (later elements are drawn over earlier ones). A shape's label is its text; strokeColor/backgroundColor are omitted when they are the defaults (#1e1e1e / transparent).",
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
    "get_board_image",
    {
      description:
        "Render one page as a PNG you can look at: shapes, arrows, labels, text and images as drawn (simplified, not hand-drawn). The text block gives the page and the scene bounds in board coordinates, so the picture maps onto get_board's x/y. Use it to check layout and legibility after editing.",
      inputSchema: {
        boardId,
        pageId,
        maxSize: z
          .number()
          .int()
          .min(MIN_MAX_SIZE)
          .max(MAX_MAX_SIZE)
          .optional()
          .describe(
            `Pixels of the image's long side, default ${DEFAULT_MAX_SIZE}`
          ),
      },
    },
    async (input) => {
      const result = await uc.renderBoardImage.execute({
        actor,
        boardId: input.boardId,
        pageId: input.pageId,
        maxSize: input.maxSize,
      });
      if (result.isErr()) {
        return reply(result);
      }
      const { pageId: id, pageName: name, image } = result.value;
      if (!image) {
        return text({ pageId: id, pageName: name, empty: true });
      }
      const info = text({
        pageId: id,
        pageName: name,
        width: image.width,
        height: image.height,
        bounds: {
          x: roundCoord(image.bounds.x),
          y: roundCoord(image.bounds.y),
          width: roundCoord(image.bounds.width),
          height: roundCoord(image.bounds.height),
        },
      });
      return {
        content: [
          {
            type: "image" as const,
            data: Buffer.from(image.png).toString("base64"),
            mimeType: "image/png",
          },
          ...info.content,
        ],
      };
    }
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
    "connect",
    {
      description:
        "Draw an arrow from one existing element to another, bound at both ends so it stays attached when either moves. Returns the arrow id. The page is taken from the elements.",
      inputSchema: {
        boardId,
        from: elementId.describe("Element id the arrow starts at (tail)"),
        to: elementId.describe("Element id the arrow points to (head)"),
        pageId,
      },
    },
    async (input) =>
      reply(
        await uc.addBoardElements.execute({
          actor,
          boardId: input.boardId,
          pageId: input.pageId,
          shapes: [
            {
              type: "arrow",
              startElementId: input.from,
              endElementId: input.to,
            },
          ],
        })
      )
  );
  server.registerTool(
    "add_elements",
    {
      description:
        "Add shapes to a page; connected browsers see them live. Returns the new element ids. Put a label inside a rectangle/ellipse/diamond with text; the shape grows to fit it unless width/height are given. To connect two shapes, give them ids and add an arrow with startElementId/endElementId: the arrow is drawn edge to edge and stays attached when either shape moves (x/y/width/height on the arrow are then ignored). For a diagram, leave out x/y on the shapes: they are laid out as a flowchart along the arrows, to the right of the existing content.",
      inputSchema: {
        boardId,
        pageId,
        elements: z.array(shape).min(1).max(200),
        direction: z
          .enum(["down", "right"])
          .optional()
          .describe("Flow of the automatic layout; defaults to down"),
      },
    },
    async (input) =>
      reply(
        await uc.addBoardElements.execute({
          actor,
          boardId: input.boardId,
          pageId: input.pageId,
          shapes: input.elements,
          direction: input.direction,
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
    "focus",
    {
      description:
        "Point at elements while you explain them: every connected browser switches to the page of the first element, scrolls so the elements are in view and shows them outlined as an MCP selection. Also becomes the selection used by get_selection and edit_selection. Errors with NotFound when none of the ids exist.",
      inputSchema: { boardId, ids: z.array(z.string()).min(1).max(100) },
    },
    async (input) =>
      reply(
        await uc.selectElements.execute({
          actor,
          boardId: input.boardId,
          ids: input.ids,
          reveal: true,
        })
      )
  );
  server.registerTool(
    "get_changes",
    {
      description:
        "What people changed on a board since your last look: elements they added, updated or deleted in the browser, and comment activity (new threads, replies, edits, resolves). Call it without `since` first and keep the returned `cursor`; pass the latest cursor as `since` on every later call and keep the new one. omitted > 0 means more elements changed than are listed: call get_board for the full page. moreComments true means call again with the new cursor. Your own element edits are not reported; comments include your own replies. Not reported: elements removed by deleting a whole page, reopened or deleted comments, reactions.",
      inputSchema: {
        boardId,
        since: z
          .string()
          .max(4096)
          .optional()
          .describe("cursor from the previous get_changes; omit to start"),
      },
    },
    async (input) => {
      const result = await uc.getBoardChanges.execute({
        actor,
        boardId: input.boardId,
        since: input.since,
      });
      return result.isErr()
        ? reply(result)
        : text({
            ...result.value,
            comments: result.value.comments.map(roundComment),
          });
    }
  );
  server.registerTool(
    "search_boards",
    {
      description:
        "Search the boards you can open by title, element text and comments. Returns each matching board with up to 3 snippets (page and kind of match).",
      inputSchema: { query: z.string().max(200) },
    },
    async ({ query }) =>
      reply(
        await uc.searchBoards.execute({
          userId,
          email: actor.email ?? "",
          q: query,
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
    async (input) => {
      const result = await uc.listComments.execute({
        actor,
        boardId: input.boardId,
        pageId: input.pageId,
        status: input.status,
        cursor: input.cursor,
        limit: input.limit,
      });
      if (result.isErr()) {
        return reply(result);
      }
      return text({
        ...result.value,
        items: result.value.items.map(roundComment),
      });
    }
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
  server.registerTool(
    "list_viewers",
    {
      description:
        "Who has the board open in a browser right now (signed-in people by name, plus a count of anonymous share-link viewers).",
      inputSchema: { boardId },
    },
    async (input) =>
      reply(
        await uc.listBoardViewers.execute({ actor, boardId: input.boardId })
      )
  );
  return server;
};
