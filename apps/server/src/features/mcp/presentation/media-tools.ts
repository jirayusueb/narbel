import { z } from "zod";

import { UploadRules } from "../../drawing";
import { boardId, elementId, pageId, reply } from "./tool-kit";
import type { ToolRegistrar } from "./tool-kit";

const MAX_BASE64_LENGTH = Math.ceil(UploadRules.MAX_INLINE_IMAGE_BYTES / 3) * 4;
const DATA_URL = /^data:[^,]*;base64,/u;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const imageData = z
  .string()
  .max(MAX_BASE64_LENGTH + 100)
  .transform((value, ctx) => {
    const base64 = value.replace(DATA_URL, "");
    if (base64.length > MAX_BASE64_LENGTH || !BASE64.test(base64)) {
      ctx.addIssue({
        code: "custom",
        message: `must be base64 (or a base64 data: URL) of at most ${UploadRules.MAX_INLINE_IMAGE_BYTES} bytes`,
      });
      return z.NEVER;
    }
    return Buffer.from(base64, "base64");
  })
  .describe(
    "Image bytes as base64 or a base64 data: URL; png, jpeg, gif, webp or svg, at most 700 KiB decoded"
  );

const length = z.number().positive().finite();

export const registerMediaTools: ToolRegistrar = (server, uc, actor) => {
  server.registerTool(
    "add_image",
    {
      description:
        "Place an image on a page from base64 bytes (png, jpeg, gif, webp or svg, at most 700 KiB decoded and 16 million declared pixels). The type and natural size are read from the bytes. Without width/height the image keeps its natural size, shrunk so its long side is at most 800; give one side to keep the aspect ratio. Without x/y it goes to the right of the existing content, or, with frameId, inside that frame after its children (the frame grows to fit it unless it is locked). An image that ends up not touching its frame is stored without frameId. Returns the element id, the file id (SHA-1 of the bytes, so the same image twice is stored once), and the size used.",
      inputSchema: {
        boardId,
        pageId,
        data: imageData,
        x: z.number().finite().optional(),
        y: z.number().finite().optional(),
        width: length.optional(),
        height: length.optional(),
        id: elementId.optional(),
        frameId: elementId
          .optional()
          .describe("Id of a frame on the page to place the image in"),
      },
    },
    async ({ data, ...input }) =>
      reply(await uc.addBoardImage.execute({ actor, bytes: data, ...input }))
  );
  server.registerTool(
    "add_artifact",
    {
      description:
        "Place an HTML or Markdown file on a page as a live box that people can open on the board: HTML runs its scripts (in a sandbox, after a viewer clicks it), Markdown renders as formatted text. Content is the file's text, at most 1 MiB as UTF-8. Without width/height the box is 640x480. Without x/y it goes to the right of the existing content, or, with frameId, inside that frame after its children. Returns the element id and the file id (SHA-1 of the text, so the same file twice is stored once). get_board lists it as type iframe with its name and format; get_board_image draws it as a labelled box.",
      inputSchema: {
        boardId,
        pageId,
        name: z
          .string()
          .min(1)
          .max(200)
          .describe("File name shown on the box, e.g. report.html"),
        format: z.enum(["html", "markdown"]),
        content: z.string().min(1).describe("The file's full text"),
        x: z.number().finite().optional(),
        y: z.number().finite().optional(),
        width: length.optional(),
        height: length.optional(),
        id: elementId.optional(),
        frameId: elementId
          .optional()
          .describe("Id of a frame on the page to place the artifact in"),
      },
    },
    async (input) =>
      reply(await uc.addBoardArtifact.execute({ actor, ...input }))
  );
  server.registerTool(
    "export_scene",
    {
      description:
        "Export a page as an Excalidraw (.excalidraw) JSON document with live elements in z-order. Set includeFiles to embed the page's images as data URLs, up to 8 MiB in all; files that do not fit or are missing are listed in omittedFiles. Without includeFiles image elements are exported without their bytes.",
      inputSchema: {
        boardId,
        pageId,
        includeFiles: z.boolean().optional(),
      },
    },
    async (input) =>
      reply(await uc.exportBoardScene.execute({ actor, ...input }))
  );
};
