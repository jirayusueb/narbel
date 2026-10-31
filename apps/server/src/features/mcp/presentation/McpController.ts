import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Elysia, status } from "elysia";

import { userActor } from "../../../shared/presentation/http/actor";
import { errorBody } from "../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../auth";
import { createMcpServer } from "./createMcpServer";
import type { McpUseCases } from "./toolKit";

const methodNotAllowed = () =>
  status(
    405,
    errorBody("MethodNotAllowed", "Stateless MCP endpoint only accepts POST")
  );

export const createMcpController = (
  betterAuth: BetterAuthPlugin,
  uc: McpUseCases
) =>
  new Elysia({ name: "board/mcp" })
    .use(betterAuth)
    .post("/mcp", ({ request, body, withMcpUser }) =>
      withMcpUser(request, async (user) => {
        // stateless: a fresh server + transport per request, nothing to clean up between calls
        const server = createMcpServer(uc, userActor(user));
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await server.connect(transport);
        return transport.handleRequest(request, { parsedBody: body });
      })
    )
    .get("/mcp", methodNotAllowed)
    .delete("/mcp", methodNotAllowed);
