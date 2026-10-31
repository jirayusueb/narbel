import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

export const MAX_LIBRARY_ITEMS = 1000;

const ITEM_ID = /^.{1,128}$/u;

// Only the envelope is checked; Excalidraw restores the element fields itself on load.
export const validateLibraryItems = (
  items: readonly unknown[]
): Result<void, AppError> => {
  if (items.length > MAX_LIBRARY_ITEMS) {
    return err(
      AppError.payloadTooLarge(
        `A library holds at most ${MAX_LIBRARY_ITEMS} items`,
        { maxItems: MAX_LIBRARY_ITEMS }
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
};
