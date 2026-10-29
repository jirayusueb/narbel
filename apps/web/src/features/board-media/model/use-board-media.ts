import type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type * as Y from "yjs";

import { api as http } from "@/shared/api";
import { SERVER_URL } from "@/shared/config";

interface FileMeta {
  id: string;
  mimeType: string;
  created: number;
}

const LOCAL_ORIGIN = Symbol("local-file");
const BASE64_CHUNK = 0x80_00;

const blobToDataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCodePoint(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
};

const downloadAsDataUrl = async (boardId: string, fileId: string) => {
  const res = await fetch(
    `${SERVER_URL}/api/boards/${boardId}/files/${fileId}`,
    {
      credentials: "include",
    }
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return blobToDataUrl(await res.blob());
};

const upload = async (boardId: string, file: BinaryFileData) => {
  const source = await fetch(file.dataURL);
  const blob = await source.blob();
  const res = await http.api.boards({ id: boardId }).files.post({
    fileId: file.id,
    file: new File([blob], file.id, { type: file.mimeType }),
  });
  if (res.error) {
    throw new Error(`HTTP ${res.status}`);
  }
};

export const useBoardMedia = ({
  boardId,
  doc,
  api,
}: {
  boardId: string;
  doc: Y.Doc | null;
  api: ExcalidrawImperativeAPI | null;
}) => {
  // shortcut: a failed upload/download is not retried until reload; add backoff if flaky storage matters.
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    if (!(doc && api)) {
      return;
    }
    const tried = attempted.current;
    const files = doc.getMap<FileMeta>("files");

    const download = async (meta: FileMeta) => {
      attempted.current.add(meta.id);
      try {
        const dataURL = await downloadAsDataUrl(boardId, meta.id);
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
      for (const meta of files.values()) {
        if (!(present[meta.id] || attempted.current.has(meta.id))) {
          download(meta);
        }
      }
    };

    files.observe(pull);
    pull();
    return () => {
      files.unobserve(pull);
      tried.clear();
    };
  }, [doc, api, boardId]);

  const onFiles = useCallback(
    (scene: BinaryFiles) => {
      if (!doc) {
        return;
      }
      const files = doc.getMap<FileMeta>("files");
      const syncFile = async (file: BinaryFileData) => {
        try {
          await upload(boardId, file);
          doc.transact(() => {
            files.set(file.id, {
              id: file.id,
              mimeType: file.mimeType,
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
    [doc, boardId]
  );

  return { onFiles };
};
