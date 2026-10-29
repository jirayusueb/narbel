import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@narbel/db";
import * as schema from "@narbel/db/schema/auth";
import { betterAuth } from "better-auth";

export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
}

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
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [
      apiKey({
        enableSessionForAPIKeys: true,
        // default is 10 requests/day, far too low for an agent driving a board
        rateLimit: { maxRequests: 600, timeWindow: 60_000 },
      }),
    ],
  });

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
