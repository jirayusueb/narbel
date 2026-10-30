import { useLocation } from "@tanstack/react-router";

import { useBoard } from "@/entities/board";
import { useSession } from "@/entities/session";
import { UnlockBoardForm } from "@/features/share-board";
import { ApiError } from "@/shared/api";
import { safeRedirect } from "@/shared/lib";
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
  focusComment,
  pageParam,
  onPageChange,
}: {
  boardId: string;
  shareToken?: string;
  focusComment?: string;
  pageParam?: string;
  onPageChange: (param: string) => void;
}) => {
  const { data: board, isPending, error } = useBoard(boardId, shareToken);
  const { data: session } = useSession();
  const href = useLocation({ select: (location) => location.href });

  if (isPending) {
    return <BoardSkeleton />;
  }

  // A failed background refetch keeps `data`; only a real 403/404 may replace a board already on screen.
  const gone =
    error instanceof ApiError && (error.status === 403 || error.status === 404);
  if (board && !gone) {
    return (
      <BoardCanvas
        board={board}
        shareToken={shareToken}
        focusComment={focusComment}
        pageParam={pageParam}
        onPageChange={onPageChange}
      />
    );
  }

  if (error instanceof ApiError && error.status === 403) {
    return (
      <WithHeader>
        <UnlockBoardForm boardId={boardId} />
      </WithHeader>
    );
  }

  return (
    <WithHeader>
      <NotFound
        title="Board not found"
        description="It may have been deleted, or it belongs to someone else."
        to="/dashboard"
        action="Back to boards"
        signInRedirect={session ? undefined : safeRedirect(href)}
      />
    </WithHeader>
  );
};
