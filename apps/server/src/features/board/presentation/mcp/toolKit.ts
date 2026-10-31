import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { BoardUseCases } from "../../ioc";

export type ToolRegistrar = (
  server: McpServer,
  uc: BoardUseCases,
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
