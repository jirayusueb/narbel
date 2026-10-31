import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { ViewTransition, useState } from "react";
import type { ReactNode } from "react";

import { PUBLIC_SERVER_URL } from "@/shared/config";

import type { Board } from "../model/types";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const BoardPreview = ({ board }: { board: Board }) => {
  const src = `${PUBLIC_SERVER_URL}/api/boards/${board.id}/preview.png?v=${encodeURIComponent(board.updatedAt)}`;
  const [failed, setFailed] = useState<string | null>(null);
  // an empty board answers 204, which the browser reports as an image error
  return failed === src ? null : (
    <div className="bg-muted -mx-5 -mt-5 aspect-video overflow-hidden rounded-t-xl">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        crossOrigin="use-credentials"
        draggable={false}
        onError={() => setFailed(src)}
        className="size-full object-contain"
      />
    </div>
  );
};

export const BoardCard = ({
  board,
  actions,
}: {
  board: Board;
  actions?: ReactNode;
}) => (
  <div className="bg-card shadow-surface ease-intent hover:shadow-elevated group relative flex min-h-36 flex-col justify-between gap-6 rounded-xl p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
    <BoardPreview board={board} />
    <h3 className="font-display text-feature line-clamp-2 pr-16 leading-tight font-normal break-words">
      <ViewTransition name={`board-title-${board.id}`}>
        <Link
          to="/boards/$boardId"
          params={{ boardId: board.id }}
          className="focus-visible:outline-ring rounded-sm after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-solid"
        >
          {board.title}
        </Link>
      </ViewTransition>
    </h3>
    <p className="text-subtle-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="flex items-center gap-1.5">
        <Clock aria-hidden className="size-3.5" />
        <span>
          Updated{" "}
          <time dateTime={board.updatedAt}>
            {formatter.format(new Date(board.updatedAt))}
          </time>
        </span>
      </span>
      {board.shared ? (
        <span className="bg-muted text-muted-foreground rounded-sm px-2 py-0.5 text-xs font-medium capitalize">
          {board.role}
        </span>
      ) : null}
    </p>
    {actions ? (
      <div className="ease-intent absolute top-3 right-3 z-10 flex gap-0.5 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:hover)]:opacity-0 [@media(hover:none)]:opacity-100">
        {actions}
      </div>
    ) : null}
  </div>
);
