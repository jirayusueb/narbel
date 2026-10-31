import { eq } from "@narbel/db";
import type { Database } from "@narbel/db";
import { userLibrary } from "@narbel/db/schema/board";

import type { ILibraryRepository } from "../../application/ports/ILibraryRepository";

export class DrizzleLibraryRepository implements ILibraryRepository {
  constructor(private readonly db: Database) {}

  async find(userId: string) {
    const [row] = await this.db
      .select({ libraryItems: userLibrary.libraryItems })
      .from(userLibrary)
      .where(eq(userLibrary.userId, userId))
      .limit(1);
    return row?.libraryItems ?? null;
  }

  async save(userId: string, items: unknown[]) {
    const updatedAt = new Date();
    await this.db
      .insert(userLibrary)
      .values({ userId, libraryItems: items, updatedAt })
      .onConflictDoUpdate({
        target: userLibrary.userId,
        set: { libraryItems: items, updatedAt },
      });
  }
}
