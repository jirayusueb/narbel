import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useState } from "react";
import type * as Y from "yjs";

import { elementKey, isOnPage } from "@/entities/drawing";

export interface Page {
  id: string;
  name: string;
}

// Matches the id the server uses when it migrates a v1 board into pages.
const MAIN_PAGE: Page = { id: "page:main", name: "Page 1" };

const unique = (pages: Page[]) => [
  ...new Map(pages.map((page) => [page.id, page])).values(),
];

export const usePages = ({
  doc,
  synced,
  canWrite,
  pageId,
  setPageId,
}: {
  doc: Y.Doc | null;
  synced: boolean;
  canWrite: boolean;
  pageId: string | null;
  setPageId: (id: string) => void;
}) => {
  const [pages, setPages] = useState<Page[]>([]);

  useEffect(() => {
    if (!doc) {
      return;
    }
    const list = doc.getArray<Page>("pages");
    const refresh = () => setPages(unique(list.toArray()));
    list.observe(refresh);
    refresh();
    return () => list.unobserve(refresh);
  }, [doc]);

  useEffect(() => {
    if (!(doc && synced && canWrite)) {
      return;
    }
    const list = doc.getArray<Page>("pages");
    // A fresh board has no pages yet. Two clients racing here create a duplicate id that `unique` hides.
    if (list.length === 0) {
      list.push([MAIN_PAGE]);
    }
  }, [doc, synced, canWrite]);

  useEffect(() => {
    if (pages.length > 0 && !pages.some((page) => page.id === pageId)) {
      setPageId(pages[0].id);
    }
  }, [pages, pageId, setPageId]);

  const addPage = useCallback(() => {
    if (!doc) {
      return;
    }
    const page = {
      id: `page:${crypto.randomUUID()}`,
      name: `Page ${pages.length + 1}`,
    };
    doc.getArray<Page>("pages").push([page]);
    setPageId(page.id);
  }, [doc, pages.length, setPageId]);

  const renamePage = useCallback(
    (id: string, name: string) => {
      if (!doc) {
        return;
      }
      const list = doc.getArray<Page>("pages");
      const index = list.toArray().findIndex((page) => page.id === id);
      if (index === -1) {
        return;
      }
      doc.transact(() => {
        list.delete(index, 1);
        list.insert(index, [{ id, name }]);
      });
    },
    [doc]
  );

  const deletePage = useCallback(
    (id: string) => {
      if (!doc || pages.length < 2) {
        return;
      }
      const list = doc.getArray<Page>("pages");
      const elements = doc.getMap<ExcalidrawElement>("elements");
      doc.transact(() => {
        const index = list.toArray().findIndex((page) => page.id === id);
        if (index !== -1) {
          list.delete(index, 1);
        }
        for (const key of elements.keys()) {
          if (isOnPage(id, key)) {
            elements.delete(key);
          }
        }
      });
    },
    [doc, pages.length]
  );

  const duplicatePage = useCallback(
    (id: string) => {
      const source = pages.find((page) => page.id === id);
      if (!(doc && source)) {
        return;
      }
      const copy = {
        id: `page:${crypto.randomUUID()}`,
        name: `${source.name} copy`,
      };
      const elements = doc.getMap<ExcalidrawElement>("elements");
      doc.transact(() => {
        doc.getArray<Page>("pages").push([copy]);
        const originals = [...elements].filter(([key]) => isOnPage(id, key));
        for (const [, value] of originals) {
          elements.set(elementKey(copy.id, value.id), { ...value });
        }
      });
      setPageId(copy.id);
    },
    [doc, pages, setPageId]
  );

  return {
    pages,
    handleAdd: addPage,
    handleRename: renamePage,
    handleDelete: deletePage,
    handleDuplicate: duplicatePage,
  };
};
