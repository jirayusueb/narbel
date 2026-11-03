import type { LibraryPersistenceAdapter } from "@narbel/ndraw/data/library";
import type { LibraryItems_anyVersion } from "@narbel/ndraw/types";

import { api, unwrap } from "@/shared/api";

// Both methods throw on failure, which is how Excalidraw learns to show its library error.
export const libraryAdapter: LibraryPersistenceAdapter = {
  load: async () => {
    const { libraryItems } = unwrap(await api.api.library.get());
    return { libraryItems: libraryItems as LibraryItems_anyVersion };
  },
  save: async ({ libraryItems }) => {
    unwrap(
      await api.api.library.put({
        libraryItems: libraryItems as unknown as Record<string, unknown>[],
      })
    );
  },
};
