import { Button } from "@narbel/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@narbel/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@narbel/ui/components/field";
import { Input } from "@narbel/ui/components/input";
import { Spinner } from "@narbel/ui/components/spinner";
import { overlay } from "overlay-kit";
import { useState } from "react";
import { toast } from "sonner";

import type { Board } from "@/entities/board";

import { useRenameBoard } from "../api/use-rename-board";

interface DialogControl {
  isOpen: boolean;
  close: () => void;
  unmount: () => void;
}

const RenameBoardDialog = ({
  board,
  isOpen,
  close,
  unmount,
}: DialogControl & { board: Board }) => {
  const [title, setTitle] = useState(board.title);
  const rename = useRenameBoard();
  const trimmed = title.trim();

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      onExitComplete={unmount}
    >
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          rename.mutate(
            { id: board.id, title: trimmed },
            {
              onSuccess: close,
              onError: (error) => toast.error(error.message),
            }
          );
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-feature font-normal">
            Rename board
          </DialogTitle>
          <DialogDescription>Titles are 1 to 120 characters.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`rename-board-${board.id}`}>Title</FieldLabel>
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
  );
};

export const openRenameBoardDialog = (board: Board) => {
  overlay.open((control) => <RenameBoardDialog board={board} {...control} />);
};
