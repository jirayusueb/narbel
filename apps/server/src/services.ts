import { createAuth } from "@narbel/auth";
import { createDb } from "@narbel/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
