import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppError } from "../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../shared/kernel/types/Actor";
import type { Result } from "../../../shared/kernel/types/Result";
import type { BoardsUseCases } from "../../boards";
import type { CommentUseCases } from "../../discussion";
import type { DrawingUseCases } from "../../drawing";
import type { SearchUseCases } from "../../search";

/** MCP is a transport: its tools drive the use cases of boards, drawing, discussion and search. */
export type McpUseCases = BoardsUseCases &
  DrawingUseCases &
  CommentUseCases &
  SearchUseCases;

export type ToolRegistrar = (
  server: McpServer,
  uc: McpUseCases,
  actor: Actor
) => void;

// a use case that returns nothing must still yield a string, or the client rejects the result
export const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value ?? null) }],
});

export const reply = <T>(result: Result<T, AppError>) =>
  result.isOk()
    ? text(result.value)
    : {
        isError: true as const,
        content: [
          {
            type: "text" as const,
            text: `${result.error.code}: ${result.error.message}`,
          },
        ],
      };

export const elementText = z.string().max(10_000);

export const elementId = z
  .string()
  .regex(/^[\w-]{1,64}$/u, "letters, digits, _ or -, at most 64");

export const boardId = z
  .string()
  .describe("Board id from list_boards or create_board");

export const pageId = z
  .string()
  .optional()
  .describe("Page id from list_pages; defaults to the first page");
