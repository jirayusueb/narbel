import { Elysia, t } from "elysia";

import {
  actorFrom,
  shareQuery,
} from "../../../../shared/presentation/http/actor";
import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { BoardUseCases } from "../../ioc";

const params = t.Object({ id: t.String(), versionId: t.String() });

export const createBoardVersionController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  new Elysia({ name: "board/versions", prefix: "/api/boards/:id/versions" })
    .use(betterAuth)
    .use(resultPlugin)
    .get(
      "/",
      {
        authOptional: true,
        params: t.Object({ id: t.String() }),
        query: shareQuery,
      },
      async ({ user, request, params: { id } }) =>
        asWire(
          await uc.listBoardVersions.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
          })
        )
    )
    .get(
      "/:versionId",
      { authOptional: true, params, query: shareQuery },
      async ({ user, request, params: { id, versionId } }) =>
        asWire(
          await uc.getBoardVersion.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            versionId,
          })
        )
    )
    .post(
      "/:versionId/restore",
      { auth: true, params, query: shareQuery },
      async ({ user, request, params: { id, versionId } }) =>
        asWire(
          await uc.restoreBoardVersion.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            versionId,
          })
        )
    );
