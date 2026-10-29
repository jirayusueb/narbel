import { Elysia } from "elysia";

import { errorBody } from "./resultPlugin";

const SAFE_METHODS: Record<string, true> = {
  GET: true,
  HEAD: true,
  OPTIONS: true,
};

// Session cookies are SameSite=None (web and API live on different sites), so browsers attach
// them to cross-site form posts and WebSocket upgrades, neither of which CORS blocks.
// Non-browser clients (MCP, curl) send no Origin and pass.
export const originGuard = (allowedOrigin: string) =>
  new Elysia({ name: "origin-guard", seed: allowedOrigin }).onRequest(
    ({ request }) => {
      const origin = request.headers.get("origin");
      if (!origin || origin === allowedOrigin) {
        return;
      }
      const isUpgrade =
        request.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (isUpgrade || !SAFE_METHODS[request.method]) {
        return Response.json(
          errorBody("Forbidden", "Cross-origin request rejected"),
          { status: 403 }
        );
      }
    }
  );
