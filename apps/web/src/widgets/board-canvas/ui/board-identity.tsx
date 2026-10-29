import { buttonVariants } from "@narbel/ui/components/button";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ViewTransition } from "react";

import type { Board } from "@/entities/board";
import type { CollabStatus } from "@/features/board-collab";
import { openRenameBoardDialog } from "@/features/rename-board";
import { BrandMark } from "@/shared/ui";

const STATUS_LABEL: Record<CollabStatus, string> = {
  connecting: "Connecting",
  syncing: "Syncing",
  live: "Live",
  offline: "Offline",
};

const STATUS_DOT: Record<CollabStatus, string> = {
  connecting: "bg-subtle-foreground animate-pulse motion-reduce:animate-none",
  syncing: "bg-subtle-foreground animate-pulse motion-reduce:animate-none",
  live: "bg-citrus shadow-[0_0_0_3px_rgb(221_236_97/0.35)]",
  offline: "bg-destructive",
};

export const BoardStatus = ({
  status,
  canWrite,
}: {
  status: CollabStatus;
  canWrite: boolean;
}) => (
  <span className="flex shrink-0 items-center gap-2">
    <output className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${STATUS_DOT[status]}`}
      />
      <span
        className={
          status === "connecting" || status === "syncing"
            ? "text-shimmer"
            : undefined
        }
      >
        {STATUS_LABEL[status]}
      </span>
    </output>
    {canWrite ? null : (
      <span className="border-border-strong text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
        View only
      </span>
    )}
  </span>
);

// The board's name card, floating beside Excalidraw's menu button.
export const BoardIdentity = ({
  board,
  status,
}: {
  board: Board;
  status: CollabStatus;
}) => {
  const isOwner = board.role === "owner";
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="bg-card shadow-elevated pointer-events-auto absolute top-4 left-[68px] z-[3] flex h-10 max-w-[calc(50vw-310px)] min-w-0 items-center gap-1.5 rounded-lg p-1 pr-3"
    >
      <Link
        to="/dashboard"
        aria-label="Back to boards"
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      >
        <BrandMark className="size-5" />
      </Link>
      <h1 className="min-w-0">
        <ViewTransition name={`board-title-${board.id}`}>
          {isOwner ? (
            <button
              type="button"
              title="Rename board"
              onClick={() => openRenameBoardDialog(board)}
              className="font-display hover:bg-accent focus-visible:outline-ring block max-w-full cursor-text truncate rounded-sm px-1.5 py-0.5 text-[17px] tracking-[-0.02em] transition-colors focus-visible:outline-2 focus-visible:outline-solid"
            >
              {board.title}
            </button>
          ) : (
            <span className="font-display block truncate px-1.5 text-[17px] tracking-[-0.02em]">
              {board.title}
            </span>
          )}
        </ViewTransition>
      </h1>
      <BoardStatus status={status} canWrite={board.canWrite} />
    </motion.div>
  );
};
