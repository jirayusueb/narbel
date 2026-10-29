import { Excalidraw } from "@excalidraw/excalidraw";

import "@excalidraw/excalidraw/index.css";
import { Badge } from "@narbel/ui/components/badge";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import type { Board } from "@/entities/board";
import { useSession } from "@/entities/session";
import { useBoardCollab } from "@/features/board-collab";
import type { CollabStatus } from "@/features/board-collab";
import { useBoardMedia } from "@/features/board-media";

const STATUS_LABEL: Record<CollabStatus, string> = {
  connecting: "Connecting",
  syncing: "Syncing",
  live: "Live",
  offline: "Offline",
};

export const BoardEditor = ({ board }: { board: Board }) => {
  const { data: session } = useSession();
  const { api, bindApi, doc, status, peers, onChange, onPointerUpdate } =
    useBoardCollab({
      boardId: board.id,
      userName: session?.user.name ?? "Anonymous",
    });
  const { onFiles } = useBoardMedia({ boardId: board.id, doc, api });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-3 py-2">
        <Link
          to="/dashboard"
          aria-label="Back to boards"
          className="text-muted-foreground"
        >
          <ArrowLeft />
        </Link>
        <h1 className="truncate text-sm font-medium">{board.title}</h1>
        <Badge variant={status === "live" ? "default" : "secondary"}>
          {STATUS_LABEL[status]}
        </Badge>
        {peers > 0 ? (
          <Badge variant="outline">
            {peers} other{peers === 1 ? "" : "s"} here
          </Badge>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <Excalidraw
          theme="dark"
          excalidrawAPI={bindApi}
          onChange={(elements, appState, files) => {
            onChange(elements, appState);
            onFiles(files);
          }}
          onPointerUpdate={onPointerUpdate}
        />
      </div>
    </div>
  );
};
