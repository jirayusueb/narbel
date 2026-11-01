import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { useBoard } from "@/entities/board";
import { deleteBoardCache } from "@/entities/drawing";
import { useSession } from "@/entities/session";
import { UnlockBoardForm } from "@/features/share-board";
import { ApiError } from "@/shared/api";
import { safeRedirect, useDocumentTitle } from "@/shared/lib";
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
  // A failed background refetch keeps `data`; only a real 403/404 may replace a board already on screen.
  const gone =
    error instanceof ApiError && (error.status === 403 || error.status === 404);
  const userId = session?.user.id;
  // Trash is not a refusal: the local copy stays, so edits not yet synced survive a restore.
  const trashed = error instanceof ApiError && error.status === 410;
  // The cached copy is no longer the user's to read once the server refuses it.
  useEffect(() => {
    if (gone && userId) {
      deleteBoardCache(userId, boardId);
    }
  }, [gone, userId, boardId]);
  const locked = error instanceof ApiError && error.status === 403;
  // While loading, a previous board's name must not linger; the not-found states name themselves.
  let documentTitle: string | undefined;
  if (isPending) {
    documentTitle = "Board";
  } else if (board && !gone && !trashed) {
    documentTitle = board.title;
  } else if (locked) {
    documentTitle = "Unlock board";
  }
  useDocumentTitle(documentTitle);

  if (isPending) {
    return <BoardSkeleton />;
  }

  if (trashed) {
    return (
      <WithHeader>
        <NotFound
          title="This board is in the trash"
          documentTitle="Board in trash"
          description="Its owner moved it to the trash. Edits made on this device are kept and sync again if it is restored."
          says="Found it in the trash. Only its owner can bring it back."
          to="/dashboard"
          action="Back to boards"
        />
      </WithHeader>
    );
  }

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

  if (locked) {
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
        documentTitle="Board not found"
        description="It may have been deleted, or it belongs to someone else."
        to="/dashboard"
        action="Back to boards"
        signInRedirect={session ? undefined : safeRedirect(href)}
      />
    </WithHeader>
  );
};
