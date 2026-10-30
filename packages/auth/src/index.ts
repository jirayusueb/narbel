import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { mcp } from "@better-auth/mcp";
import type { Database } from "@narbel/db";
import * as schema from "@narbel/db/schema/auth";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";

export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
}

export const MCP_PATH = "/mcp";

export const mcpResource = (apiOrigin: string) => `${apiOrigin}${MCP_PATH}`;

export const createAuth = (
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = []
) =>
  betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      // https deploys put web and API on different sites (SameSite=None needs Secure);
      // plain-http deploys (IP:port) are same-site, where Lax works and Secure would drop the cookie
      defaultCookieAttributes: env.BETTER_AUTH_URL.startsWith("https:")
        ? { sameSite: "none", secure: true, httpOnly: true }
        : { sameSite: "lax", secure: false, httpOnly: true },
    },
    // oauth-provider issues its own tokens through /oauth2/token; the jwt plugin's /token must stay off
    disabledPaths: ["/token"],
    plugins: [
      jwt(),
      mcp({
        loginPage: `${env.CORS_ORIGIN}/login`,
        consentPage: `${env.CORS_ORIGIN}/consent`,
        resource: mcpResource(env.BETTER_AUTH_URL),
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
      }),
      apiKey({
        enableSessionForAPIKeys: true,
        // default is 10 requests/day, far too low for an agent driving a board
        rateLimit: { maxRequests: 600, timeWindow: 60_000 },
      }),
    ],
  });

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
