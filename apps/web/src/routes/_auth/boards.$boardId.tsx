import { createFileRoute } from "@tanstack/react-router";

import { BoardPage } from "@/pages/board";

const BoardRoute = () => {
  const { boardId } = Route.useParams();
  return <BoardPage boardId={boardId} />;
};

export const Route = createFileRoute("/_auth/boards/$boardId")({
  component: BoardRoute,
});
