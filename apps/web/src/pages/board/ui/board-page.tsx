import { buttonVariants } from "@narbel/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@narbel/ui/components/empty";
import { Link } from "@tanstack/react-router";

import { useBoard } from "@/entities/board";
import { Loader } from "@/shared/ui";
import { BoardCanvas } from "@/widgets/board-canvas";

export const BoardPage = ({ boardId }: { boardId: string }) => {
  const { data: board, isPending, error } = useBoard(boardId);

  if (isPending) {
    return <Loader />;
  }

  if (error || !board) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Board not found</EmptyTitle>
          <EmptyDescription>
            It may have been deleted, or it belongs to someone else.
          </EmptyDescription>
        </EmptyHeader>
        <Link
          to="/dashboard"
          className={buttonVariants({ variant: "outline" })}
        >
          Back to boards
        </Link>
      </Empty>
    );
  }

  return <BoardCanvas board={board} />;
};
