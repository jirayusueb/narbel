import { Button } from "@narbel/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@narbel/ui/components/dialog";
import { Input } from "@narbel/ui/components/input";
import { Copy, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { overlay } from "overlay-kit";
import { useId, useState } from "react";

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
      onPress={() => openRenamePage(page, (name) => onRename(page.id, name))}
    >
      <Pencil />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Duplicate ${page.name}`}
      onPress={() => onDuplicate(page.id)}
    >
      <Copy />
    </Button>
    {canDelete ? (
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${page.name}`}
        onPress={() => onDelete(page.id)}
      >
        <Trash2 />
      </Button>
    ) : null}
  </>
);

// Floating tab island for the canvas footer; the active tab's sheet slides between pages.
export const PagesBar = ({
  pages,
  pageId,
  readOnly,
  onSelect,
  onAdd,
  ...actions
}: PagesProps) => {
  const group = useId();
  return (
    <nav
      aria-label="Pages"
      className="bg-card flex max-w-[min(560px,calc(100vw-420px))] [scrollbar-width:none] items-center gap-0.5 overflow-x-auto rounded-[15px] p-1 shadow-[var(--shadow-island)] [&::-webkit-scrollbar]:hidden"
    >
      <LayoutGroup id={group}>
        {pages.map((page) => {
          const active = page.id === pageId;
          return (
            <div
              key={page.id}
              className={`relative flex h-8 shrink-0 items-center rounded-[10px] ${active ? "text-foreground pr-1" : "text-muted-foreground"}`}
            >
              {active ? (
                <motion.span
                  layoutId="active-page"
                  aria-hidden="true"
                  className="bg-background absolute inset-0 rounded-[10px]"
                  transition={{ duration: 0.3, ease: [0.6, 0, 0.1, 1] }}
                />
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className={`relative text-[13px] text-inherit hover:bg-transparent ${active ? "font-medium" : "hover:text-foreground"}`}
                aria-current={active ? "page" : undefined}
                onPress={() => onSelect(page.id)}
              >
                {page.name}
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
                    {...actions}
                  />
                </motion.span>
              ) : null}
            </div>
          );
        })}
      </LayoutGroup>
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
  ...actions
}: PagesProps) => (
  <nav aria-label="Pages" className="flex flex-col gap-1">
    {pages.map((page) => {
      const active = page.id === pageId;
      return (
        <div
          key={page.id}
          className={`flex items-center gap-1 rounded-[12px] pr-1 ${active ? "bg-card shadow-surface" : ""}`}
        >
          <Button
            variant="ghost"
            className={`h-11 flex-1 justify-start rounded-[12px] px-3 ${active ? "font-medium hover:bg-transparent" : "text-muted-foreground font-normal"}`}
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
              {...actions}
            />
          ) : null}
        </div>
      );
    })}
    {readOnly ? null : (
      <Button
        variant="ghost"
        className="text-muted-foreground h-11 justify-start rounded-[12px] px-3 font-normal"
        onPress={onAdd}
      >
        <Plus data-icon="inline-start" />
        Add page
      </Button>
    )}
  </nav>
);
