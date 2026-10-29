import { Badge } from "@narbel/ui/components/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@narbel/ui/components/card";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { Board } from "../model/types";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export const BoardCard = ({
  board,
  actions,
}: {
  board: Board;
  actions?: ReactNode;
}) => (
  <Card size="sm">
    <CardHeader>
      <CardTitle className="truncate">
        <Link
          to="/boards/$boardId"
          params={{ boardId: board.id }}
          className="hover:underline focus-visible:underline"
        >
          {board.title}
        </Link>
      </CardTitle>
      <CardDescription>
        Updated {formatter.format(new Date(board.updatedAt))}
      </CardDescription>
      {board.shared ? (
        <CardAction>
          <Badge variant="secondary">{board.role}</Badge>
        </CardAction>
      ) : null}
      {actions ? (
        <CardAction className="flex gap-1">{actions}</CardAction>
      ) : null}
    </CardHeader>
  </Card>
);
