import { Excalidraw } from "@excalidraw/excalidraw";

import "@excalidraw/excalidraw/index.css";
import { Badge } from "@narbel/ui/components/badge";
import { Button } from "@narbel/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
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

const STATUS_LABEL: Record<CollabStatus, string> = {
  connecting: "Connecting",
  syncing: "Syncing",
  live: "Live",
  offline: "Offline",
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-3 py-2">
        <Link
          to="/dashboard"
          aria-label="Back to boards"
          className="text-muted-foreground"
        >
          <ArrowLeft />
        </Link>
        <h1 className="truncate text-sm font-medium">{board.title}</h1>
        <Badge variant={status === "live" ? "default" : "secondary"}>
          {STATUS_LABEL[status]}
        </Badge>
        {canWrite ? null : <Badge variant="outline">View only</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <PresenceBar
            peers={presence.peers}
            followId={presence.followId}
            onFollow={presence.handleFollow}
          />
          {canWrite ? (
            <>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Undo"
                onPress={() => replayUndo(false)}
              >
                <Undo2 />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Redo"
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
          theme="dark"
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
