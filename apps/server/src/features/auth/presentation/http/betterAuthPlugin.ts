import type { createAuth } from "@narbel/auth";
import { Elysia, status } from "elysia";

import { errorBody } from "../../../../shared/presentation/plugins/resultPlugin";

type Auth = ReturnType<typeof createAuth>;

export const createBetterAuthPlugin = (auth: Auth) => {
  // also resolves a user from the `x-api-key` header (apiKey plugin, enableSessionForAPIKeys)
  const sessionOf = ({ request: { headers } }: { request: Request }) =>
    auth.api.getSession({ headers });

  return new Elysia({ name: "better-auth" }).mount(auth.handler).macro({
    auth: {
      derive: async (context) => {
        const session = await sessionOf(context);
        if (!session) {
          return status(
            401,
            errorBody("Unauthorized", "Authentication required")
          );
        }
        return { user: session.user, session: session.session };
      },
    },
    // for routes that also accept anonymous callers holding a share link or unlock cookie
    authOptional: {
      derive: async (context) => {
        const session = await sessionOf(context);
        return { user: session?.user ?? null };
      },
    },
  });
};

export type BetterAuthPlugin = ReturnType<typeof createBetterAuthPlugin>;
