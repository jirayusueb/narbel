import { createFileRoute } from "@tanstack/react-router";

import { BoardPage } from "@/pages/board";

const BoardRoute = () => {
  const { boardId } = Route.useParams();
  const { share } = Route.useSearch();
  return <BoardPage boardId={boardId} shareToken={share} />;
};

export const Route = createFileRoute("/_auth/boards/$boardId")({
  validateSearch: (search: Record<string, unknown>): { share?: string } =>
    typeof search.share === "string" ? { share: search.share } : {},
  component: BoardRoute,
});
