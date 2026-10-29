import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Button } from "@narbel/ui/components/button";
import { useEventListener, useToggle } from "@reactuses/core";
import { Check, MessageCircle, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
  <motion.div
    initial={{ opacity: 0, scale: 0.94, y: 4 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    className="bg-popover text-popover-foreground shadow-elevated ring-border pointer-events-auto absolute z-20 w-80 max-w-[calc(100%-1.5rem)] origin-top-left rounded-[20px] p-4 ring-1"
    style={{ left: left + 14, top }}
  >
    {children}
  </motion.div>
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
  <motion.button
    initial={{ opacity: 0, scale: 0.4 }}
    animate={{ opacity: 1, scale: selected ? 1.08 : 1 }}
    exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.12 } }}
    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    type="button"
    aria-label={`Comment by ${comment.authorName}`}
    onClick={onClick}
    className={`shadow-elevated outline-ring pointer-events-auto absolute grid size-8 origin-bottom-left -translate-x-1/2 -translate-y-full cursor-pointer place-items-center rounded-full rounded-bl-[4px] text-xs font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid ${selected ? "ring-foreground ring-offset-background ring-2 ring-offset-2" : ""}`}
    style={{
      left,
      top,
      backgroundColor: colorFromName(comment.authorName).background,
    }}
  >
    {comment.authorName.slice(0, 1).toUpperCase()}
  </motion.button>
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
  const [showResolved, toggleResolved] = useToggle(false);

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

  useEventListener("keydown", (e: KeyboardEvent) => {
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
  });

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
      <AnimatePresence>
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
      </AnimatePresence>
      {draft ? (
        <>
          <span
            className="bg-primary absolute size-3 -translate-x-1/2 -translate-y-full rounded-full rounded-bl-[2px]"
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
      <AnimatePresence>
        {active ? (
          <Popover key={active.id} {...toScreen(active)}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-medium">
                {active.authorName}
              </span>
              <span className="text-subtle-foreground shrink-0 text-xs">
                {formatter.format(new Date(active.createdAt))}
              </span>
            </div>
            <CommentBody markdown={active.body} />
            <div className="mt-3 flex justify-end gap-1">
              {canWrite ? (
                <Button
                  variant="secondary"
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
      </AnimatePresence>
      {resolved.length > 0 ? (
        <div className="pointer-events-auto absolute bottom-[68px] left-4 flex flex-col items-start gap-1">
          {showResolved ? (
            <ul className="bg-popover shadow-elevated ring-border flex max-h-64 w-80 flex-col gap-3 overflow-y-auto rounded-[20px] p-4 ring-1">
              {resolved.map((c) => (
                <li
                  key={c.id}
                  className="border-border border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <span className="text-[13px] font-medium">
                    {c.authorName}
                  </span>
                  <CommentBody markdown={c.body} />
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={showResolved}
            onPress={toggleResolved}
          >
            <MessageCircle data-icon="inline-start" />
            Resolved ({resolved.length})
          </Button>
        </div>
      ) : null}
    </div>
  );
};
