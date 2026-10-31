import { z } from "zod";

import { AppError } from "../../../shared/kernel/errors/AppError";
import { err } from "../../../shared/kernel/types/Result";
import { roundCoord } from "../../drawing";
import { boardId, reply, text } from "./toolKit";
import type { ToolRegistrar } from "./toolKit";

export const registerCollabTools: ToolRegistrar = (server, uc, actor) => {
  const userId = actor.userId ?? "";
  const email = actor.email ?? "";

  server.registerTool(
    "list_replies",
    {
      description:
        "List the replies of one comment thread, oldest first, with author and reactions. Page with nextCursor (pass it back as cursor).",
      inputSchema: {
        boardId,
        commentId: z.string().describe("Id of a comment from list_comments"),
        cursor: z
          .string()
          .optional()
          .describe("nextCursor of the previous call"),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (input) => {
      const result = await uc.listReplies.execute({
        actor,
        boardId: input.boardId,
        commentId: input.commentId,
        cursor: input.cursor,
        limit: input.limit,
      });
      if (result.isErr()) {
        return reply(result);
      }
      return text({
        ...result.value,
        items: result.value.items.map((c) => ({
          ...c,
          x: roundCoord(c.x),
          y: roundCoord(c.y),
        })),
      });
    }
  );
  server.registerTool(
    "add_comment",
    {
      description:
        "Start a comment thread pinned at a point of a page, as the owner of the API key. Markdown, up to 2000 characters; @username mentions notify board members. Returns the new comment.",
      inputSchema: {
        boardId,
        pageId: z.string().describe("Page id from list_pages"),
        x: z.number().describe("Scene x of the pin"),
        y: z.number().describe("Scene y of the pin"),
        body: z.string().max(2000).describe("Comment text in markdown"),
        assigneeId: z
          .string()
          .optional()
          .describe("User id of a board member to assign the thread to"),
      },
    },
    async (input) => {
      const pages = await uc.listPages.execute({
        actor,
        boardId: input.boardId,
      });
      if (pages.isErr()) {
        return reply(pages);
      }
      if (!pages.value.some((p) => p.id === input.pageId)) {
        return reply(
          err(
            AppError.validation(
              `Unknown pageId "${input.pageId}"; use an id from list_pages`
            )
          )
        );
      }
      return reply(
        await uc.addComment.execute({
          actor,
          boardId: input.boardId,
          pageId: input.pageId,
          x: input.x,
          y: input.y,
          body: input.body,
          assigneeId: input.assigneeId,
        })
      );
    }
  );
  server.registerTool(
    "resolve_comment",
    {
      description:
        "Resolve a comment thread, or reopen it with resolve false. Returns the updated comment.",
      inputSchema: {
        boardId,
        commentId: z.string().describe("Id of a comment from list_comments"),
        resolve: z
          .boolean()
          .optional()
          .describe("Defaults to true; false reopens the thread"),
      },
    },
    async (input) =>
      reply(
        await uc.resolveComment.execute({
          actor,
          boardId: input.boardId,
          commentId: input.commentId,
          resolve: input.resolve ?? true,
        })
      )
  );
  server.registerTool(
    "list_shared_boards",
    {
      description:
        "List the boards other people shared with you (by invite), with your role on each. Use list_boards for the ones you own.",
    },
    async () => reply(await uc.listSharedBoards.execute({ userId, email }))
  );
  server.registerTool(
    "rename_board",
    {
      description:
        "Rename a board; only its owner can. Title is 1 to 120 characters.",
      inputSchema: { boardId, title: z.string().min(1).max(120) },
    },
    async (input) =>
      reply(
        await uc.renameBoard.execute({
          actor,
          boardId: input.boardId,
          title: input.title,
        })
      )
  );
};
