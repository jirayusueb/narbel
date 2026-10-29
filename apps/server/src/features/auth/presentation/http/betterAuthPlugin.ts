import type { createAuth } from "@narbel/auth";
import { Elysia, status } from "elysia";

import { errorBody } from "../../../../shared/presentation/plugins/resultPlugin";

type Auth = ReturnType<typeof createAuth>;

export const createBetterAuthPlugin = (auth: Auth) =>
  new Elysia({ name: "better-auth" }).mount(auth.handler).macro({
    auth: {
      // also resolves a user from the `x-api-key` header (apiKey plugin, enableSessionForAPIKeys)
      derive: async ({ request: { headers } }) => {
        const session = await auth.api.getSession({ headers });
        if (!session) {
          return status(
            401,
            errorBody("Unauthorized", "Authentication required")
          );
        }
        return { user: session.user, session: session.session };
      },
    },
  });

export type BetterAuthPlugin = ReturnType<typeof createBetterAuthPlugin>;
