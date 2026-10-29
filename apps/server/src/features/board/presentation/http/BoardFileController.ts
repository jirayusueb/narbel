import { Elysia, t } from "elysia";

import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { BoardUseCases } from "../../ioc";

export const createBoardFileController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  new Elysia({ name: "board/files", prefix: "/api/boards/:id/files" })
    .use(betterAuth)
    .use(resultPlugin)
    .post(
      "/",
      {
        auth: true,
        params: t.Object({ id: t.String() }),
        body: t.Object({ fileId: t.String(), file: t.File() }),
      },
      async ({ user, params: { id }, body, set }) => {
        set.status = 201;
        return asWire(
          await uc.uploadBoardFile.execute({
            userId: user.id,
            boardId: id,
            fileId: body.fileId,
            mimeType: body.file.type,
            size: body.file.size,
            read: async () => new Uint8Array(await body.file.arrayBuffer()),
          })
        );
      }
    )
    .get(
      "/:fileId",
      { auth: true, params: t.Object({ id: t.String(), fileId: t.String() }) },
      async ({ user, params: { id, fileId } }) => {
        const result = await uc.getBoardFile.execute({
          userId: user.id,
          boardId: id,
          fileId,
        });
        if (result.isErr()) {
          return asWire(result);
        }
        const { stream, mimeType, size } = result.value;
        // fileIds are content-addressed by Excalidraw, so the bytes behind one never change
        return new Response(stream, {
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(size),
            "Cache-Control": "private, max-age=31536000, immutable",
            // the client only reads bytes via fetch; never let an uploaded SVG run as a page here
            "Content-Security-Policy": "sandbox",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    );
