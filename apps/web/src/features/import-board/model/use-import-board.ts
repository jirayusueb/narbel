import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  uploadBoardFile,
  useCreateBoard,
  usePurgeBoard,
  useTrashBoard,
} from "@/entities/board";
import { useDraftKey } from "@/shared/lib";

import { stashImport } from "./pending-import";
import { importTitle, planImport } from "./plan-import";

interface ImportDeps {
  create: (input: { title: string; key: string }) => Promise<{ id: string }>;
  remove: (id: string) => Promise<unknown>;
  draftKey: { get: (content: string) => string; rotate: () => void };
}

const UPLOAD_CONCURRENCY = 3;

/** Runs `fn` over `items` with at most `limit` in flight. After the first failure nothing new starts, in-flight work settles, then it rethrows. */
const mapPool = async <T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  const failures: unknown[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    const index = next;
    next += 1;
    const item = items[index];
    if (failures.length > 0 || index >= items.length) {
      return;
    }
    try {
      results[index] = await fn(item as T);
    } catch (error) {
      failures.push(error);
      return;
    }
    await worker();
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  if (failures.length > 0) {
    throw failures[0];
  }
  return results;
};

// Resolves with the new board id, or null after reporting and undoing a failure.
const runImport = async (
  { create, remove, draftKey }: ImportDeps,
  file: File
): Promise<string | null> => {
  let boardId: string | null = null;
  try {
    // lazy: the dashboard bundle does not carry Excalidraw
    const { loadFromBlob } = await import("@excalidraw/excalidraw");
    const plan = planImport(await loadFromBlob(file, null, null));
    const board = await create({
      title: importTitle(file.name),
      key: draftKey.get(`${file.name}:${file.size}:${file.lastModified}`),
    });
    boardId = board.id;
    // bounded: each image is prepared in memory before its PUT
    const stored = await mapPool(
      plan.images,
      UPLOAD_CONCURRENCY,
      async (image) => ({
        id: image.id,
        mimeType: await uploadBoardFile(board.id, image),
        created: image.created,
      })
    );
    stashImport(board.id, {
      elements: plan.elements,
      files: plan.images,
      stored,
    });
    draftKey.rotate();
    return board.id;
  } catch (error) {
    if (boardId) {
      try {
        await remove(boardId);
      } catch {
        toast.error("The incomplete board could not be removed.");
      }
    }
    // a replayed create would hand back the board just deleted
    draftKey.rotate();
    toast.error(`Import failed: ${(error as Error).message}`);
    return null;
  }
};

/**
 * Turns a .excalidraw file into a new board. Nothing reaches the board until every image is stored:
 * a failure removes the board it just made and leaves the file as it was.
 */
export const useImportBoard = () => {
  const navigate = useNavigate();
  const create = useCreateBoard();
  const trash = useTrashBoard();
  const purge = usePurgeBoard();
  const draftKey = useDraftKey();
  const [isPending, setIsPending] = useState(false);

  const importFile = async (file: File) => {
    setIsPending(true);
    const boardId = await runImport(
      {
        create: create.mutateAsync,
        remove: async (id) => {
          await trash.mutateAsync(id);
          await purge.mutateAsync(id);
        },
        draftKey,
      },
      file
    );
    setIsPending(false);
    if (boardId) {
      navigate({ to: "/boards/$boardId", params: { boardId } });
    }
  };

  return { importFile, isPending };
};
