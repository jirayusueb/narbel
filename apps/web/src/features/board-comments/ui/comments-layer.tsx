import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEventListener } from "@reactuses/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
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

// The "c" shortcut only works while focus is on the board, so it never fires from a dialog or another page.
const onBoard = (target: EventTarget | null) =>
  target === document.body ||
  (target instanceof Element && target.closest("[data-board-canvas]") !== null);

const AIM_STEP = 16;
const AIM_STEP_LARGE = 64;
const AIM_KEYS: Record<string, [number, number]> = {
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
};

const centre = (el: HTMLElement) => ({
  left: el.clientWidth / 2,
  top: el.clientHeight / 2,
});

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
  // Keyboard placement: a reticle the arrow keys move, in layer pixels.
  const [aim, setAim] = useState<{ left: number; top: number } | null>(null);
  const placer = useRef<HTMLButtonElement>(null);

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

  // Entering comment mode moves focus onto the placement surface so arrows and Enter work; leaving it hands focus back.
  useEffect(() => {
    if (!(mode && canWrite)) {
      return;
    }
    const back = document.activeElement as HTMLElement | null;
    placer.current?.focus({ preventScroll: true });
    return () => {
      setAim(null);
      // The surface is gone by now; only reclaim focus it dropped, never focus the user moved elsewhere.
      if (document.activeElement === document.body) {
        back?.focus({ preventScroll: true });
      }
    };
  }, [mode, canWrite]);

  useEventListener("keydown", (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }
    if (e.key === "c" && canWrite && onBoard(e.target)) {
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

  const placeAt = (left: number, top: number) => {
    onSelect(null);
    setDraft({
      x: left / view.zoom - view.scrollX,
      y: top / view.zoom - view.scrollY,
    });
    onModeChange(false);
  };

  const place = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    placeAt(e.clientX - rect.left, e.clientY - rect.top);
  };

  const steer = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    const current = aim ?? centre(el);
    const direction = AIM_KEYS[e.key];
    if (direction) {
      const step = e.shiftKey ? AIM_STEP_LARGE : AIM_STEP;
      setAim({
        left: Math.min(
          el.clientWidth,
          Math.max(0, current.left + direction[0] * step)
        ),
        top: Math.min(
          el.clientHeight,
          Math.max(0, current.top + direction[1] * step)
        ),
      });
    } else if (e.key === "Enter" || e.key === " ") {
      placeAt(current.left, current.top);
    } else {
      return;
    }
    // Excalidraw also reads arrows and Enter from the document; they belong to the reticle here.
    e.preventDefault();
    e.stopPropagation();
  };

  const at = draft ? toScreen(draft) : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {mode && canWrite ? (
        <button
          ref={placer}
          type="button"
          aria-label="Place a comment. Arrow keys move the marker, Shift moves faster, Enter places it, Escape cancels."
          className="pointer-events-auto absolute inset-0 cursor-crosshair outline-none"
          onPointerDown={place}
          onKeyDown={steer}
          onFocus={(e) => {
            if (e.currentTarget.matches(":focus-visible")) {
              // currentTarget is cleared once the handler returns, so measure before the updater runs.
              const start = centre(e.currentTarget);
              setAim((current) => current ?? start);
            }
          }}
        >
          {aim ? (
            <span
              aria-hidden="true"
              className="border-foreground bg-citrus/40 absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_4px_var(--background)]"
              style={aim}
            />
          ) : null}
        </button>
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
