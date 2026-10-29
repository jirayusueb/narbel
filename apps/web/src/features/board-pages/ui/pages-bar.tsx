import { Button } from "@narbel/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@narbel/ui/components/dialog";
import { Input } from "@narbel/ui/components/input";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Page } from "../model/use-pages";

const RenamePageDialog = ({
  page,
  onRename,
}: {
  page: Page;
  onRename: (name: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(page.name);
  const trimmed = name.trim();

  return (
    <DialogTrigger
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(page.name);
        }
      }}
    >
      <Button variant="ghost" size="icon-xs" aria-label={`Rename ${page.name}`}>
        <Pencil />
      </Button>
      <Dialog>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(trimmed);
            setOpen(false);
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
      </Dialog>
    </DialogTrigger>
  );
};

export const PagesBar = ({
  pages,
  pageId,
  readOnly,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onDuplicate,
}: {
  pages: Page[];
  pageId: string | null;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) => (
  <nav
    aria-label="Pages"
    className="bg-background flex h-11 shrink-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-12px),transparent)] px-3 [&::-webkit-scrollbar]:hidden"
  >
    {pages.map((page) => {
      const active = page.id === pageId;
      return (
        <div
          key={page.id}
          className={`flex h-8 shrink-0 items-center gap-0.5 rounded-[10px] transition-colors duration-150 ${
            active
              ? "bg-card shadow-surface text-foreground pr-1 font-medium"
              : "text-muted-foreground hover:bg-accent"
          }`}
        >
          <Button
            variant="ghost"
            size="sm"
            className="font-[inherit] text-[13px] text-inherit hover:bg-transparent"
            aria-current={active ? "page" : undefined}
            onPress={() => onSelect(page.id)}
          >
            {page.name}
          </Button>
          {active && !readOnly ? (
            <>
              <RenamePageDialog
                page={page}
                onRename={(name) => onRename(page.id, name)}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Duplicate ${page.name}`}
                onPress={() => onDuplicate(page.id)}
              >
                <Copy />
              </Button>
              {pages.length > 1 ? (
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
          ) : null}
        </div>
      );
    })}
    {readOnly ? null : (
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Add page"
        onPress={onAdd}
      >
        <Plus />
      </Button>
    )}
  </nav>
);
