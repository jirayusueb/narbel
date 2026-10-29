import { Elysia } from "elysia";

import type { BetterAuthPlugin } from "./betterAuthPlugin";

export const createMeController = (betterAuth: BetterAuthPlugin) =>
  new Elysia({ name: "auth/me" })
    .use(betterAuth)
    .get("/api/me", { auth: true }, ({ user }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }));
