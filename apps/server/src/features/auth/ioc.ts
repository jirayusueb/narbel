import type { createAuth } from "@narbel/auth";
import { Elysia } from "elysia";

import { createBetterAuthPlugin } from "./presentation/http/betterAuthPlugin";
import { createMeController } from "./presentation/http/MeController";

export interface AuthDeps {
  auth: ReturnType<typeof createAuth>;
}

export const createAuthModule = ({ auth }: AuthDeps) => {
  const betterAuth = createBetterAuthPlugin(auth);
  return new Elysia({ name: "feature/auth" })
    .use(betterAuth)
    .use(createMeController(betterAuth));
};

export type AuthModule = ReturnType<typeof createAuthModule>;
