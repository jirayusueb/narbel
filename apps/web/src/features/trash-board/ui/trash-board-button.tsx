import { Button } from "@narbel/ui/components/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useRestoreBoard, useTrashBoard } from "@/entities/board";
import type { Board } from "@/entities/board";

export const TrashBoardButton = ({ board }: { board: Board }) => {
  const trash = useTrashBoard();
  const restore = useRestoreBoard();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Move ${board.title} to trash`}
      isDisabled={trash.isPending}
      onPress={() =>
        trash.mutate(board.id, {
          onSuccess: () =>
            toast(`Moved “${board.title}” to trash`, {
              description:
                "It is hidden for everyone it was shared with until you restore it.",
              action: {
                label: "Undo",
                onClick: () =>
                  restore.mutate(board.id, {
                    onError: (error) => toast.error(error.message),
                  }),
              },
            }),
          onError: (error) => toast.error(error.message),
        })
      }
    >
      <Trash2 />
    </Button>
  );
};
