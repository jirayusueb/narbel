import { Elysia, t } from "elysia";

import { idempotencyPlugin } from "../../../../shared/presentation/plugins/idempotencyPlugin";
import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { BoardUseCases } from "../../ioc";
import { actorFrom, shareQuery } from "./actor";
import { previewResponse } from "./previewResponse";

const PREVIEW_SIZE = 480;

const params = t.Object({ id: t.String() });
const titleBody = t.Object({ title: t.String({ maxLength: 1000 }) });

export const createBoardController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  // the prefix must stay below /api/boards: betterAuth mounts a catch-all under the prefix of whoever uses it first
  new Elysia({ name: "board/http", prefix: "/api/boards" })
    .use(betterAuth)
    .use(resultPlugin)
    .use(idempotencyPlugin)
    .get("/", { auth: true }, async ({ user }) =>
      asWire(await uc.listBoards.execute({ userId: user.id }))
    )
    .get(
      "/search",
      { auth: true, query: t.Object({ q: t.String() }) },
      async ({ user, query }) =>
        asWire(
          await uc.searchBoards.execute({
            userId: user.id,
            email: user.email,
            q: query.q,
          })
        )
    )
    .post(
      "/",
      { auth: true, idempotent: true, body: titleBody },
      async ({ user, body, set }) => {
        set.status = 201;
        return asWire(
          await uc.createBoard.execute({ userId: user.id, title: body.title })
        );
      }
    )
    .get(
      "/:id",
      { authOptional: true, params, query: shareQuery },
      async ({ user, request, params: { id } }) =>
        asWire(
          await uc.getBoard.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
          })
        )
    )
    .get(
      "/:id/preview.png",
      {
        authOptional: true,
        params,
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
    )
    .patch(
      "/:id",
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
      "/:id",
      { auth: true, params },
      async ({ user, request, params: { id }, set }) => {
        set.status = 204;
        return asWire(
          await uc.trashBoard.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
          })
        );
      }
    )
    .get("/trash", { auth: true }, async ({ user }) =>
      asWire(await uc.listTrash.execute({ userId: user.id }))
    )
    .post(
      "/:id/restore",
      { auth: true, params },
      async ({ user, request, params: { id }, set }) => {
        set.status = 204;
        return asWire(
          await uc.restoreBoard.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
          })
        );
      }
    )
    .delete(
      "/trash/:id",
      { auth: true, params },
      async ({ user, request, params: { id }, set }) => {
        set.status = 204;
        return asWire(
          await uc.purgeBoard.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
          })
        );
      }
    );

export const createSharedBoardsController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  new Elysia({ name: "board/shared", prefix: "/api/shared-boards" })
    .use(betterAuth)
    .use(resultPlugin)
    .get("/", { auth: true }, async ({ user }) =>
      asWire(
        await uc.listSharedBoards.execute({
          userId: user.id,
          email: user.email,
        })
      )
    );
