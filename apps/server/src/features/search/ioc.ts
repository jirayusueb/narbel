import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/drizzle-processed-events";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/drizzle-unit-of-work";
import type { BetterAuthPlugin } from "../auth";
import type { IReadableBoards } from "./application/ports/i-readable-boards";
import type { SearchTx } from "./application/ports/search-tx";
import { IndexComment } from "./application/usecases/index-comment";
import { IndexDrawingText } from "./application/usecases/index-drawing-text";
import { SearchBoards } from "./application/usecases/search-boards";
import { CommentChangeConsumer } from "./infrastructure/events/comment-change-consumer";
import { DrawingTextConsumer } from "./infrastructure/events/drawing-text-consumer";
import { DrizzleSearchIndex } from "./infrastructure/repositories/drizzle-search-index";
import { DrizzleSearchMirrors } from "./infrastructure/repositories/drizzle-search-mirrors";
import { createSearchController } from "./presentation/http/search-controller";

/** The use cases search's transports (HTTP, MCP) drive. */
export interface SearchUseCases {
  searchBoards: SearchBoards;
}

export const createSearchUseCases = ({
  db,
  boards,
}: {
  db: Database;
  /** boards' AccessPolicy: the readable boards every match is restricted to */
  boards: IReadableBoards;
}): SearchUseCases => ({
  searchBoards: new SearchBoards(boards, new DrizzleSearchIndex(db)),
});

export const createSearchModule = (
  betterAuth: BetterAuthPlugin,
  uc: SearchUseCases
) =>
  new Elysia({ name: "feature/search" }).use(
    createSearchController(betterAuth, uc)
  );

/**
 * Wires the consumers of drawing's text and discussion's comment changes: the mirror rows and the
 * processed mark commit together.
 */
export const createSearchConsumers = ({ db }: { db: Database }) => {
  const uow = new DrizzleUnitOfWork<SearchTx>(db, (tx) => {
    const mirrors = new DrizzleSearchMirrors(tx);
    return {
      texts: mirrors,
      comments: mirrors,
      processed: new DrizzleProcessedEvents(tx),
    };
  });
  return {
    text: new DrawingTextConsumer(new IndexDrawingText(uow)),
    comment: new CommentChangeConsumer(new IndexComment(uow)),
  };
};
