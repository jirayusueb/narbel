import { Elysia, t } from "elysia";

import { idempotencyPlugin } from "../../../../shared/presentation/plugins/idempotencyPlugin";
import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { BoardUseCases } from "../../ioc";
import { actorFrom, shareQuery } from "./actor";

const params = t.Object({ id: t.String() });
const commentParams = t.Object({ id: t.String(), commentId: t.String() });
const body = t.Object({ body: t.String({ maxLength: 10_000 }) });
const paging = {
  cursor: t.Optional(t.String({ maxLength: 200 })),
  limit: t.Optional(t.Numeric()),
};

export const createBoardCommentController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  new Elysia({ name: "board/comments", prefix: "/api/boards/:id/comments" })
    .use(betterAuth)
    .use(resultPlugin)
    .use(idempotencyPlugin)
    .get(
      "/",
      {
        authOptional: true,
        params,
        query: t.Object({
          ...paging,
          share: t.Optional(t.String()),
          pageId: t.Optional(t.String()),
          status: t.Optional(
            t.Union([
              t.Literal("open"),
              t.Literal("resolved"),
              t.Literal("all"),
            ])
          ),
        }),
      },
      async ({ user, request, params: { id }, query }) =>
        asWire(
          await uc.listComments.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            pageId: query.pageId,
            status: query.status,
            cursor: query.cursor,
            limit: query.limit,
          })
        )
    )
    .post(
      "/",
      {
        auth: true,
        idempotent: true,
        params,
        query: shareQuery,
        body: t.Object({
          pageId: t.String({ maxLength: 200 }),
          x: t.Number(),
          y: t.Number(),
          body: t.String({ maxLength: 10_000 }),
          assigneeId: t.Optional(t.String()),
        }),
      },
      async ({ user, request, params: { id }, body: input, set }) => {
        set.status = 201;
        return asWire(
          await uc.addComment.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            ...input,
          })
        );
      }
    )
    .get(
      "/:commentId/replies",
      {
        authOptional: true,
        params: commentParams,
        query: t.Object({ ...paging, share: t.Optional(t.String()) }),
      },
      async ({ user, request, params: { id, commentId }, query }) =>
        asWire(
          await uc.listReplies.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            commentId,
            cursor: query.cursor,
            limit: query.limit,
          })
        )
    )
    .post(
      "/:commentId/replies",
      {
        auth: true,
        idempotent: true,
        params: commentParams,
        query: shareQuery,
        body,
      },
      async ({
        user,
        request,
        params: { id, commentId },
        body: input,
        set,
      }) => {
        set.status = 201;
        return asWire(
          await uc.replyToComment.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            commentId,
            body: input.body,
          })
        );
      }
    )
    .patch(
      "/:commentId",
      { auth: true, params: commentParams, query: shareQuery, body },
      async ({ user, request, params: { id, commentId }, body: input }) =>
        asWire(
          await uc.editComment.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            commentId,
            body: input.body,
          })
        )
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
            resolve: true,
          })
        )
    )
    .post(
      "/:commentId/reopen",
      { auth: true, params: commentParams, query: shareQuery },
      async ({ user, request, params: { id, commentId } }) =>
        asWire(
          await uc.resolveComment.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            commentId,
            resolve: false,
          })
        )
    )
    .put(
      "/:commentId/assignee",
      {
        auth: true,
        params: commentParams,
        query: shareQuery,
        body: t.Object({ assigneeId: t.Union([t.String(), t.Null()]) }),
      },
      async ({ user, request, params: { id, commentId }, body: input }) =>
        asWire(
          await uc.assignComment.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            commentId,
            assigneeId: input.assigneeId,
          })
        )
    )
    .put(
      "/:commentId/reactions/:emoji",
      {
        auth: true,
        params: t.Object({
          id: t.String(),
          commentId: t.String(),
          emoji: t.String({ maxLength: 32 }),
        }),
        query: shareQuery,
      },
      async ({ user, request, params: { id, commentId, emoji } }) =>
        asWire(
          await uc.setCommentReaction.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            commentId,
            emoji,
            present: true,
          })
        )
    )
    .delete(
      "/:commentId/reactions/:emoji",
      {
        auth: true,
        params: t.Object({
          id: t.String(),
          commentId: t.String(),
          emoji: t.String({ maxLength: 32 }),
        }),
        query: shareQuery,
      },
      async ({ user, request, params: { id, commentId, emoji } }) =>
        asWire(
          await uc.setCommentReaction.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            commentId,
            emoji,
            present: false,
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
