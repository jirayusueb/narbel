import { Excalidraw, Footer, MainMenu } from "@narbel/ndraw";

import "@narbel/ndraw/index.css";
import "./excalidraw-theme.css";
import { buttonVariants } from "@narbel/ui/components/button";
import { useEventListener, useMediaQuery } from "@reactuses/core";
import { Link } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useRef, useState } from "react";

import { useSession } from "@/entities/session";
import { useBoardCollab } from "@/features/board-collab";
import { PagesBar, usePages } from "@/features/board-pages";
import { onLatinShortcutKeyDown } from "@/shared/lib/latin-shortcuts";
import { BrandMark } from "@/shared/ui";

import { PHONE_QUERY } from "../model/phone-query";
import { BoardStatus } from "./board-identity";

const SCRATCH_ID = "scratch";
const GUEST = { id: "", name: "Guest", username: null, avatarUrl: null };

// A board that lives only in this browser: no account, no socket, no upload. Images are off because
// their bytes would need the server's file store.
export const ScratchEditor = () => {
  const { data: session } = useSession();
  const signedIn = Boolean(session);
  const isPhone = useMediaQuery(PHONE_QUERY, false);
  const { resolvedTheme, theme = "system", setTheme } = useTheme();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pageId, setPageId] = useState<string | null>(null);

  const { bindApi, doc, status, onChange } = useBoardCollab({
    boardId: SCRATCH_ID,
    user: GUEST,
    pageId,
    canWrite: true,
    deviceOnly: true,
  });
  const pages = usePages({
    doc,
    synced: status === "local",
    canWrite: true,
    pageId,
    setPageId,
  });

  useEventListener("keydown", onLatinShortcutKeyDown, canvasRef, true);

  let accountLabel = isPhone ? "Sign up" : "Sign up to share";
  if (signedIn) {
    accountLabel = "Your boards";
  }

  return (
    <div
      ref={canvasRef}
      data-board-canvas
      className="bg-background relative h-svh w-full overflow-hidden"
    >
      <div
        className={
          isPhone
            ? "bg-card shadow-elevated absolute top-[max(5rem,calc(env(safe-area-inset-top)+4.5rem))] left-1/2 z-[3] flex h-10 -translate-x-1/2 items-center gap-1.5 rounded-lg p-1 pr-3"
            : "bg-card shadow-elevated absolute top-4 left-[68px] z-[3] flex h-10 items-center gap-1.5 rounded-lg p-1 pr-3"
        }
      >
        <Link
          to="/"
          aria-label="narbel home"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <BrandMark className="size-5" />
        </Link>
        <h1 className="font-display text-chrome px-1.5">Scratch</h1>
        <BoardStatus status={status} canWrite compact={isPhone} />
        <Link
          to={signedIn ? "/dashboard" : "/sign-up"}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "ml-1",
          })}
        >
          {accountLabel}
        </Link>
      </div>
      <Excalidraw
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        name="Scratch"
        excalidrawAPI={bindApi}
        UIOptions={{
          canvasActions: { toggleTheme: true },
          tools: { image: false },
        }}
        onChange={onChange}
      >
        <MainMenu>
          <MainMenu.DefaultItems.ToggleTheme
            allowSystemTheme
            theme={theme as "light" | "dark" | "system"}
            onSelect={setTheme}
          />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
        <Footer>
          {isPhone ? null : (
            <PagesBar
              pages={pages.pages}
              pageId={pageId}
              readOnly={false}
              onSelect={setPageId}
              onAdd={pages.handleAdd}
              onRename={pages.handleRename}
              onDelete={pages.handleDelete}
              onDuplicate={pages.handleDuplicate}
            />
          )}
        </Footer>
      </Excalidraw>
    </div>
  );
};
