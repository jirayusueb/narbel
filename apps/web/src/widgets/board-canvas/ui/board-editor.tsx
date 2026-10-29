import { Excalidraw } from "@excalidraw/excalidraw";

import "@excalidraw/excalidraw/index.css";
import "./excalidraw-theme.css";
import { Button, buttonVariants } from "@narbel/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Redo2, Undo2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

import type { Board } from "@/entities/board";
import { useSession } from "@/entities/session";
import { useBoardCollab } from "@/features/board-collab";
import type { CollabStatus } from "@/features/board-collab";
import { CommentModeToggle, CommentsLayer } from "@/features/board-comments";
import { useBoardMedia } from "@/features/board-media";
import { PagesBar, usePages } from "@/features/board-pages";
import { PreferencesMenu, usePreferences } from "@/features/board-preferences";
import { PresenceBar, usePresence } from "@/features/board-presence";
import { ShareBoardDialog } from "@/features/share-board";
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

const IS_MAC = /mac|iphone|ipad/iu.test(navigator.platform);

// Excalidraw 0.18 has no public undo/redo API, so the buttons replay its own keyboard shortcut.
const replayUndo = (redo: boolean) =>
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      metaKey: IS_MAC,
      ctrlKey: !IS_MAC,
      shiftKey: redo,
      bubbles: true,
    })
  );

export const BoardEditor = ({
  board,
  shareToken,
}: {
  board: Board;
  shareToken?: string;
}) => {
  const { data: session } = useSession();
  const userId = session?.user.id ?? "";
  const [pageId, setPageId] = useState<string | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const { canWrite } = board;

  const { api, bindApi, doc, awareness, status, onChange, onPointerUpdate } =
    useBoardCollab({
      boardId: board.id,
      userName: session?.user.name ?? "Anonymous",
      pageId,
      canWrite,
      shareToken,
    });
  const { onFiles } = useBoardMedia({
    boardId: board.id,
    doc,
    api,
    canWrite,
    shareToken,
  });
  const pages = usePages({
    doc,
    synced: status === "live",
    canWrite,
    pageId,
    setPageId,
  });
  const presence = usePresence({ awareness, api, pageId, setPageId });
  const preferences = usePreferences({ userId, api });
  const { resolvedTheme } = useTheme();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="bg-background flex h-14 shrink-0 items-center gap-2 px-3">
        <Link
          to="/dashboard"
          aria-label="Back to boards"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <BrandMark className="size-6" />
        </Link>
        <h1 className="font-display min-w-0 truncate text-[20px] font-normal tracking-[-0.02em]">
          {board.title}
        </h1>
        <output className="bg-card shadow-surface flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs max-sm:px-2">
          <span
            className={`size-1.5 rounded-full ${STATUS_DOT[status]}`}
            aria-hidden="true"
          />
          <span className="max-sm:sr-only">{STATUS_LABEL[status]}</span>
        </output>
        {canWrite ? null : (
          <span className="border-border-strong text-muted-foreground flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs max-sm:hidden">
            View only
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <PresenceBar
            peers={presence.peers}
            followId={presence.followId}
            onFollow={presence.handleFollow}
          />
          <div className="bg-card shadow-surface flex gap-0.5 rounded-[15px] p-1">
            {canWrite ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Undo"
                  className="max-sm:hidden"
                  onPress={() => replayUndo(false)}
                >
                  <Undo2 />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Redo"
                  className="max-sm:hidden"
                  onPress={() => replayUndo(true)}
                >
                  <Redo2 />
                </Button>
                <CommentModeToggle
                  active={commentMode}
                  onChange={setCommentMode}
                />
              </>
            ) : null}
            <PreferencesMenu
              prefs={preferences.prefs}
              onChange={preferences.handleChange}
            />
          </div>
          {board.role === "owner" ? <ShareBoardDialog board={board} /> : null}
        </div>
      </div>
      <PagesBar
        pages={pages.pages}
        pageId={pageId}
        readOnly={!canWrite}
        onSelect={setPageId}
        onAdd={pages.handleAdd}
        onRename={pages.handleRename}
        onDelete={pages.handleDelete}
        onDuplicate={pages.handleDuplicate}
      />
      <div className="relative min-h-0 flex-1">
        <Excalidraw
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          viewModeEnabled={!canWrite}
          excalidrawAPI={bindApi}
          {...preferences.excalidrawProps}
          onChange={(elements, appState, files) => {
            onChange(elements, appState);
            preferences.onAppState(appState);
            onFiles(files);
          }}
          onPointerUpdate={onPointerUpdate}
        />
        <CommentsLayer
          boardId={board.id}
          key={pageId ?? ""}
          pageId={pageId}
          api={api}
          shareToken={shareToken}
          canWrite={canWrite}
          isOwner={board.role === "owner"}
          userId={userId}
          mode={commentMode}
          onModeChange={setCommentMode}
        />
      </div>
    </div>
  );
};
