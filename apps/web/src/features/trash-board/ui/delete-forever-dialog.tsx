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

import { usePurgeBoard } from "@/entities/board";
import type { Board } from "@/entities/board";
import { deleteBoardCache } from "@/entities/drawing";
import { useSession } from "@/entities/session";

const DeleteForeverDialog = ({
  board,
  isOpen,
  close,
  unmount,
  onDeleted,
}: {
  board: Board;
  isOpen: boolean;
  close: () => void;
  unmount: () => void;
  onDeleted: () => void;
}) => {
  const purge = usePurgeBoard();
  const { data: session } = useSession();
  const userId = session?.user.id;

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      onExitComplete={() => {
        unmount();
        // The dialog hands focus back to its trigger, which left with the deleted row; move it on after that.
        if (purge.isSuccess) {
          requestAnimationFrame(onDeleted);
        }
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle className="font-display text-feature font-normal">
          Delete “{board.title}” forever?
        </AlertDialogTitle>
        <AlertDialogDescription>
          The board, its pages, comments and uploaded images are removed
          permanently. This cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
        {/* Stays open until the request settles so the error toast still has a mounted observer. */}
        <AlertDialogAction
          slot={null}
          variant="destructive"
          isDisabled={purge.isPending}
          onPress={() =>
            purge.mutate(board.id, {
              onSuccess: () => {
                if (userId) {
                  deleteBoardCache(userId, board.id);
                }
                close();
              },
              onError: (error) => toast.error(error.message),
            })
          }
        >
          Delete forever
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialog>
  );
};

export const openDeleteForeverDialog = (
  board: Board,
  onDeleted: () => void
) => {
  overlay.open((control) => (
    <DeleteForeverDialog board={board} onDeleted={onDeleted} {...control} />
  ));
};
