import {
  Excalidraw,
  Footer,
  MainMenu,
  useDevice,
  useHandleLibrary,
} from "@excalidraw/excalidraw";

import "@excalidraw/excalidraw/index.css";
import "./excalidraw-theme.css";
import { Button } from "@narbel/ui/components/button";
import { useBoolean, useMediaQuery } from "@reactuses/core";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Share2, Users } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";

import type { Board } from "@/entities/board";
import { useSession } from "@/entities/session";
import { useMe } from "@/entities/user";
import type { UserRef } from "@/entities/user";
import { useBoardCollab } from "@/features/board-collab";
import type { CollabStatus } from "@/features/board-collab";
import {
  CommentModeToggle,
  CommentsLayer,
  CommentsPanel,
  CommentsPanelToggle,
  useCommentsWorkspace,
} from "@/features/board-comments";
import { libraryAdapter } from "@/features/board-library";
import { useBoardMedia } from "@/features/board-media";
import {
  PagesBar,
  pageIdFromParam,
  pageParamOf,
  usePages,
} from "@/features/board-pages";
import {
  PreferencesMenuItems,
  usePreferences,
} from "@/features/board-preferences";
import {
  FollowingPill,
  PresenceBar,
  usePresence,
} from "@/features/board-presence";
import { usePendingImport } from "@/features/import-board";
import { NotificationsBell } from "@/features/notifications";
import { openRenameBoardDialog } from "@/features/rename-board";
import { openShareBoardDialog } from "@/features/share-board";
import { UserMenu } from "@/features/user-menu";
import { safeRedirect } from "@/shared/lib";
import { installLatinShortcuts } from "@/shared/lib/latin-shortcuts";

import { isPhoneSize } from "../model/chrome-fit";
import { PHONE_QUERY } from "../model/phone-query";
import { useCommentsSheet } from "../model/use-comments-sheet";
import { useCompactChrome } from "../model/use-compact-chrome";
import { BoardDrawer } from "./board-drawer";
import { BoardIdentity, BoardStatus, StatusAnnouncer } from "./board-identity";

// Excalidraw decides phone vs desktop from its own container size and updates it asynchronously, so a separate
// media query disagreed with it mid-resize. It is the single source of truth: this child reports its device up.
const DeviceReporter = ({
  onChange,
}: {
  onChange: (isMobile: boolean) => void;
}) => {
  const { isMobile } = useDevice().editor;
  useEffect(() => onChange(isMobile), [isMobile, onChange]);
  return null;
};

const PhoneBar = ({
  signedIn,
  status,
  canWrite,
  panelOpen,
  onPanelChange,
  onOpenDrawer,
}: {
  signedIn: boolean;
  status: CollabStatus;
  canWrite: boolean;
  panelOpen: boolean;
  onPanelChange: (open: boolean) => void;
  onOpenDrawer: () => void;
}) => (
  // Status sits on its own line so the action row stays narrow enough to clear Excalidraw's menu and undo buttons.
  <div className="pointer-events-none absolute bottom-8 left-1/2 z-[4] flex -translate-x-1/2 flex-col items-center gap-2 [&>*]:pointer-events-auto">
    <div className="bg-card shadow-elevated flex h-8 items-center rounded-full px-3">
      <BoardStatus status={status} canWrite={canWrite} compact />
    </div>
    <div className="flex items-center gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        className="h-11"
        onPress={onOpenDrawer}
      >
        <Users data-icon="inline-start" />
        Board
      </Button>
      <div className="bg-card shadow-elevated flex rounded-md [&_:is(button,a)]:size-11">
        <CommentsPanelToggle open={panelOpen} onChange={onPanelChange} />
        {signedIn ? <NotificationsBell /> : null}
      </div>
    </div>
  </div>
);

const BoardMainMenu = ({
  board,
  canWrite,
  isOwner,
  preferences,
}: {
  board: Board;
  canWrite: boolean;
  isOwner: boolean;
  preferences: ComponentProps<typeof PreferencesMenuItems>;
}) => {
  const navigate = useNavigate();
  const { theme = "system", setTheme } = useTheme();
  return (
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
      <PreferencesMenuItems {...preferences} />
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
  );
};

const useCollabUser = (): UserRef => {
  const { data: session } = useSession();
  const { data: me } = useMe();
  return {
    id: session?.user.id ?? "",
    name: me?.name ?? session?.user.name ?? "Guest",
    username: me?.username ?? null,
    avatarUrl: me?.avatarUrl ?? null,
  };
};

export const BoardEditor = ({
  board,
  shareToken,
  focusComment,
  pageParam,
  onPageChange,
}: {
  board: Board;
  shareToken?: string;
  focusComment?: string;
  pageParam?: string;
  onPageChange: (param: string) => void;
}) => {
  const user = useCollabUser();
  const { data: session } = useSession();
  const signedIn = Boolean(session);
  const href = useLocation({ select: (location) => location.href });
  const userId = user.id;

  const pageId = pageIdFromParam(pageParam);
  const setPageId = useCallback(
    (id: string) => {
      if (id !== pageId) {
        onPageChange(pageParamOf(id));
      }
    },
    [pageId, onPageChange]
  );
  const [commentMode, setCommentMode] = useState(false);
  const {
    value: drawerOpen,
    setTrue: handleOpenDrawer,
    setValue: handleDrawerOpenChange,
  } = useBoolean(false);
  const [editorIsPhone, setEditorIsPhone] = useState<boolean | null>(null);
  const queryIsPhone = useMediaQuery(PHONE_QUERY, false);
  const isPhone = editorIsPhone ?? queryIsPhone;
  const { resolvedTheme } = useTheme();
  const isOwner = board.role === "owner";
  const canvasRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [cluster, setCluster] = useState<HTMLDivElement | null>(null);

  const { api, bindApi, doc, awareness, status, onChange, onPointerUpdate } =
    useBoardCollab({
      boardId: board.id,
      user,
      pageId,
      canWrite: board.canWrite,
      shareToken,
    });
  // A denied connection leaves the board readable but nothing may be written through it.
  const writable = board.canWrite && status !== "no-access";
  // The top row drops to a second row when the name card or the actions would collide with Excalidraw's
  // centred toolbar; decided from measured boxes, not a viewport breakpoint.
  const isCompact = useCompactChrome({
    canvasRef,
    enabled: api !== null && !isPhone,
    card,
    cluster,
    liveStatus: status === "live",
  });
  const { onFiles } = useBoardMedia({
    boardId: board.id,
    doc,
    api,
    canWrite: writable,
    shareToken,
    pageId,
  });
  // Guests keep Excalidraw's in-memory library; only an account owns a persisted one.
  useHandleLibrary({
    excalidrawAPI: signedIn ? api : null,
    adapter: libraryAdapter,
  });
  usePendingImport({
    pageId,
    api,
    doc,
    ready: status === "live" && writable,
  });
  const pages = usePages({
    doc,
    synced: status === "live",
    canWrite: writable,
    pageId,
    setPageId,
  });
  const presence = usePresence({
    awareness,
    doc,
    live: status === "live",
    api,
    pageId,
    setPageId,
  });
  const preferences = usePreferences({ userId, api });
  const { env, panelOpen, setPanelOpen, focusedId, selectThread } =
    useCommentsWorkspace({
      boardId: board.id,
      shareToken,
      canWrite: writable,
      isOwner,
      userId,
      focusComment,
      api,
      pages: pages.pages,
      setPageId,
    });

  // Excalidraw's ResizeObserver updates its phone/desktop flag without re-rendering, so a live resize across the
  // breakpoint left the old layout (no page tabs or zoom) until some other update. This observer runs after its
  // own (created later); refresh() re-renders, and only when the flag flips so window drags don't redraw.
  useEffect(() => {
    const el = canvasRef.current;
    if (!(api && el)) {
      return;
    }
    let wasPhone = isPhoneSize(el.clientWidth, el.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const phone = isPhoneSize(width, height);
      if (phone !== wasPhone) {
        wasPhone = phone;
        api.refresh();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [api]);

  // Thai/non-Latin layouts report non-Latin `key`, so Excalidraw's tool shortcuts never match; shadow it per event.
  useEffect(() => {
    const el = canvasRef.current;
    return el ? installLatinShortcuts(el) : undefined;
  }, []);

  const presenceProps = {
    peers: presence.peers,
    followId: presence.followId,
    onFollow: presence.handleFollow,
  };
  const pagesProps = {
    pages: pages.pages,
    pageId,
    readOnly: !writable,
    onSelect: setPageId,
    onAdd: pages.handleAdd,
    onRename: pages.handleRename,
    onDelete: pages.handleDelete,
    onDuplicate: pages.handleDuplicate,
  };

  // Excalidraw's menu button ships without an accessible name; it remounts when the phone layout swaps in.
  useEffect(() => {
    if (api) {
      document
        .querySelector(".main-menu-trigger")
        ?.setAttribute("aria-label", "Board menu");
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- isPhone re-runs this after the remount
  }, [api, isPhone]);

  const { panelRef, sheetProps } = useCommentsSheet(panelOpen, () =>
    setPanelOpen(false)
  );

  const actions = (
    <>
      <PresenceBar {...presenceProps} />
      <div className="bg-card shadow-elevated flex items-center gap-1 rounded-lg p-1">
        {writable ? (
          <CommentModeToggle active={commentMode} onChange={setCommentMode} />
        ) : null}
        <CommentsPanelToggle open={panelOpen} onChange={setPanelOpen} />
        {signedIn ? <NotificationsBell /> : null}
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
      <UserMenu redirect={safeRedirect(href)} />
    </>
  );

  let chrome = (
    <BoardIdentity
      board={board}
      status={status}
      compact={false}
      cardRef={setCard}
    />
  );
  if (isPhone) {
    chrome = (
      <PhoneBar
        signedIn={signedIn}
        status={status}
        canWrite={writable}
        panelOpen={panelOpen}
        onPanelChange={setPanelOpen}
        onOpenDrawer={handleOpenDrawer}
      />
    );
  } else if (isCompact) {
    chrome = (
      <div className="pointer-events-none absolute inset-x-4 top-[68px] z-[4] flex items-center justify-between gap-2 [&>*]:pointer-events-auto">
        <BoardIdentity
          board={board}
          status={status}
          compact
          cardRef={setCard}
        />
        <div
          ref={setCluster}
          data-board-actions
          className="flex shrink-0 items-center gap-2"
        >
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      data-board-canvas
      data-chrome={isCompact && !isPhone ? "compact" : undefined}
      className="bg-background relative h-svh w-full overflow-hidden"
    >
      <Excalidraw
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        name={board.title}
        viewModeEnabled={!writable}
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
          // Phones: the toolbar row is already full, so the board button sits in the empty footer centre instead.
          isPhone || isCompact ? null : (
            <motion.div
              ref={setCluster}
              data-board-actions
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex shrink-0 items-center gap-2"
            >
              {actions}
            </motion.div>
          )
        }
      >
        <DeviceReporter onChange={setEditorIsPhone} />
        <BoardMainMenu
          board={board}
          canWrite={writable}
          isOwner={isOwner}
          preferences={{
            prefs: preferences.prefs,
            onChange: preferences.handleChange,
          }}
        />
        <Footer>{isPhone ? null : <PagesBar {...pagesProps} />}</Footer>
      </Excalidraw>
      <CommentsLayer
        env={env}
        key={pageId ?? ""}
        pageId={pageId}
        api={api}
        mode={commentMode && writable}
        focusedId={focusedId}
        onModeChange={setCommentMode}
        onSelect={selectThread}
      />
      {panelOpen ? (
        <aside
          ref={panelRef}
          data-comments-panel
          tabIndex={-1}
          {...sheetProps}
          className={`max-md:bg-background absolute inset-0 z-30 outline-none max-md:p-2.5 md:inset-x-auto md:right-3 md:bottom-3 md:w-96 ${
            isCompact ? "md:top-[124px]" : "md:top-[76px]"
          }`}
        >
          <CommentsPanel
            env={env}
            pageId={pageId}
            focusedId={focusedId}
            startAllPages={focusComment !== undefined}
            onSelect={selectThread}
            onClose={() => setPanelOpen(false)}
          />
        </aside>
      ) : null}
      {isPhone ? (
        // Stays visible with the drawer closed; below Excalidraw's toolbar, clear of the notch.
        <div className="pointer-events-none absolute inset-x-0 top-[max(5rem,calc(env(safe-area-inset-top)+4.5rem))] z-[4] flex justify-center [&>*]:pointer-events-auto">
          <FollowingPill {...presenceProps} touch />
        </div>
      ) : null}
      {chrome}
      <StatusAnnouncer status={status} />
      <BoardDrawer
        isOpen={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        board={board}
        canWrite={writable}
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
