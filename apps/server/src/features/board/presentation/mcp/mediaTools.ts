import { z } from "zod";

import { MAX_INLINE_IMAGE_BYTES } from "../../domain/rules/UploadRules";
import { boardId, elementId, pageId, reply } from "./toolKit";
import type { ToolRegistrar } from "./toolKit";

const MAX_BASE64_LENGTH = Math.ceil(MAX_INLINE_IMAGE_BYTES / 3) * 4;
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
        message: `must be base64 (or a base64 data: URL) of at most ${MAX_INLINE_IMAGE_BYTES} bytes`,
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
        "Place an image on a page from base64 bytes (png, jpeg, gif, webp or svg, at most 700 KiB decoded). The type and natural size are read from the bytes. Without width/height the image keeps its natural size, shrunk so its long side is at most 800; give one side to keep the aspect ratio. Without x/y it goes to the right of the existing content, or, with frameId, inside that frame after its children (the frame grows to fit it). Returns the element id, the file id (SHA-1 of the bytes, so the same image twice is stored once), and the size used.",
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
    "export_scene",
    {
      description:
        "Export a page as an Excalidraw (.excalidraw) JSON document with live elements in z-order. Set includeFiles to embed the page's images as data URLs; without it image elements are exported without their bytes.",
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
