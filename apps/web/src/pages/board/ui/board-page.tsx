import { buttonVariants } from "@narbel/ui/components/button";
import { Link } from "@tanstack/react-router";

import { useBoard } from "@/entities/board";
import { UnlockBoardForm } from "@/features/share-board";
import { ApiError } from "@/shared/api";
import { Loader } from "@/shared/ui";
import { BoardCanvas } from "@/widgets/board-canvas";

export const BoardPage = ({
  boardId,
  shareToken,
}: {
  boardId: string;
  shareToken?: string;
}) => {
  const { data: board, isPending, error } = useBoard(boardId, shareToken);

  if (isPending) {
    return <Loader />;
  }

  if (error instanceof ApiError && error.status === 403) {
    return <UnlockBoardForm boardId={boardId} />;
  }

  if (error || !board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-5 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-title leading-tight font-normal">
            Board not found
          </h1>
          <p className="text-muted-foreground text-sm">
            It may have been deleted, or it belongs to someone else.
          </p>
        </div>
        <Link
          to="/dashboard"
          className={buttonVariants({ variant: "secondary" })}
        >
          Back to boards
        </Link>
      </div>
    );
  }

  return <BoardCanvas board={board} shareToken={shareToken} />;
};
