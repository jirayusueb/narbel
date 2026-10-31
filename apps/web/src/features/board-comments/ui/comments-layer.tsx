import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEventListener } from "@reactuses/core";
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/entities/person";
import { useDraftKey } from "@/shared/lib";

import { usePins } from "../api/comments";
import type { Comment } from "../api/comments";
import { placePopover } from "../model/place-popover";
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

// The "c" shortcut only works while focus is on the board, so it never fires from a dialog, the comments panel or another page.
const onBoard = (target: EventTarget | null) =>
  target === document.body ||
  (target instanceof Element &&
    target.closest("[data-board-canvas]") !== null &&
    target.closest("[data-comments-panel]") === null);

const AIM_STEP = 16;
const AIM_STEP_LARGE = 64;
const AIM_KEYS: Record<string, [number, number]> = {
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
};

const PIN_SIZE = 32;
const DRAFT_MARKER = 12;

const centre = (el: HTMLElement) => ({
  left: el.clientWidth / 2,
  top: el.clientHeight / 2,
});

const translate = ({ scrollX, scrollY, zoom }: View) =>
  `translate(${scrollX * zoom}px, ${scrollY * zoom}px)`;

// Scroll and zoom reach the DOM in one write, so pins never lag a frame behind the canvas.
const paint = (el: HTMLElement, view: View) => {
  el.style.transform = translate(view);
  el.style.setProperty("--z", String(view.zoom));
};

const EXCERPT = 40;

const pinName = (comment: Comment) => {
  const text = comment.body
    .replaceAll(/[*_`#>]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
  const excerpt = text.length > EXCERPT ? `${text.slice(0, EXCERPT)}…` : text;
  const { replyCount } = comment;
  const replies = replyCount === 1 ? "1 reply" : `${replyCount} replies`;
  return `${comment.author.name}: ${excerpt}${replyCount ? ` · ${replies}` : ""}`;
};

const Pin = ({
  comment,
  selected,
  onClick,
}: {
  comment: Comment;
  selected: boolean;
  onClick: () => void;
}) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.4 }}
    animate={{ opacity: 1, scale: selected ? 1.08 : 1 }}
    exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.12 } }}
    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    type="button"
    aria-label={pinName(comment)}
    aria-pressed={selected}
    onClick={onClick}
    className={`shadow-elevated outline-ring pointer-events-auto absolute origin-bottom-left -translate-x-1/2 -translate-y-full cursor-pointer overflow-hidden rounded-full rounded-bl-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid ${selected ? "ring-foreground ring-offset-background ring-2 ring-offset-2" : ""}`}
    style={{
      left: `calc(${comment.x}px * var(--z))`,
      top: `calc(${comment.y}px * var(--z))`,
    }}
  >
    <UserAvatar
      size={PIN_SIZE}
      user={comment.author}
      className="rounded-none"
    />
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
  // Scrolling and zooming move one container by transform and a --z variable; React only re-renders when the visible pins change.
  const viewRef = useRef<View>({ scrollX: 0, scrollY: 0, zoom: 1 });
  const [visible, setVisible] = useState("");
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const draftKey = useDraftKey();
  const [offset, setOffset] = useState<{ left: number; top: number } | null>(
    null
  );
  // Keyboard placement: a reticle the arrow keys move, in layer pixels.
  const [aim, setAim] = useState<{ left: number; top: number } | null>(null);
  const placer = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const pinsEl = useRef<HTMLDivElement>(null);
  const draftEl = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const apply = useEffectEvent((list: Comment[]) => {
    const view = viewRef.current;
    for (const el of [pinsEl.current, draftEl.current]) {
      if (el) {
        paint(el, view);
      }
    }
    const layer = host.current;
    if (!layer) {
      return;
    }
    const { clientWidth, clientHeight } = layer;
    // Off-screen pins are not rendered, so they cannot be tabbed to either; a pin is centred on its x.
    setVisible(
      list
        .filter((c) => {
          const left = (c.x + view.scrollX) * view.zoom;
          const top = (c.y + view.scrollY) * view.zoom;
          return (
            left >= -PIN_SIZE / 2 &&
            left <= clientWidth + PIN_SIZE / 2 &&
            top >= 0 &&
            top <= clientHeight + PIN_SIZE
          );
        })
        .map((c) => c.id)
        .join(",")
    );
  });
  const reposition = useEffectEvent(() => apply(pins));

  useEffect(() => {
    apply(pins);
  }, [pins]);

  useEffect(() => {
    const schedule = () => {
      if (!frame.current) {
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          reposition();
        });
      }
    };
    const sync = (scrollX: number, scrollY: number, z: { value: number }) => {
      viewRef.current = { scrollX, scrollY, zoom: z.value };
      schedule();
    };
    globalThis.addEventListener("resize", schedule);
    let off: (() => void) | undefined;
    if (api) {
      const { scrollX, scrollY, zoom: z } = api.getAppState();
      sync(scrollX, scrollY, z);
      off = api.onScrollChange(sync);
    }
    return () => {
      off?.();
      globalThis.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [api]);

  const focusBoard = () => {
    const target =
      mode && canWrite
        ? placer.current
        : host.current
            ?.closest("[data-board-canvas]")
            ?.querySelector<HTMLElement>(".excalidraw");
    target?.focus({ preventScroll: true });
  };

  const closeDraft = () => {
    focusBoard();
    setDraft(null);
  };

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

  // Place the draft card inside the layer from its measured size; the editor mounts after the first render and grows with text, so it is re-measured.
  const placeDraft = useEffectEvent(() => {
    const card = popover.current;
    const layer = host.current;
    if (!(draft && card && layer)) {
      setOffset(null);
      return;
    }
    const view = viewRef.current;
    const anchor = {
      left: (draft.x + view.scrollX) * view.zoom,
      top: (draft.y + view.scrollY) * view.zoom,
    };
    const spot = placePopover({
      anchor,
      anchorHeight: DRAFT_MARKER,
      bounds: { height: layer.clientHeight, width: layer.clientWidth },
      size: { height: card.offsetHeight, width: card.offsetWidth },
    });
    setOffset({ left: spot.left - anchor.left, top: spot.top - anchor.top });
  });

  useLayoutEffect(() => {
    const card = popover.current;
    if (draftEl.current) {
      // Before paint, so the card never flashes at the origin; apply() keeps it in step afterwards.
      paint(draftEl.current, viewRef.current);
    }
    placeDraft();
    if (!draft || !card) {
      return;
    }
    const observer = new ResizeObserver(() => placeDraft());
    observer.observe(card);
    globalThis.addEventListener("resize", placeDraft);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", placeDraft);
    };
  }, [draft]);

  // Excalidraw swallows Escape on its own element, so the layer claims it in the capture phase.
  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target as Element | null;
    if (
      e.key !== "Escape" ||
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      isTyping(target) ||
      target?.closest("[data-comments-panel]")
    ) {
      return;
    }
    if (draft) {
      const field =
        popover.current?.querySelector<HTMLElement>("[contenteditable]");
      // Text the user typed is never discarded from outside the composer.
      if (field?.textContent?.trim()) {
        field.focus();
      } else {
        closeDraft();
      }
    } else if (focusedId) {
      onSelect(null);
    } else if (mode) {
      onModeChange(false);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  });

  useEffect(() => {
    const canvas = host.current?.closest("[data-board-canvas]");
    canvas?.addEventListener("keydown", onEscape as EventListener, true);
    return () =>
      canvas?.removeEventListener("keydown", onEscape as EventListener, true);
  }, []);

  useEventListener("keydown", (e: KeyboardEvent) => {
    if (
      e.key === "c" &&
      canWrite &&
      !(isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) &&
      onBoard(e.target) &&
      !popover.current?.contains(e.target as Node)
    ) {
      onModeChange(!mode);
    }
  });

  const placeAt = (left: number, top: number) => {
    const view = viewRef.current;
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

  const shown = new Set(visible.split(","));

  return (
    <>
      {/* Between Excalidraw's canvas (z 2) and its UI layer (z 4), so toolbars and islands keep their clicks. */}
      <div
        ref={host}
        className="pointer-events-none absolute inset-0 z-[3] overflow-clip"
      >
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
        <div ref={pinsEl} className="pointer-events-none absolute inset-0">
          <AnimatePresence>
            {pins
              .filter((c) => shown.has(c.id))
              .map((c) => (
                <Pin
                  key={c.id}
                  comment={c}
                  selected={c.id === focusedId}
                  onClick={() => {
                    setDraft(null);
                    onSelect(c.id === focusedId ? null : c);
                  }}
                />
              ))}
          </AnimatePresence>
        </div>
      </div>
      {draft ? (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-clip">
          <div ref={draftEl} className="absolute inset-0">
            <span
              className="bg-primary absolute size-3 -translate-x-1/2 -translate-y-full rounded-full rounded-bl-[2px]"
              style={{
                left: `calc(${draft.x}px * var(--z))`,
                top: `calc(${draft.y}px * var(--z))`,
              }}
            />
            <motion.div
              ref={popover}
              initial={{ opacity: 0, scale: 0.94, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="bg-popover text-popover-foreground shadow-elevated ring-border pointer-events-auto absolute w-80 max-w-[calc(100%-1.5rem)] origin-top-left rounded-xl p-4 ring-1"
              style={{
                left: `calc(${draft.x}px * var(--z) + ${offset?.left ?? 14}px)`,
                top: `calc(${draft.y}px * var(--z) + ${offset?.top ?? 0}px)`,
              }}
            >
              <CommentComposer
                disabled={create.isPending}
                members={env.members}
                onCancel={closeDraft}
                onSubmit={(body) => {
                  const input = { pageId: pageId ?? "", ...draft, body };
                  create.mutate(
                    { ...input, key: draftKey.get(JSON.stringify(input)) },
                    {
                      onError: (error) => toast.error(error.message),
                      onSuccess: (created) => {
                        draftKey.rotate();
                        closeDraft();
                        onSelect(created);
                      },
                    }
                  );
                }}
              />
            </motion.div>
          </div>
        </div>
      ) : null}
    </>
  );
};
