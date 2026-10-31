import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/DrizzleProcessedEvents";
import { UnreadableEventError } from "../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../shared/infrastructure/outbox/OutboxWorker";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { BetterAuthPlugin } from "../auth";
import type { IReadableBoards } from "./application/ports/IReadableBoards";
import type { SearchTx } from "./application/ports/SearchTx";
import { IndexComment } from "./application/usecases/IndexComment";
import { IndexDrawingText } from "./application/usecases/IndexDrawingText";
import { SearchBoards } from "./application/usecases/SearchBoards";
import { commentChangeSchema } from "./infrastructure/events/commentChangeSchema";
import { drawingTextChangedSchema } from "./infrastructure/events/drawingTextChangedSchema";
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

const FOREIGN_KEY_VIOLATION = "23503";

const isForeignKeyViolation = (error: unknown): boolean => {
  const cause = error instanceof Error ? error.cause : undefined;
  return [error, cause].some(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      "code" in candidate &&
      candidate.code === FOREIGN_KEY_VIOLATION
  );
};

// the board or comment was deleted after the event was written: its mirror rows went with it by
// cascade, and a late post or edit cannot bring them back, so nothing is left to do
const unlessBoardGone = async (work: Promise<void>) => {
  try {
    await work;
  } catch (error) {
    if (!isForeignKeyViolation(error)) {
      throw error;
    }
  }
};

/**
 * Reads drawing's text and discussion's comment changes off the outbox: the mirror rows and the
 * processed mark commit together.
 */
export const createSearchConsumers = ({
  db,
}: {
  db: Database;
}): { text: EventConsumer; comment: EventConsumer } => {
  const uow = new DrizzleUnitOfWork<SearchTx>(db, (tx) => {
    const mirrors = new DrizzleSearchMirrors(tx);
    return {
      texts: mirrors,
      comments: mirrors,
      processed: new DrizzleProcessedEvents(tx),
    };
  });
  const text = new IndexDrawingText(uow);
  const comment = new IndexComment(uow);
  return {
    text: async (id, payload) => {
      const event = drawingTextChangedSchema.safeParse(payload);
      if (!event.success) {
        throw new UnreadableEventError(event.error.message);
      }
      await unlessBoardGone(text.execute(id, event.data));
    },
    comment: async (id, payload) => {
      const event = commentChangeSchema.safeParse(payload);
      if (!event.success) {
        throw new UnreadableEventError(event.error.message);
      }
      await unlessBoardGone(comment.execute(id, event.data));
    },
  };
};
