import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type * as Y from "yjs";

import { downloadAsDataUrl, uploadBoardFile } from "@/entities/board";
import { isOnPage } from "@/shared/lib/page-keys";

import { fileIdsOnPage } from "./page-files";

interface FileMeta {
  id: string;
  mimeType: string;
  created: number;
}

const LOCAL_ORIGIN = Symbol("local-file");
export const useBoardMedia = ({
  boardId,
  doc,
  api,
  canWrite,
  shareToken,
  pageId,
}: {
  boardId: string;
  doc: Y.Doc | null;
  api: ExcalidrawImperativeAPI | null;
  canWrite: boolean;
  shareToken?: string;
  pageId: string | null;
}) => {
  // shortcut: a failed upload/download is not retried until reload; add backoff if flaky storage matters.
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    const tried = attempted.current;
    return () => tried.clear();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps -- a new document or session forgets what was attempted
  }, [doc, api, boardId, shareToken]);

  useEffect(() => {
    if (!(doc && api && pageId)) {
      return;
    }
    const files = doc.getMap<FileMeta>("files");
    const elements = doc.getMap<ExcalidrawElement>("elements");

    const download = async (meta: FileMeta) => {
      attempted.current.add(meta.id);
      try {
        const dataURL = await downloadAsDataUrl(boardId, meta.id, shareToken);
        api.addFiles([
          {
            id: meta.id,
            mimeType: meta.mimeType,
            created: meta.created,
            dataURL,
          },
        ] as BinaryFileData[]);
      } catch (error) {
        toast.error(`Could not load an image: ${(error as Error).message}`);
      }
    };

    const pull = () => {
      const present = api.getFiles();
      for (const id of fileIdsOnPage(elements, pageId)) {
        const meta = files.get(id);
        if (meta && !(present[id] || attempted.current.has(id))) {
          download(meta);
        }
      }
    };
    const pullIfOnPage = (event: Y.YMapEvent<ExcalidrawElement>) => {
      if ([...event.keysChanged].some((key) => isOnPage(pageId, key))) {
        pull();
      }
    };

    files.observe(pull);
    elements.observe(pullIfOnPage);
    pull();
    return () => {
      files.unobserve(pull);
      elements.unobserve(pullIfOnPage);
    };
  }, [doc, api, boardId, shareToken, pageId]);

  const onFiles = useCallback(
    (scene: BinaryFiles) => {
      if (!(doc && canWrite)) {
        return;
      }
      const files = doc.getMap<FileMeta>("files");
      const syncFile = async (file: BinaryFileData) => {
        try {
          const mimeType = await uploadBoardFile(boardId, file, shareToken);
          doc.transact(() => {
            files.set(file.id, {
              id: file.id,
              mimeType,
              created: file.created,
            });
          }, LOCAL_ORIGIN);
        } catch (error) {
          toast.error(`Image upload failed: ${(error as Error).message}`);
        }
      };
      for (const file of Object.values(scene)) {
        if (files.has(file.id) || attempted.current.has(file.id)) {
          continue;
        }
        attempted.current.add(file.id);
        syncFile(file);
      }
    },
    [doc, boardId, canWrite, shareToken]
  );

  return { onFiles };
};
