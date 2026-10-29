import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import type { Board } from "@/entities/board";

import { BoardSkeleton } from "./board-skeleton";

// Excalidraw touches `window` at import time, so it must stay out of the SSR module graph.
const BoardEditor = lazy(async () => {
  const mod = await import("./board-editor");
  return { default: mod.BoardEditor };
});

export const BoardCanvas = ({
  board,
  shareToken,
  focusComment,
}: {
  board: Board;
  shareToken?: string;
  focusComment?: string;
}) => {
  const placeholder = <BoardSkeleton />;
  return (
    <ClientOnly fallback={placeholder}>
      <Suspense fallback={placeholder}>
        <BoardEditor
          board={board}
          shareToken={shareToken}
          focusComment={focusComment}
        />
      </Suspense>
    </ClientOnly>
  );
};
