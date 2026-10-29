import { Elysia, t } from "elysia";

import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { BoardUseCases } from "../../ioc";
import { actorFrom, shareQuery } from "./actor";

const params = t.Object({ id: t.String() });
const commentParams = t.Object({ id: t.String(), commentId: t.String() });

export const createBoardCommentController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  new Elysia({ name: "board/comments", prefix: "/api/boards/:id/comments" })
    .use(betterAuth)
    .use(resultPlugin)
    .get(
      "/",
      {
        authOptional: true,
        params,
        query: t.Object({
          pageId: t.Optional(t.String()),
          share: t.Optional(t.String()),
        }),
      },
      async ({ user, request, params: { id }, query }) =>
        asWire(
          await uc.listComments.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            pageId: query.pageId,
          })
        )
    )
    .post(
      "/",
      {
        auth: true,
        params,
        query: shareQuery,
        body: t.Object({
          pageId: t.String({ maxLength: 200 }),
          x: t.Number(),
          y: t.Number(),
          body: t.String({ maxLength: 10_000 }),
          parentId: t.Optional(t.String()),
        }),
      },
      async ({ user, request, params: { id }, body, set }) => {
        set.status = 201;
        return asWire(
          await uc.addComment.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            ...body,
          })
        );
      }
    )
    .post(
      "/:commentId/resolve",
      { auth: true, params: commentParams, query: shareQuery },
      async ({ user, request, params: { id, commentId } }) =>
        asWire(
          await uc.resolveComment.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            commentId,
          })
        )
    )
    .delete(
      "/:commentId",
      { auth: true, params: commentParams, query: shareQuery },
      async ({ user, request, params: { id, commentId }, set }) => {
        set.status = 204;
        return asWire(
          await uc.deleteComment.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            commentId,
          })
        );
      }
    );
