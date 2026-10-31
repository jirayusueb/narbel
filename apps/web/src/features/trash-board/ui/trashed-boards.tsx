import { Button } from "@narbel/ui/components/button";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useRestoreBoard, useTrashedBoards } from "@/entities/board";
import type { Board } from "@/entities/board";

import { openDeleteForeverDialog } from "./delete-forever-dialog";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const TrashedBoardRow = ({ board }: { board: Board }) => {
  const restore = useRestoreBoard();
  return (
    <li className="bg-card shadow-surface flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-display text-feature leading-tight font-normal break-words">
          {board.title}
        </h3>
        {board.trashedAt ? (
          <p className="text-subtle-foreground text-[13px]">
            Moved to trash{" "}
            <time dateTime={board.trashedAt}>
              {formatter.format(new Date(board.trashedAt))}
            </time>
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          aria-label={`Restore ${board.title}`}
          isDisabled={restore.isPending}
          onPress={() =>
            restore.mutate(board.id, {
              onSuccess: () => toast(`Restored “${board.title}”`),
              onError: (error) => toast.error(error.message),
            })
          }
        >
          <RotateCcw data-icon="inline-start" />
          Restore
        </Button>
        <Button
          variant="ghost"
          aria-label={`Delete ${board.title} forever`}
          onPress={() => openDeleteForeverDialog(board)}
        >
          <Trash2 data-icon="inline-start" />
          Delete forever
        </Button>
      </div>
    </li>
  );
};

export const TrashedBoards = () => {
  const { data: boards, error } = useTrashedBoards();

  if (error) {
    return <p className="text-destructive text-sm">{error.message}</p>;
  }
  if (!boards?.length) {
    return null;
  }
  return (
    <section
      aria-labelledby="trash-heading"
      className="mt-20 flex flex-col gap-6"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="trash-heading"
          className="font-display text-headline leading-tight font-normal"
        >
          Trash
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          Boards in the trash are hidden from you and everyone you shared them
          with. Restore one to bring back its pages, images and sharing exactly
          as they were. Nothing here is deleted until you choose Delete forever.
        </p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {boards.map((board) => (
          <TrashedBoardRow key={board.id} board={board} />
        ))}
      </ul>
    </section>
  );
};
