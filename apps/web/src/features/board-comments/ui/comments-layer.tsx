import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEventListener } from "@reactuses/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/entities/user";

import { usePins } from "../api/comments";
import type { Comment } from "../api/comments";
import type { ThreadEnv } from "../model/types";
import { CommentComposer } from "./comment-editor";

interface View {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable || /^(?:input|textarea|select)$/iu.test(el.tagName))
  );
};

const Pin = ({
  comment,
  left,
  top,
  selected,
  onClick,
}: {
  comment: Comment;
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
    aria-label={`Thread by ${comment.author.name}${comment.replyCount ? `, ${comment.replyCount} replies` : ""}`}
    aria-pressed={selected}
    onClick={onClick}
    className={`shadow-elevated outline-ring pointer-events-auto absolute origin-bottom-left -translate-x-1/2 -translate-y-full cursor-pointer overflow-hidden rounded-full rounded-bl-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid ${selected ? "ring-foreground ring-offset-background ring-2 ring-offset-2" : ""}`}
    style={{ left, top }}
  >
    <UserAvatar size={32} user={comment.author} className="rounded-none" />
  </motion.button>
);

export const CommentsLayer = ({
  env,
  pageId,
  api,
  mode,
  focusedId,
  onModeChange,
  onSelect,
}: {
  env: ThreadEnv;
  pageId: string | null;
  api: ExcalidrawImperativeAPI | null;
  mode: boolean;
  focusedId: string | null;
  onModeChange: (next: boolean) => void;
  onSelect: (thread: Comment | null) => void;
}) => {
  const { canWrite } = env;
  const { data: pins = [] } = usePins(env.boardId, pageId, env.share);
  const { create } = env.mutations;
  const [view, setView] = useState<View>({ scrollX: 0, scrollY: 0, zoom: 1 });
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);

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
      onSelect(null);
      onModeChange(false);
    }
  });

  const toScreen = (c: { x: number; y: number }) => ({
    left: (c.x + view.scrollX) * view.zoom,
    top: (c.y + view.scrollY) * view.zoom,
  });

  const place = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSelect(null);
    setDraft({
      x: (e.clientX - rect.left) / view.zoom - view.scrollX,
      y: (e.clientY - rect.top) / view.zoom - view.scrollY,
    });
    onModeChange(false);
  };

  const at = draft ? toScreen(draft) : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {mode && canWrite ? (
        <div
          role="presentation"
          className="pointer-events-auto absolute inset-0 cursor-crosshair"
          onPointerDown={place}
        />
      ) : null}
      <AnimatePresence>
        {pins.map((c) => (
          <Pin
            key={c.id}
            comment={c}
            {...toScreen(c)}
            selected={c.id === focusedId}
            onClick={() => {
              setDraft(null);
              onSelect(c.id === focusedId ? null : c);
            }}
          />
        ))}
      </AnimatePresence>
      {draft && at ? (
        <>
          <span
            className="bg-primary absolute size-3 -translate-x-1/2 -translate-y-full rounded-full rounded-bl-[2px]"
            style={at}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="bg-popover text-popover-foreground shadow-elevated ring-border pointer-events-auto absolute z-20 w-80 max-w-[calc(100%-1.5rem)] origin-top-left rounded-[20px] p-4 ring-1"
            style={{ left: at.left + 14, top: at.top }}
          >
            <CommentComposer
              disabled={create.isPending}
              members={env.members}
              onCancel={() => setDraft(null)}
              onSubmit={(body) =>
                create.mutate(
                  { pageId: pageId ?? "", ...draft, body },
                  {
                    onError: (error) => toast.error(error.message),
                    onSuccess: (created) => {
                      setDraft(null);
                      onSelect(created);
                    },
                  }
                )
              }
            />
          </motion.div>
        </>
      ) : null}
    </div>
  );
};
