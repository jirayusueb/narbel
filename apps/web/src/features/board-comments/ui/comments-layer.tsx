import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Button } from "@narbel/ui/components/button";
import { Check, MessageCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import { colorFromName } from "@/shared/lib";

import { useCommentMutations, useComments } from "../api/comments";
import type { BoardComment } from "../api/comments";
import { CommentBody, CommentComposer } from "./comment-editor";

interface View {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const onError = (error: Error) => toast.error(error.message);

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable || /^(?:input|textarea|select)$/iu.test(el.tagName))
  );
};

const Popover = ({
  left,
  top,
  children,
}: {
  left: number;
  top: number;
  children: React.ReactNode;
}) => (
  <div
    className="bg-popover text-popover-foreground ring-foreground/10 pointer-events-auto absolute z-20 w-72 p-3 shadow-md ring-1"
    style={{ left: left + 14, top }}
  >
    {children}
  </div>
);

const Pin = ({
  comment,
  left,
  top,
  selected,
  onClick,
}: {
  comment: BoardComment;
  left: number;
  top: number;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={`Comment by ${comment.authorName}`}
    onClick={onClick}
    className={`pointer-events-auto absolute grid size-7 -translate-x-1/2 -translate-y-full place-items-center rounded-full rounded-bl-none text-[10px] font-semibold text-white shadow ${selected ? "ring-primary ring-2" : ""}`}
    style={{
      left,
      top,
      backgroundColor: colorFromName(comment.authorName).background,
    }}
  >
    {comment.authorName.slice(0, 1).toUpperCase()}
  </button>
);

export const CommentsLayer = ({
  boardId,
  pageId,
  api,
  shareToken,
  canWrite,
  isOwner,
  userId,
  mode,
  onModeChange,
}: {
  boardId: string;
  pageId: string | null;
  api: ExcalidrawImperativeAPI | null;
  shareToken?: string;
  canWrite: boolean;
  isOwner: boolean;
  userId: string;
  mode: boolean;
  onModeChange: (next: boolean) => void;
}) => {
  const { data: comments = [] } = useComments(boardId, pageId, shareToken);
  const { create, resolve, remove } = useCommentMutations(
    boardId,
    pageId,
    shareToken
  );
  const overlay = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scrollX: 0, scrollY: 0, zoom: 1 });
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    if (!api) {
      return;
    }
    const sync = (scrollX: number, scrollY: number, zoom: { value: number }) =>
      setView({ scrollX, scrollY, zoom: zoom.value });
    const { scrollX, scrollY, zoom } = api.getAppState();
    sync(scrollX, scrollY, zoom);
    return api.onScrollChange(sync);
  }, [api]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (e.key === "c" && canWrite) {
        onModeChange(!mode);
      } else if (e.key === "Escape") {
        setDraft(null);
        setOpenId(null);
        onModeChange(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canWrite, mode, onModeChange]);

  const toScreen = (c: { x: number; y: number }) => ({
    left: (c.x + view.scrollX) * view.zoom,
    top: (c.y + view.scrollY) * view.zoom,
  });

  const place = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenId(null);
    setDraft({
      x: (e.clientX - rect.left) / view.zoom - view.scrollX,
      y: (e.clientY - rect.top) / view.zoom - view.scrollY,
    });
    onModeChange(false);
  };

  const open = comments.filter((c) => !c.resolvedAt && !c.parentId);
  const resolved = comments.filter((c) => c.resolvedAt && !c.parentId);
  const active = open.find((c) => c.id === openId);

  return (
    <div
      ref={overlay}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {mode && canWrite ? (
        <div
          role="presentation"
          className="pointer-events-auto absolute inset-0 cursor-crosshair"
          onPointerDown={place}
        />
      ) : null}
      {open.map((c) => (
        <Pin
          key={c.id}
          comment={c}
          {...toScreen(c)}
          selected={c.id === openId}
          onClick={() => {
            setDraft(null);
            setOpenId(c.id === openId ? null : c.id);
          }}
        />
      ))}
      {draft ? (
        <>
          <span
            className="bg-primary absolute size-3 -translate-x-1/2 -translate-y-full rounded-full rounded-bl-none"
            style={toScreen(draft)}
          />
          <Popover {...toScreen(draft)}>
            <CommentComposer
              disabled={create.isPending}
              onSubmit={(body) =>
                create.mutate(
                  { ...draft, body },
                  { onError, onSuccess: () => setDraft(null) }
                )
              }
            />
          </Popover>
        </>
      ) : null}
      {active ? (
        <Popover {...toScreen(active)}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{active.authorName}</span>
            <span className="text-muted-foreground shrink-0 text-[10px]">
              {formatter.format(new Date(active.createdAt))}
            </span>
          </div>
          <CommentBody markdown={active.body} />
          <div className="mt-2 flex justify-end gap-1">
            {canWrite ? (
              <Button
                variant="outline"
                size="xs"
                isDisabled={resolve.isPending}
                onPress={() =>
                  resolve.mutate(active.id, {
                    onError,
                    onSuccess: () => setOpenId(null),
                  })
                }
              >
                <Check data-icon="inline-start" />
                Resolve
              </Button>
            ) : null}
            {active.authorId === userId || isOwner ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete comment"
                isDisabled={remove.isPending}
                onPress={() =>
                  remove.mutate(active.id, {
                    onError,
                    onSuccess: () => setOpenId(null),
                  })
                }
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        </Popover>
      ) : null}
      {resolved.length > 0 ? (
        <div className="pointer-events-auto absolute bottom-3 left-3 flex flex-col items-start gap-1">
          {showResolved ? (
            <ul className="bg-popover ring-foreground/10 flex max-h-64 w-72 flex-col gap-2 overflow-y-auto p-3 shadow-md ring-1">
              {resolved.map((c) => (
                <li key={c.id} className="border-b pb-2 last:border-b-0">
                  <span className="font-medium">{c.authorName}</span>
                  <CommentBody markdown={c.body} />
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            aria-expanded={showResolved}
            onPress={() => setShowResolved((v) => !v)}
          >
            <MessageCircle data-icon="inline-start" />
            Resolved ({resolved.length})
          </Button>
        </div>
      ) : null}
    </div>
  );
};
