import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@narbel/ui/components/alert-dialog";
import { Button } from "@narbel/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@narbel/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@narbel/ui/components/dropdown-menu";
import { Input } from "@narbel/ui/components/input";
import {
  useEvent,
  useEventListener,
  useReducedMotion,
  useResizeObserver,
} from "@reactuses/core";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  List,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { overlay } from "overlay-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";

import type { Page } from "../model/use-pages";

const RenamePageForm = ({
  page,
  onRename,
  onDone,
}: {
  page: Page;
  onRename: (name: string) => void;
  onDone: () => void;
}) => {
  const [name, setName] = useState(page.name);
  const trimmed = name.trim();
  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        onRename(trimmed);
        onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename page</DialogTitle>
      </DialogHeader>
      <Input
        autoFocus
        maxLength={60}
        aria-label="Page name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <DialogFooter>
        <DialogClose>Cancel</DialogClose>
        <Button type="submit" isDisabled={!trimmed}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
};

const openRenamePage = (page: Page, onRename: (name: string) => void) =>
  overlay.open(({ isOpen, close, unmount }) => (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      onExitComplete={unmount}
    >
      <RenamePageForm page={page} onRename={onRename} onDone={close} />
    </Dialog>
  ));

// Deleting waits for the dialog to finish closing so its focus restore cannot overwrite ours.
const openDeletePage = (page: Page, onConfirm: () => void) => {
  let confirmed = false;
  return overlay.open(({ isOpen, close, unmount }) => (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      onExitComplete={() => {
        unmount();
        if (confirmed) {
          onConfirm();
        }
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle className="font-display text-feature font-normal">
          Delete “{page.name}”?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Every element on this page is removed for everyone on the board. This
          can’t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
        <AlertDialogAction
          slot={null}
          variant="destructive"
          onPress={() => {
            confirmed = true;
            close();
          }}
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialog>
  ));
};

// After delete or duplicate the active page changes; focus follows it instead of falling to <body>.
const useFocusActiveTab = (
  nav: RefObject<HTMLElement | null>,
  pageId: string | null,
  pages: Page[]
) => {
  const wanted = useRef(false);
  useEffect(() => {
    if (!wanted.current) {
      return;
    }
    const tab = nav.current?.querySelector<HTMLElement>(
      "[data-page-tab][aria-current=page]"
    );
    // The previous page id lingers for a render after delete; wait for the real active tab.
    if (tab && pages.some((page) => page.id === pageId)) {
      wanted.current = false;
      tab.focus();
    }
  }, [nav, pageId, pages]);
  return () => {
    wanted.current = true;
  };
};

interface PagesProps {
  pages: Page[];
  pageId: string | null;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

// Visual size stays 28px; on touch an invisible inset grows the hit area to 44px.
const TOUCH =
  "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2";

const PageActions = ({
  page,
  canDelete,
  onRename,
  onDelete,
  onDuplicate,
}: {
  page: Page;
  canDelete: boolean;
} & Pick<PagesProps, "onRename" | "onDelete" | "onDuplicate">) => (
  <>
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Rename ${page.name}`}
      className={TOUCH}
      onPress={() => openRenamePage(page, (name) => onRename(page.id, name))}
    >
      <Pencil />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Duplicate ${page.name}`}
      className={TOUCH}
      onPress={() => onDuplicate(page.id)}
    >
      <Copy />
    </Button>
    {canDelete ? (
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${page.name}`}
        className={TOUCH}
        onPress={() => openDeletePage(page, () => onDelete(page.id))}
      >
        <Trash2 />
      </Button>
    ) : null}
  </>
);

// The strip scrolls invisibly once pages overflow. Controls appear on overflow alone, never on
// scroll position, so the strip's width stays put while it scrolls.
const useStripEdges = (strip: RefObject<HTMLElement | null>, pages: Page[]) => {
  const [edges, setEdges] = useState({
    overflow: false,
    atStart: true,
    atEnd: true,
  });
  const measure = useEvent(() => {
    const el = strip.current;
    if (!el) {
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    const next = {
      overflow: max > 1,
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft >= max - 1,
    };
    // Scroll fires every frame; only a flipped edge should re-render the tabs.
    setEdges((prev) =>
      prev.overflow === next.overflow &&
      prev.atStart === next.atStart &&
      prev.atEnd === next.atEnd
        ? prev
        : next
    );
  });
  useEventListener("scroll", measure, strip, { passive: true });
  useResizeObserver(strip, measure);
  // oxlint-disable-next-line react/exhaustive-effect-dependencies -- pages re-measures after a tab is added, renamed or removed
  useEffect(() => measure(), [measure, pages]);
  return edges;
};

// Floating tab island for the canvas footer; the active tab's sheet slides between pages.
// Past overflow, chevrons and an all-pages menu keep every page reachable without a scrollbar.
export const PagesBar = ({
  pages,
  pageId,
  readOnly,
  onSelect,
  onAdd,
  onDelete,
  onDuplicate,
  ...actions
}: PagesProps) => {
  const group = useId();
  const nav = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const focusActive = useFocusActiveTab(nav, pageId, pages);
  const edges = useStripEdges(strip, pages);
  const scrollBehavior = useReducedMotion() ? "auto" : "smooth";
  const nudge = (direction: 1 | -1) => {
    const el = strip.current;
    el?.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: scrollBehavior,
    });
  };

  // The active tab must stay in view; the strip shows no scrollbar of its own. A new page's id
  // arrives before its tab, and overflow changes the strip's width, so both re-run it.
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>("[data-page-tab][aria-current=page]")
      ?.parentElement?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: scrollBehavior,
      });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- see above
  }, [pageId, pages, edges.overflow, scrollBehavior]);

  return (
    <nav
      ref={nav}
      aria-label="Pages"
      className="bg-card flex max-w-[min(560px,calc(100vw-420px))] items-center gap-0.5 rounded-lg p-1 shadow-[var(--shadow-island)]"
    >
      {edges.overflow ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Scroll to earlier pages"
          className="shrink-0"
          isDisabled={edges.atStart}
          onPress={() => nudge(-1)}
        >
          <ChevronLeft />
        </Button>
      ) : null}
      <div
        ref={strip}
        className="flex min-w-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        <LayoutGroup id={group}>
          {pages.map((page) => {
            const active = page.id === pageId;
            return (
              <div
                key={page.id}
                className={`relative flex h-8 shrink-0 items-center rounded-md ${active ? "text-foreground pr-1" : "text-muted-foreground"}`}
              >
                {active ? (
                  <motion.span
                    layoutId="active-page"
                    aria-hidden="true"
                    className="bg-background absolute inset-0 rounded-md"
                    transition={{ duration: 0.3, ease: [0.6, 0, 0.1, 1] }}
                  />
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className={`relative text-[13px] text-inherit hover:bg-transparent ${active ? "font-medium" : "hover:text-foreground"}`}
                  data-page-tab
                  aria-current={active ? "page" : undefined}
                  onPress={() => onSelect(page.id)}
                >
                  <span className="inline-block max-w-40 truncate">
                    {page.name}
                  </span>
                </Button>
                {active && !readOnly ? (
                  <motion.span
                    className="relative flex"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.1 }}
                  >
                    <PageActions
                      page={page}
                      canDelete={pages.length > 1}
                      onDelete={(id) => {
                        focusActive();
                        onDelete(id);
                      }}
                      onDuplicate={(id) => {
                        focusActive();
                        onDuplicate(id);
                      }}
                      {...actions}
                    />
                  </motion.span>
                ) : null}
              </div>
            );
          })}
        </LayoutGroup>
      </div>
      {edges.overflow ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Scroll to later pages"
          className="shrink-0"
          isDisabled={edges.atEnd}
          onPress={() => nudge(1)}
        >
          <ChevronRight />
        </Button>
      ) : null}
      {edges.overflow ? (
        <DropdownMenuTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="All pages"
            className="shrink-0"
          >
            <List />
          </Button>
          <DropdownMenu placement="top end" className="min-w-56">
            <DropdownMenuGroup
              aria-label="Pages"
              selectionMode="single"
              selectedKeys={pageId ? [pageId] : []}
              onSelectionChange={(keys) => {
                const [next] = [...(keys === "all" ? [] : keys)];
                if (next) {
                  onSelect(String(next));
                }
              }}
            >
              {pages.map((page) => (
                <DropdownMenuItem
                  key={page.id}
                  id={page.id}
                  textValue={page.name}
                >
                  <span className="max-w-64 truncate">{page.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenu>
        </DropdownMenuTrigger>
      ) : null}
      {readOnly ? null : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Add page"
          onPress={onAdd}
        >
          <Plus />
        </Button>
      )}
    </nav>
  );
};

// Vertical variant for the mobile board drawer.
export const PagesList = ({
  pages,
  pageId,
  readOnly,
  onSelect,
  onAdd,
  onDelete,
  onDuplicate,
  ...actions
}: PagesProps) => {
  const nav = useRef<HTMLElement>(null);
  const focusActive = useFocusActiveTab(nav, pageId, pages);
  return (
    <nav ref={nav} aria-label="Pages" className="flex flex-col gap-1">
      {pages.map((page) => {
        const active = page.id === pageId;
        return (
          <div
            key={page.id}
            className={`flex items-center gap-1 rounded-md pr-1 ${active ? "bg-card shadow-surface" : ""}`}
          >
            <Button
              variant="ghost"
              className={`h-11 flex-1 justify-start rounded-md px-3 ${active ? "font-medium hover:bg-transparent" : "text-muted-foreground font-normal"}`}
              data-page-tab
              aria-current={active ? "page" : undefined}
              onPress={() => onSelect(page.id)}
            >
              <FileText data-icon="inline-start" />
              <span className="truncate">{page.name}</span>
            </Button>
            {active && !readOnly ? (
              <PageActions
                page={page}
                canDelete={pages.length > 1}
                onDelete={(id) => {
                  focusActive();
                  onDelete(id);
                }}
                onDuplicate={(id) => {
                  focusActive();
                  onDuplicate(id);
                }}
                {...actions}
              />
            ) : null}
          </div>
        );
      })}
      {readOnly ? null : (
        <Button
          variant="ghost"
          className="text-muted-foreground h-11 justify-start rounded-md px-3 font-normal"
          onPress={onAdd}
        >
          <Plus data-icon="inline-start" />
          Add page
        </Button>
      )}
    </nav>
  );
};
