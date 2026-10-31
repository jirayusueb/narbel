import { Elysia, t } from "elysia";

import { actorFrom } from "../../../../shared/presentation/http/actor";
import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { DrawingUseCases } from "../../ioc";
import { previewResponse } from "./previewResponse";

const PREVIEW_SIZE = 480;

export const createBoardPreviewController = (
  betterAuth: BetterAuthPlugin,
  uc: DrawingUseCases
) =>
  new Elysia({ name: "board/preview", prefix: "/api/boards" })
    .use(betterAuth)
    .use(resultPlugin)
    .get(
      "/:id/preview.png",
      {
        authOptional: true,
        params: t.Object({ id: t.String() }),
        query: t.Object({
          share: t.Optional(t.String()),
          v: t.Optional(t.String()),
        }),
      },
      async ({ user, request, params: { id } }) => {
        const result = await uc.renderBoardImage.execute({
          actor: actorFrom(request, user, id),
          boardId: id,
          maxSize: PREVIEW_SIZE,
        });
        return result.isErr() ? asWire(result) : previewResponse(result.value);
      }
    );
