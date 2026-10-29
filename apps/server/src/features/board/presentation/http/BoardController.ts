import { Elysia, t } from "elysia";

import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { BoardUseCases } from "../../ioc";

const params = t.Object({ id: t.String() });
const titleBody = t.Object({ title: t.String({ maxLength: 1000 }) });

export const createBoardController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  new Elysia({ name: "board/http", prefix: "/api/boards" })
    .use(betterAuth)
    .use(resultPlugin)
    .get("/", { auth: true }, async ({ user }) =>
      asWire(await uc.listBoards.execute({ userId: user.id }))
    )
    .post("/", { auth: true, body: titleBody }, async ({ user, body, set }) => {
      set.status = 201;
      return asWire(
        await uc.createBoard.execute({ userId: user.id, title: body.title })
      );
    })
    .get("/:id", { auth: true, params }, async ({ user, params: { id } }) =>
      asWire(await uc.getBoard.execute({ userId: user.id, boardId: id }))
    )
    .patch(
      "/:id",
      { auth: true, params, body: titleBody },
      async ({ user, params: { id }, body }) =>
        asWire(
          await uc.renameBoard.execute({
            userId: user.id,
            boardId: id,
            title: body.title,
          })
        )
    )
    .delete(
      "/:id",
      { auth: true, params },
      async ({ user, params: { id }, set }) => {
        set.status = 204;
        return asWire(
          await uc.deleteBoard.execute({ userId: user.id, boardId: id })
        );
      }
    );
