import { requireMcpAuth } from "@better-auth/mcp";
import { mcpResource } from "@narbel/auth";
import type { createAuth } from "@narbel/auth";
import { Elysia, status } from "elysia";

import { errorBody } from "../../../../shared/presentation/plugins/resultPlugin";

type Auth = ReturnType<typeof createAuth>;

interface McpUser {
  id: string;
  email: string;
  name: string;
}

export const createBetterAuthPlugin = (auth: Auth) => {
  // also resolves a user from the `x-api-key` header (apiKey plugin, enableSessionForAPIKeys)
  const sessionOf = ({ request: { headers } }: { request: Request }) =>
    auth.api.getSession({ headers });

  // `x-api-key` keeps working; otherwise a bearer OAuth token is verified, and a missing one
  // gets the RFC 9728 challenge that starts OAuth discovery in MCP clients
  const withMcpUser = async (
    request: Request,
    handler: (user: McpUser) => Promise<Response>
  ) => {
    if (request.headers.has("x-api-key")) {
      const session = await sessionOf({ request });
      return session
        ? handler(session.user)
        : Response.json(errorBody("Unauthorized", "Invalid API key"), {
            status: 401,
          });
    }
    return requireMcpAuth(
      auth,
      async (_, claims) => {
        const { internalAdapter } = await auth.$context;
        const user = claims.sub
          ? await internalAdapter.findUserById(claims.sub)
          : null;
        return user
          ? handler(user)
          : Response.json(errorBody("Unauthorized", "Unknown user"), {
              status: 401,
            });
      },
      { resource: mcpResource(auth.options.baseURL as string) }
    )(request);
  };

  return new Elysia({ name: "better-auth" })
    .mount(auth.handler)
    .decorate("withMcpUser", withMcpUser)
    .macro({
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
