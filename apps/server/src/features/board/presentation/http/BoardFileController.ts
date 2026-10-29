import { Elysia, t } from "elysia";

import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { BoardUseCases } from "../../ioc";
import { actorFrom, shareQuery } from "./actor";

export const createBoardFileController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  new Elysia({ name: "board/files", prefix: "/api/boards/:id/files" })
    .use(betterAuth)
    .use(resultPlugin)
    .post(
      "/presign",
      {
        auth: true,
        params: t.Object({ id: t.String() }),
        query: shareQuery,
        body: t.Object({
          fileId: t.String({ maxLength: 200 }),
          mimeType: t.String({ maxLength: 100 }),
          size: t.Number(),
        }),
      },
      async ({ user, request, params: { id }, body, set }) => {
        set.status = 201;
        return asWire(
          await uc.presignBoardFileUpload.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            ...body,
          })
        );
      }
    )
    .get(
      "/:fileId",
      {
        authOptional: true,
        params: t.Object({ id: t.String(), fileId: t.String() }),
        query: shareQuery,
      },
      async ({ user, request, params: { id, fileId } }) => {
        const result = await uc.getBoardFile.execute({
          actor: actorFrom(request, user, id),
          boardId: id,
          fileId,
        });
        if (result.isErr()) {
          return asWire(result);
        }
        const { stream, mimeType } = result.value;
        // fileIds are content-addressed by Excalidraw, so the bytes behind one never change
        return new Response(stream, {
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": "private, max-age=31536000, immutable",
            // the client only reads bytes via fetch; never let an uploaded SVG run as a page here
            "Content-Security-Policy": "sandbox",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    );
