import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { onboardedIfSignedIn } from "@/app";
import { BoardPage } from "@/pages/board";

const BoardRoute = () => {
  const { boardId } = Route.useParams();
  const { share, comment, page } = Route.useSearch();
  const navigate = Route.useNavigate();
  // stable, so the editor's setPageId (and the effects that depend on it) only change with the page
  const onPageChange = useCallback(
    (next: string) =>
      navigate({ search: (prev) => ({ ...prev, page: next }), replace: true }),
    [navigate]
  );
  return (
    <BoardPage
      boardId={boardId}
      shareToken={share}
      focusComment={comment}
      pageParam={page}
      onPageChange={onPageChange}
    />
  );
};

const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;

export const Route = createFileRoute("/boards/$boardId")({
  ssr: false,
  beforeLoad: onboardedIfSignedIn,
  validateSearch: (
    search: Record<string, unknown>
  ): { share?: string; comment?: string; page?: string } => ({
    share: text(search.share),
    comment: text(search.comment),
    page: text(search.page),
  }),
  component: BoardRoute,
});
