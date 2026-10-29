import { createFileRoute } from "@tanstack/react-router";

import { BoardPage } from "@/pages/board";

const BoardRoute = () => {
  const { boardId } = Route.useParams();
  const { share, comment } = Route.useSearch();
  return (
    <BoardPage boardId={boardId} shareToken={share} focusComment={comment} />
  );
};

const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;

export const Route = createFileRoute("/_auth/boards/$boardId")({
  validateSearch: (
    search: Record<string, unknown>
  ): { share?: string; comment?: string } => ({
    share: text(search.share),
    comment: text(search.comment),
  }),
  component: BoardRoute,
});
