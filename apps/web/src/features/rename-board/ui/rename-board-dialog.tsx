import { Button } from "@narbel/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@narbel/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@narbel/ui/components/field";
import { Input } from "@narbel/ui/components/input";
import { Spinner } from "@narbel/ui/components/spinner";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useRenameBoard } from "@/entities/board";
import type { Board } from "@/entities/board";

export const RenameBoardDialog = ({ board }: { board: Board }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(board.title);
  const rename = useRenameBoard();
  const trimmed = title.trim();

  return (
    <DialogTrigger
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTitle(board.title);
        }
      }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Rename ${board.title}`}
      >
        <Pencil />
      </Button>
      <Dialog>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            rename.mutate(
              { id: board.id, title: trimmed },
              {
                onSuccess: () => setOpen(false),
                onError: (error) => toast.error(error.message),
              }
            );
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-feature font-normal">
              Rename board
            </DialogTitle>
            <DialogDescription>
              Titles are 1 to 120 characters.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`rename-board-${board.id}`}>
                Title
              </FieldLabel>
              <Input
                id={`rename-board-${board.id}`}
                autoFocus
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose variant="ghost">Cancel</DialogClose>
            <Button type="submit" isDisabled={!trimmed || rename.isPending}>
              {rename.isPending ? <Spinner data-icon="inline-start" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  );
};
