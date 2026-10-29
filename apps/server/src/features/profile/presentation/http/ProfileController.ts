import { Elysia, t } from "elysia";

import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { ProfileUseCases } from "../../application/usecases/ProfileUseCases";

export const createProfileController = (
  betterAuth: BetterAuthPlugin,
  uc: ProfileUseCases
) =>
  new Elysia({ name: "profile/http" })
    .use(betterAuth)
    .use(resultPlugin)
    .get("/api/me", { auth: true }, async ({ user }) =>
      asWire(await uc.me(user.id))
    )
    .patch(
      "/api/me",
      { auth: true, body: t.Object({ name: t.String({ maxLength: 200 }) }) },
      async ({ user, body }) => asWire(await uc.rename(user.id, body.name))
    )
    .post(
      "/api/me/username",
      {
        auth: true,
        body: t.Object({ username: t.String({ maxLength: 100 }) }),
      },
      async ({ user, body, set }) => {
        set.status = 201;
        return asWire(await uc.claimUsername(user.id, body.username));
      }
    )
    .get(
      "/api/usernames/:username/available",
      { auth: true, params: t.Object({ username: t.String() }) },
      ({ params }) => uc.isUsernameAvailable(params.username)
    )
    .post(
      "/api/me/avatar/presign",
      {
        auth: true,
        body: t.Object({
          mimeType: t.String({ maxLength: 100 }),
          size: t.Number(),
        }),
      },
      ({ user, body, set }) => {
        set.status = 201;
        return asWire(uc.presignAvatar(user.id, body));
      }
    )
    .post(
      "/api/me/avatar",
      { auth: true, body: t.Object({ key: t.String({ maxLength: 300 }) }) },
      async ({ user, body }) =>
        asWire(await uc.confirmAvatar(user.id, body.key))
    )
    .delete("/api/me/avatar", { auth: true }, async ({ user }) =>
      asWire(await uc.removeAvatar(user.id))
    )
    .get(
      "/api/users/:id/avatar",
      { params: t.Object({ id: t.String() }) },
      async ({ params }) => {
        const result = await uc.avatarOf(params.id);
        if (result.isErr()) {
          return asWire(result);
        }
        return new Response(result.value.stream, {
          headers: {
            "Content-Type": result.value.mimeType,
            // the URL carries a version that changes with every upload
            "Cache-Control": "public, max-age=86400",
            "Content-Security-Policy": "sandbox",
            "X-Content-Type-Options": "nosniff",
            "Cross-Origin-Resource-Policy": "cross-origin",
          },
        });
      }
    );
