import type { Database } from "@narbel/db";

import { DrizzleBoardDocumentStore } from "./DrizzleBoardDocumentStore";

/** Startup step: makes boards saved before search existed searchable. Idempotent. */
export const backfillBoardText = async (db: Database) => {
  const count = await new DrizzleBoardDocumentStore(db).backfillTexts();
  if (count > 0) {
    console.log(`Indexed text of ${count} board(s) for search`);
  }
};
