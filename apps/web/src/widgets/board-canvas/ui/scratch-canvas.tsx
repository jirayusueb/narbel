import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { BoardSkeleton } from "./board-skeleton";

// Excalidraw touches `window` at import time, so it must stay out of the SSR module graph.
const ScratchEditor = lazy(async () => {
  const mod = await import("./scratch-editor");
  return { default: mod.ScratchEditor };
});

export const ScratchCanvas = () => {
  const placeholder = <BoardSkeleton />;
  return (
    <ClientOnly fallback={placeholder}>
      <Suspense fallback={placeholder}>
        <ScratchEditor />
      </Suspense>
    </ClientOnly>
  );
};
