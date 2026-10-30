import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Actor } from "../../application/BoardAccess";
import { roundCoord } from "../../application/dtos/SceneDto";
import {
  DEFAULT_MAX_SIZE,
  MAX_MAX_SIZE,
  MIN_MAX_SIZE,
} from "../../domain/rendering/sceneSvg";
import { SHAPE_TYPES } from "../../domain/shapes/ShapeRegistry";
import type { BoardUseCases } from "../../ioc";
import { registerCollabTools } from "./collabTools";
import { DESIGN_GUIDE } from "./designGuide";
import { registerLayoutTools } from "./layoutTools";
import { registerMediaTools } from "./mediaTools";
import { style } from "./styleSchema";
import {
  boardId,
  elementId,
  elementText,
  pageId,
  reply,
  text,
} from "./toolKit";

/** Every Excalidraw element type a board can hold. */
const ELEMENT_TYPES = [
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "image",
  "frame",
  "magicframe",
  "iframe",
  "embeddable",
] as const;

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
      "Content of a text element, or the label of a rectangle/ellipse/diamond/arrow (an arrow's label sits on its midpoint). Lines take no text"
    ),
  ...style,
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
  name: z.string().max(200).optional().describe("frame only: its title"),
  frameId: elementId
    .optional()
    .describe(
      "Put this element in a frame (id of a frame on the page or in this call). Without x/y it is laid out inside the frame"
    ),
});

const patch = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    text: elementText.describe(
      "Text element content, or a shape's/arrow's label (empty string removes the label)"
    ),
    ...style,
    name: z.string().max(200).describe("frame title"),
    locked: z
      .boolean()
      .describe(
        "Locked elements refuse every change except {locked:false} and cannot be deleted"
      ),
  })
  .partial();

const pageName = z.string().describe("1 to 80 characters");

export const createMcpServer = (uc: BoardUseCases, actor: Actor): McpServer => {
  const server = new McpServer(
    { name: "narbel", version: "0.3.0" },
    { instructions: DESIGN_GUIDE }
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
        "Get a board's title and the (non-deleted) elements of one page as compact JSON, bottom to top (later elements are drawn over earlier ones). A shape's label is its text. Style fields (strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, roundness, opacity, angle in radians, fontSize/fontFamily/textAlign of text and labels, start/endArrowhead of arrows) are only listed when they differ from the defaults. Also reported: groupIds, frameId, a frame's name, locked. Filter a big page with within (elements whose drawn area overlaps the box), types and limit: total is the page's element count before filtering, truncated is true when more matched than limit.",
      inputSchema: {
        boardId,
        pageId,
        within: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number().min(0),
            height: z.number().min(0),
          })
          .optional()
          .describe("Only elements overlapping this box, in board coordinates"),
        types: z
          .array(z.enum(ELEMENT_TYPES))
          .min(1)
          .optional()
          .describe("Only these element types"),
        limit: z.number().int().min(1).max(1000).optional(),
      },
    },
    async (input) =>
      reply(
        await uc.getBoardScene.execute({
          actor,
          boardId: input.boardId,
          pageId: input.pageId,
          within: input.within,
          types: input.types,
          limit: input.limit,
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
    "add_elements",
    {
      description:
        "Add shapes to a page; connected browsers see them live. Returns the new element ids. Put a label inside a rectangle/ellipse/diamond/arrow with text; the shape grows to fit it unless width/height are given. To connect two shapes, give them ids and add an arrow with startElementId/endElementId (and text for a label on its midpoint): the arrow is drawn edge to edge and stays attached when either shape moves (x/y/width/height on the arrow are then ignored). Style fields (strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, roundness, opacity, angle in radians) apply to every type; fontSize, fontFamily, textAlign are for text and labels only, startArrowhead/endArrowhead for arrows only, and a field that does not apply to its element is an error. A frame (type frame, with name) either gets all of x/y/width/height or none, and then wraps the elements that name it in frameId. For a diagram, leave out x/y on the shapes: they are laid out as a flowchart along the arrows, to the right of the existing content. get_board_image ignores fillStyle, roughness and fontFamily.",
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
        "Change properties of one element (position, size, text, style, locked). Text fields (fontSize, fontFamily, textAlign) apply to a text element or to a shape's/arrow's label and refit it; startArrowhead/endArrowhead apply to arrows only; angle is radians; style fields that do not apply to the element are ignored. Moving a shape re-routes the arrows attached to it and their labels follow. A locked element accepts only {locked:false}. For an arrow/line, startElementId/endElementId reattach that end to another element, null detaches it.",
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
      description:
        "Delete elements by id. A deleted arrow takes its label along; a deleted frame releases its children. Locked elements are not deleted and are listed in locked.",
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
        "Apply a patch (position, size, text, style) to every element in the current selection; fields that do not apply to an element (e.g. endArrowhead on a rectangle) are skipped for it, and locked elements are skipped and listed in locked. Selection follows the newest client selection, see get_selection.",
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
        items: result.value.items.map((c) => ({
          ...c,
          x: roundCoord(c.x),
          y: roundCoord(c.y),
        })),
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
  registerCollabTools(server, uc, actor);
  registerMediaTools(server, uc, actor);
  registerLayoutTools(server, uc, actor);
  return server;
};
