import { Elysia, t } from "elysia";

import {
  actorFrom,
  shareQuery,
} from "../../../../shared/presentation/http/actor";
import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/result-plugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { DrawingUseCases } from "../../ioc";

const coord = t.Number();
const length = t.Number({ exclusiveMinimum: 0 });

export const createBoardArtifactController = (
  betterAuth: BetterAuthPlugin,
  uc: DrawingUseCases
) =>
  new Elysia({ name: "board/artifacts", prefix: "/api/boards/:id/artifacts" })
    .use(betterAuth)
    .use(resultPlugin)
    .post(
      "/",
      {
        auth: true,
        params: t.Object({ id: t.String() }),
        query: shareQuery,
        // format, name and size are refused by the use case, so web and MCP get the same typed errors
        body: t.Object({
          name: t.String(),
          format: t.String(),
          content: t.String(),
          pageId: t.Optional(t.String()),
          x: t.Optional(coord),
          y: t.Optional(coord),
          width: t.Optional(length),
          height: t.Optional(length),
        }),
      },
      async ({ user, request, params: { id }, body, set }) => {
        set.status = 201;
        return asWire(
          await uc.addBoardArtifact.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            ...body,
          })
        );
      }
    );
