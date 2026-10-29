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
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCreateBoard } from "@/entities/board";

export const CreateBoardDialog = () => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const navigate = useNavigate();
  const create = useCreateBoard();
  const trimmed = title.trim();

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button>
        <Plus data-icon="inline-start" />
        New board
      </Button>
      <Dialog>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(trimmed, {
              onSuccess: (board) => {
                setOpen(false);
                setTitle("");
                navigate({
                  to: "/boards/$boardId",
                  params: { boardId: board.id },
                });
              },
              onError: (error) => toast.error(error.message),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-feature font-normal">
              New board
            </DialogTitle>
            <DialogDescription>
              Give your board a name. You can rename it later.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="create-board-title">Title</FieldLabel>
              <Input
                id="create-board-title"
                autoFocus
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose variant="ghost">Cancel</DialogClose>
            <Button type="submit" isDisabled={!trimmed || create.isPending}>
              {create.isPending ? <Spinner data-icon="inline-start" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  );
};
