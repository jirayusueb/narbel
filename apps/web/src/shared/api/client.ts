import { treaty } from "@elysia/eden";
import type { App } from "server";

import { SERVER_URL } from "@/shared/config";

export const api = treaty<App>(SERVER_URL, {
  fetch: { credentials: "include" },
});
