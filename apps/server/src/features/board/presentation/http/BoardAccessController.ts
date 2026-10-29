import { Elysia, t } from "elysia";

import {
  asWire,
  errorBody,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { BoardUseCases } from "../../ioc";
import { actorFrom, shareQuery, unlockCookieName } from "./actor";

const params = t.Object({ id: t.String() });
const role = t.Union([t.Literal("editor"), t.Literal("viewer")]);
const UNLOCK_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export const createBoardAccessController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) =>
  new Elysia({ name: "board/access", prefix: "/api/boards/:id" })
    .use(betterAuth)
    .use(resultPlugin)
    .get(
      "/access",
      { auth: true, params },
      async ({ user, request, params: { id } }) =>
        asWire(
          await uc.getBoardAccess.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
          })
        )
    )
    .patch(
      "/access",
      {
        auth: true,
        params,
        body: t.Object({
          visibility: t.Optional(
            t.Union([
              t.Literal("private"),
              t.Literal("link"),
              t.Literal("password"),
            ])
          ),
          password: t.Optional(
            t.Union([t.String({ maxLength: 1000 }), t.Null()])
          ),
          shareTokenEnabled: t.Optional(t.Boolean()),
          shareRole: t.Optional(role),
          shareExpiresAt: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      },
      async ({ user, request, params: { id }, body }) =>
        asWire(
          await uc.updateBoardAccess.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            patch: body,
          })
        )
    )
    .delete(
      "/access/members/:member",
      { auth: true, params: t.Object({ id: t.String(), member: t.String() }) },
      async ({ user, request, params: { id, member }, set }) => {
        set.status = 204;
        return asWire(
          await uc.removeBoardMember.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            member,
          })
        );
      }
    )
    .get(
      "/members",
      { authOptional: true, params, query: shareQuery },
      async ({ user, request, params: { id } }) =>
        asWire(
          await uc.listBoardMembers.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
          })
        )
    )
    .post(
      "/invite",
      {
        auth: true,
        params,
        body: t.Object({ email: t.String({ maxLength: 320 }), role }),
      },
      async ({ user, request, params: { id }, body }) =>
        asWire(
          await uc.inviteBoardMember.execute({
            actor: actorFrom(request, user, id),
            boardId: id,
            email: body.email,
            role: body.role,
          })
        )
    )
    .post(
      "/unlock",
      { params, body: t.Object({ password: t.String({ maxLength: 1000 }) }) },
      async ({ request, server, params: { id }, body }) => {
        const forwarded = request.headers
          .get("x-forwarded-for")
          ?.split(",")[0]
          ?.trim();
        const ip =
          forwarded ?? server?.requestIP(request)?.address ?? "unknown";
        const result = await uc.unlockBoard.execute({
          boardId: id,
          password: body.password,
          attemptKey: `${id}:${ip}`,
        });
        if (result.isErr()) {
          const { code, message, details } = result.error;
          return Response.json(errorBody(code, message, details), {
            status: code === "NotFound" ? 404 : 403,
          });
        }
        const cookie = new Bun.Cookie(
          unlockCookieName(id),
          result.value.proof,
          {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            path: "/",
            maxAge: UNLOCK_MAX_AGE_SECONDS,
          }
        );
        return Response.json(
          { unlocked: true },
          { headers: { "Set-Cookie": cookie.serialize() } }
        );
      }
    );
