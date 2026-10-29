import { Elysia, t } from "elysia";

import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { BoardUseCases } from "../../ioc";
import { actorFrom, shareQuery } from "./actor";

const params = t.Object({ id: t.String() });
const titleBody = t.Object({ title: t.String({ maxLength: 1000 }) });

export const createBoardController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  new Elysia({ name: "board/http", prefix: "/api" })
    .use(betterAuth)
    .use(resultPlugin)
    .get("/boards", { auth: true }, async ({ user }) =>
      asWire(await uc.listBoards.execute({ userId: user.id }))
    )
    .get("/shared-boards", { auth: true }, async ({ user }) =>
      asWire(
        await uc.listSharedBoards.execute({
          userId: user.id,
          email: user.email,
        })
      )
    )
    .post(
      "/boards",
      { auth: true, body: titleBody },
      async ({ user, body, set }) => {
        set.status = 201;
        return asWire(
          await uc.createBoard.execute({ userId: user.id, title: body.title })
        );
      }
    )
    .get(
      "/boards/:id",
      { authOptional: true, params, query: shareQuery },
      async ({ user, request, params: { id } }) =>
        asWire(
          await uc.getBoard.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
          })
        )
    )
    .patch(
      "/boards/:id",
      { auth: true, params, body: titleBody },
      async ({ user, request, params: { id }, body }) =>
        asWire(
          await uc.renameBoard.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            title: body.title,
          })
        )
    )
    .delete(
      "/boards/:id",
      { auth: true, params },
      async ({ user, request, params: { id }, set }) => {
        set.status = 204;
        return asWire(
          await uc.deleteBoard.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
          })
        );
      }
    );
