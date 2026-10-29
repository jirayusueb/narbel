import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@narbel/ui/components/alert-dialog";
import { Button } from "@narbel/ui/components/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useDeleteBoard } from "@/entities/board";
import type { Board } from "@/entities/board";

export const DeleteBoardDialog = ({ board }: { board: Board }) => {
  const remove = useDeleteBoard();

  return (
    <AlertDialogTrigger>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${board.title}`}
      >
        <Trash2 />
      </Button>
      <AlertDialog>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{board.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The board and its uploaded images are removed permanently.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onPress={() =>
              remove.mutate(board.id, {
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialog>
    </AlertDialogTrigger>
  );
};
