import { useBoard } from "@/entities/board";
import { UnlockBoardForm } from "@/features/share-board";
import { ApiError } from "@/shared/api";
import { NotFound } from "@/shared/ui";
import { BoardCanvas, BoardSkeleton } from "@/widgets/board-canvas";
import { Header } from "@/widgets/header";

// The root hides the global header on board routes; states without the editor still need a way out.
const WithHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-svh flex-col">
    <Header />
    <div className="flex flex-1 flex-col">{children}</div>
  </div>
);

export const BoardPage = ({
  boardId,
  shareToken,
}: {
  boardId: string;
  shareToken?: string;
}) => {
  const { data: board, isPending, error } = useBoard(boardId, shareToken);

  if (isPending) {
    return <BoardSkeleton />;
  }

  if (error instanceof ApiError && error.status === 403) {
    return (
      <WithHeader>
        <UnlockBoardForm boardId={boardId} />
      </WithHeader>
    );
  }

  if (error || !board) {
    return (
      <WithHeader>
        <NotFound
          title="Board not found"
          description="It may have been deleted, or it belongs to someone else."
          to="/dashboard"
          action="Back to boards"
        />
      </WithHeader>
    );
  }

  return <BoardCanvas board={board} shareToken={shareToken} />;
};
