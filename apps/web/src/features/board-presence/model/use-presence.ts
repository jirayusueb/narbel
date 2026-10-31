import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { useEffect, useRef, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

import type { UserRef } from "@/entities/person";
import { CURSOR_SYNC_MS, createThrottleLatest } from "@/shared/lib";

import { reveal, takeReveal } from "./agent-focus";
import type { Reveal } from "./agent-focus";

export interface Peer {
  clientId: number;
  user: UserRef;
}

interface Viewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export const usePresence = ({
  awareness,
  doc,
  live,
  api,
  pageId,
  setPageId,
}: {
  awareness: Awareness | null;
  doc: Y.Doc | null;
  live: boolean;
  api: ExcalidrawImperativeAPI | null;
  pageId: string | null;
  setPageId: (id: string) => void;
}) => {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [followId, setFollowId] = useState<number | null>(null);

  useEffect(() => {
    if (!awareness) {
      return;
    }
    const refresh = () => {
      const next: Peer[] = [];
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId !== awareness.clientID && state.user?.name) {
          next.push({
            clientId,
            user: { id: String(clientId), ...state.user },
          });
        }
      }
      // Pointer and viewport updates also fire "change"; keep the identity when the roster is the same.
      setPeers((prev) =>
        prev.length === next.length &&
        prev.every(
          (p, i) =>
            p.clientId === next[i].clientId &&
            p.user.id === next[i].user.id &&
            p.user.name === next[i].user.name &&
            p.user.avatarUrl === next[i].user.avatarUrl
        )
          ? prev
          : next
      );
    };
    awareness.on("change", refresh);
    refresh();
    return () => awareness.off("change", refresh);
  }, [awareness]);

  useEffect(() => {
    if (!(awareness && api)) {
      return;
    }
    const throttle = createThrottleLatest<Viewport>((viewport) => {
      awareness.setLocalStateField("viewport", viewport);
    }, CURSOR_SYNC_MS);
    const publish = (
      scrollX: number,
      scrollY: number,
      zoom: { value: number }
    ) => throttle.push({ scrollX, scrollY, zoom: zoom.value });
    const { scrollX, scrollY, zoom } = api.getAppState();
    publish(scrollX, scrollY, zoom);
    const unsubscribe = api.onScrollChange(publish);
    return () => {
      throttle.cancel();
      unsubscribe();
    };
  }, [awareness, api]);

  useEffect(() => {
    if (!(awareness && api) || followId === null) {
      return;
    }
    const follow = () => {
      const leader = awareness.getStates().get(followId);
      if (!leader) {
        setFollowId(null);
        return;
      }
      if (leader.pageId && leader.pageId !== pageId) {
        setPageId(leader.pageId);
        return;
      }
      const view: Viewport | undefined = leader.viewport;
      const current = api.getAppState();
      if (
        view &&
        (view.scrollX !== current.scrollX ||
          view.scrollY !== current.scrollY ||
          view.zoom !== current.zoom.value)
      ) {
        api.updateScene({
          appState: {
            scrollX: view.scrollX,
            scrollY: view.scrollY,
            zoom: { value: view.zoom },
          } as unknown as AppState,
        });
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        setFollowId(null);
      }
    };
    // Our own scrolling is the signal to stop; programmatic scrolls from follow() fire neither of these.
    const onUserInput = (e: Event) => {
      const target = e.target as Element | null;
      // Closing the phone drawer (overlay tap, handle drag) is a pointerdown outside the bar.
      if (
        !target?.closest?.(
          "[data-presence], [data-slot=drawer-overlay], [data-slot=drawer-content]"
        )
      ) {
        setFollowId(null);
      }
    };
    awareness.on("change", follow);
    follow();
    document.addEventListener("keydown", onKey);
    document.addEventListener("wheel", onUserInput, { capture: true });
    document.addEventListener("pointerdown", onUserInput, { capture: true });
    return () => {
      awareness.off("change", follow);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("wheel", onUserInput, { capture: true });
      document.removeEventListener("pointerdown", onUserInput, {
        capture: true,
      });
    };
  }, [awareness, api, followId, pageId, setPageId]);

  // Latest values for the reveal handler, so a page switch or follow toggle does not re-absorb reveals.
  const latest = useRef({ pageId, followId, setPageId });
  useEffect(() => {
    latest.current = { pageId, followId, setPageId };
  });
  const pending = useRef<Reveal | null>(null);

  useEffect(() => {
    if (!(awareness && doc && api)) {
      return;
    }
    const agents = doc.getMap("agents");
    const seen = new Map<number, number>();
    // States present now are history, whether from joining or from reconnecting: opening a board must not jump.
    takeReveal(awareness.getStates(), seen, agents);
    const onChange = () => {
      const next = takeReveal(awareness.getStates(), seen, agents);
      if (!(next && live) || latest.current.followId !== null) {
        return;
      }
      if (next.pageId === latest.current.pageId) {
        reveal(api, next.ids);
      } else {
        pending.current = next;
        latest.current.setPageId(next.pageId);
      }
    };
    awareness.on("change", onChange);
    return () => awareness.off("change", onChange);
  }, [awareness, doc, api, live]);

  // useBoardCollab is declared before usePresence, so its effect has swapped the scene by now.
  useEffect(() => {
    const next = pending.current;
    if (api && next && next.pageId === pageId) {
      pending.current = null;
      reveal(api, next.ids);
    }
  }, [api, pageId]);

  return { peers, followId, handleFollow: setFollowId };
};
