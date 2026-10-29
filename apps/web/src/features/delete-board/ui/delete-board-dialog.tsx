import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@narbel/ui/components/alert-dialog";
import { overlay } from "overlay-kit";
import { toast } from "sonner";

import { useDeleteBoard } from "@/entities/board";
import type { Board } from "@/entities/board";

const DeleteBoardDialog = ({
  board,
  isOpen,
  close,
  unmount,
}: {
  board: Board;
  isOpen: boolean;
  close: () => void;
  unmount: () => void;
}) => {
  const remove = useDeleteBoard();

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      onExitComplete={unmount}
    >
      <AlertDialogHeader>
        <AlertDialogTitle className="font-display text-feature font-normal">
          Delete “{board.title}”?
        </AlertDialogTitle>
        <AlertDialogDescription>
          The board and its uploaded images are removed permanently.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
        {/* Stays open until the request settles so the error toast still has a mounted observer. */}
        <AlertDialogAction
          slot={null}
          variant="destructive"
          isDisabled={remove.isPending}
          onPress={() =>
            remove.mutate(board.id, {
              onSuccess: close,
              onError: (error) => toast.error(error.message),
            })
          }
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialog>
  );
};

export const openDeleteBoardDialog = (board: Board) => {
  overlay.open((control) => <DeleteBoardDialog board={board} {...control} />);
};
