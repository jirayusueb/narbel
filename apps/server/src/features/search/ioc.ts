import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/DrizzleProcessedEvents";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { BetterAuthPlugin } from "../auth";
import type { IReadableBoards } from "./application/ports/IReadableBoards";
import type { SearchTx } from "./application/ports/SearchTx";
import { IndexComment } from "./application/usecases/IndexComment";
import { IndexDrawingText } from "./application/usecases/IndexDrawingText";
import { SearchBoards } from "./application/usecases/SearchBoards";
import { CommentChangeConsumer } from "./infrastructure/events/CommentChangeConsumer";
import { DrawingTextConsumer } from "./infrastructure/events/DrawingTextConsumer";
import { DrizzleSearchIndex } from "./infrastructure/repositories/DrizzleSearchIndex";
import { DrizzleSearchMirrors } from "./infrastructure/repositories/DrizzleSearchMirrors";
import { createSearchController } from "./presentation/http/SearchController";

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
