// Entry for `bun run auth:generate` (better-auth CLI); not used by the running server.
import { createAuth } from "@narbel/auth";
import { createDb } from "@narbel/db";

import { ENV } from "./src/env.server";

export const auth = createAuth(ENV, createDb(ENV));
