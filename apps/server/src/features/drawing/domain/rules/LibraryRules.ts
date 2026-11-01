import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

const ITEM_ID = /^.{1,128}$/u;

export class LibraryRules {
  static readonly MAX_LIBRARY_ITEMS = 1000;

  private constructor() {
    // static rules only
  }

  // Only the envelope is checked; Excalidraw restores the element fields itself on load.
  static validateLibraryItems(
    items: readonly unknown[]
  ): Result<void, AppError> {
    if (items.length > LibraryRules.MAX_LIBRARY_ITEMS) {
      return err(
        AppError.payloadTooLarge(
          `A library holds at most ${LibraryRules.MAX_LIBRARY_ITEMS} items`,
          { maxItems: LibraryRules.MAX_LIBRARY_ITEMS }
        )
      );
    }
    const seen = new Set<string>();
    for (const item of items) {
      const { id, elements } = (item ?? {}) as {
        id?: unknown;
        elements?: unknown;
      };
      if (typeof id !== "string" || !ITEM_ID.test(id)) {
        return err(
          AppError.validation(
            "Each library item needs an id of 1 to 128 characters"
          )
        );
      }
      if (!Array.isArray(elements)) {
        return err(
          AppError.validation("Each library item needs an elements array")
        );
      }
      if (seen.has(id)) {
        return err(AppError.validation("Library item ids must be unique"));
      }
      seen.add(id);
    }
    return okEmpty();
  }
}
