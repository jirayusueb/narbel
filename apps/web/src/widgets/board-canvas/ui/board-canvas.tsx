import { Skeleton } from "@narbel/ui/components/skeleton";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import type { Board } from "@/entities/board";

// Excalidraw touches `window` at import time, so it must stay out of the SSR module graph.
const BoardEditor = lazy(async () => {
  const mod = await import("./board-editor");
  return { default: mod.BoardEditor };
});

export const BoardCanvas = ({ board }: { board: Board }) => {
  const placeholder = <Skeleton className="size-full" />;
  return (
    <ClientOnly fallback={placeholder}>
      <Suspense fallback={placeholder}>
        <BoardEditor board={board} />
      </Suspense>
    </ClientOnly>
  );
};
