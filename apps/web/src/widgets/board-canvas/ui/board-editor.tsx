import { Excalidraw, Footer, MainMenu } from "@excalidraw/excalidraw";

import "@excalidraw/excalidraw/index.css";
import "./excalidraw-theme.css";
import { Button } from "@narbel/ui/components/button";
import { useBoolean, useMediaQuery } from "@reactuses/core";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Share2, Users } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { useState } from "react";

import type { Board } from "@/entities/board";
import { useSession } from "@/entities/session";
import { useBoardCollab } from "@/features/board-collab";
import { CommentModeToggle, CommentsLayer } from "@/features/board-comments";
import { useBoardMedia } from "@/features/board-media";
import { PagesBar, usePages } from "@/features/board-pages";
import {
  PreferencesMenuItems,
  usePreferences,
} from "@/features/board-preferences";
import { PresenceBar, usePresence } from "@/features/board-presence";
import { openRenameBoardDialog } from "@/features/rename-board";
import { openShareBoardDialog } from "@/features/share-board";
import { UserMenu } from "@/features/user-menu";

import { BoardDrawer } from "./board-drawer";
import { BoardIdentity } from "./board-identity";

// Mirrors Excalidraw 0.18's own phone breakpoint (MQ_MAX_WIDTH_PORTRAIT / landscape limits).
const PHONE_QUERY =
  "(max-width: 730px), (max-height: 500px) and (max-width: 1000px)";

export const BoardEditor = ({
  board,
  shareToken,
}: {
  board: Board;
  shareToken?: string;
}) => {
  const { data: session } = useSession();
  const userId = session?.user.id ?? "";
  const navigate = useNavigate();
  const [pageId, setPageId] = useState<string | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const {
    value: drawerOpen,
    setTrue: handleOpenDrawer,
    setValue: handleDrawerOpenChange,
  } = useBoolean(false);
  const isPhone = useMediaQuery(PHONE_QUERY, false);
  const { theme = "system", resolvedTheme, setTheme } = useTheme();
  const { canWrite } = board;
  const isOwner = board.role === "owner";

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

  const presenceProps = {
    peers: presence.peers,
    followId: presence.followId,
    onFollow: presence.handleFollow,
  };
  const pagesProps = {
    pages: pages.pages,
    pageId,
    readOnly: !canWrite,
    onSelect: setPageId,
    onAdd: pages.handleAdd,
    onRename: pages.handleRename,
    onDelete: pages.handleDelete,
    onDuplicate: pages.handleDuplicate,
  };

  return (
    <div className="bg-background relative h-svh w-full overflow-hidden">
      <Excalidraw
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        viewModeEnabled={!canWrite}
        excalidrawAPI={bindApi}
        UIOptions={{ canvasActions: { toggleTheme: true } }}
        {...preferences.excalidrawProps}
        onChange={(elements, appState, files) => {
          onChange(elements, appState);
          preferences.onAppState(appState);
          onFiles(files);
        }}
        onPointerUpdate={onPointerUpdate}
        renderTopRightUI={() =>
          isPhone ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Board menu"
              onPress={handleOpenDrawer}
            >
              <Users />
            </Button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2"
            >
              <PresenceBar {...presenceProps} />
              <div className="bg-card flex items-center gap-1 rounded-[15px] p-1 shadow-[var(--shadow-island)]">
                {canWrite ? (
                  <CommentModeToggle
                    active={commentMode}
                    onChange={setCommentMode}
                  />
                ) : null}
                {isOwner ? (
                  <Button
                    variant="citrus"
                    size="sm"
                    onPress={() => openShareBoardDialog(board)}
                  >
                    <Share2 data-icon="inline-start" />
                    Share
                  </Button>
                ) : null}
              </div>
              <UserMenu />
            </motion.div>
          )
        }
      >
        <MainMenu>
          <MainMenu.Item
            icon={<ArrowLeft />}
            onSelect={() => navigate({ to: "/dashboard" })}
          >
            All boards
          </MainMenu.Item>
          {isOwner ? (
            <>
              <MainMenu.Item
                icon={<Pencil />}
                onSelect={() => openRenameBoardDialog(board)}
              >
                Rename board
              </MainMenu.Item>
              <MainMenu.Item
                icon={<Share2 />}
                onSelect={() => openShareBoardDialog(board)}
              >
                Share
              </MainMenu.Item>
            </>
          ) : null}
          <MainMenu.Separator />
          <PreferencesMenuItems
            prefs={preferences.prefs}
            onChange={preferences.handleChange}
          />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme
            allowSystemTheme
            theme={theme as "light" | "dark" | "system"}
            onSelect={setTheme}
          />
          {canWrite ? <MainMenu.DefaultItems.ChangeCanvasBackground /> : null}
          <MainMenu.Separator />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          {canWrite ? <MainMenu.DefaultItems.ClearCanvas /> : null}
        </MainMenu>
        <Footer>{isPhone ? null : <PagesBar {...pagesProps} />}</Footer>
      </Excalidraw>
      <CommentsLayer
        boardId={board.id}
        key={pageId ?? ""}
        pageId={pageId}
        api={api}
        shareToken={shareToken}
        canWrite={canWrite}
        isOwner={isOwner}
        userId={userId}
        mode={commentMode}
        onModeChange={setCommentMode}
      />
      {isPhone ? null : <BoardIdentity board={board} status={status} />}
      <BoardDrawer
        isOpen={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        board={board}
        status={status}
        presence={presenceProps}
        pages={pagesProps}
        preferences={{
          prefs: preferences.prefs,
          onChange: preferences.handleChange,
        }}
        commentMode={commentMode}
        onCommentModeChange={setCommentMode}
      />
    </div>
  );
};
