import { buttonVariants } from "@narbel/ui/components/button";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState, ViewTransition } from "react";

import type { Board } from "@/entities/board";
import type { CollabStatus } from "@/features/board-collab";
import { openRenameBoardDialog } from "@/features/rename-board";
import { BrandMark } from "@/shared/ui";

const STATUS_LABEL: Record<CollabStatus, string> = {
  connecting: "Connecting",
  syncing: "Syncing",
  live: "Live",
  offline: "Offline",
  "no-access": "No access",
};

const STATUS_DOT: Record<CollabStatus, string> = {
  connecting: "bg-subtle-foreground animate-pulse motion-reduce:animate-none",
  syncing: "bg-subtle-foreground animate-pulse motion-reduce:animate-none",
  live: "bg-citrus ring-3 ring-citrus/35",
  offline: "bg-destructive",
  "no-access": "bg-destructive",
};

const PROBLEM_ANNOUNCEMENT: Partial<Record<CollabStatus, string>> = {
  offline: "Board offline. Changes will sync when you reconnect.",
  "no-access": "You no longer have access to this board",
};

// The one polite live region for connection status; the visible chips stay silent so nothing is read twice.
export const StatusAnnouncer = ({ status }: { status: CollabStatus }) => {
  const [seen, setSeen] = useState({
    status,
    message: "",
    hadProblem: false,
  });
  // Adjusting state while rendering (not in an effect) keeps the announcement in the same commit as the status.
  if (seen.status !== status) {
    const problem = PROBLEM_ANNOUNCEMENT[status];
    let { message, hadProblem } = seen;
    if (problem) {
      message = problem;
      hadProblem = true;
    } else if (status === "live" && hadProblem) {
      message = "Back online";
      hadProblem = false;
    }
    setSeen({ status, message, hadProblem });
  }

  return (
    <output aria-atomic="true" className="sr-only">
      {seen.message}
    </output>
  );
};

// compact: dot only while live (problems and sync progress always keep their label).
export const BoardStatus = ({
  status,
  canWrite,
  compact = false,
}: {
  status: CollabStatus;
  canWrite: boolean;
  compact?: boolean;
}) => (
  <span className="flex shrink-0 items-center gap-2">
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${STATUS_DOT[status]}`}
      />
      <span
        className={[
          status === "connecting" || status === "syncing" ? "text-shimmer" : "",
          compact && status === "live" ? "sr-only" : "",
        ].join(" ")}
      >
        {STATUS_LABEL[status]}
      </span>
    </span>
    {canWrite ? null : (
      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
        View only
      </span>
    )}
  </span>
);

// The board's name card, floating beside Excalidraw's menu button. compact: it sits in the second row instead,
// where the title truncates to the space left by the actions and a live status shows as a dot.
export const BoardIdentity = ({
  board,
  status,
  compact,
  cardRef,
}: {
  board: Board;
  status: CollabStatus;
  compact: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
}) => {
  const isOwner = board.role === "owner";
  return (
    <motion.div
      ref={cardRef}
      data-compact={compact}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={
        compact
          ? "bg-card shadow-elevated pointer-events-auto flex h-10 min-w-0 items-center gap-1.5 rounded-lg p-1 pr-3"
          : "bg-card shadow-elevated pointer-events-auto absolute top-4 left-[68px] z-[3] flex h-10 min-w-0 items-center gap-1.5 rounded-lg p-1 pr-3"
      }
    >
      <Link
        to="/dashboard"
        aria-label="Back to boards"
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      >
        <BrandMark className="size-5" />
      </Link>
      <h1 className={compact ? "min-w-0" : "max-w-72 min-w-0"}>
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
      <BoardStatus
        status={status}
        canWrite={board.canWrite}
        compact={compact}
      />
    </motion.div>
  );
};
