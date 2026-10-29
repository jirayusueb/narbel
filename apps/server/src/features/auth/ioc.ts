import type { createAuth } from "@narbel/auth";
import { Elysia } from "elysia";

import { createBetterAuthPlugin } from "./presentation/http/betterAuthPlugin";

export interface AuthDeps {
  auth: ReturnType<typeof createAuth>;
}

export const createAuthModule = ({ auth }: AuthDeps) =>
  new Elysia({ name: "feature/auth" }).use(createBetterAuthPlugin(auth));

export type AuthModule = ReturnType<typeof createAuthModule>;
