import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness";

export interface Peer {
  clientId: number;
  name: string;
}

interface Viewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export const usePresence = ({
  awareness,
  api,
  pageId,
  setPageId,
}: {
  awareness: Awareness | null;
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
          next.push({ clientId, name: state.user.name });
        }
      }
      // Pointer and viewport updates also fire "change"; keep the identity when the roster is the same.
      setPeers((prev) =>
        prev.length === next.length &&
        prev.every(
          (p, i) => p.clientId === next[i].clientId && p.name === next[i].name
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
    const publish = (
      scrollX: number,
      scrollY: number,
      zoom: { value: number }
    ) =>
      awareness.setLocalStateField("viewport", {
        scrollX,
        scrollY,
        zoom: zoom.value,
      } satisfies Viewport);
    const { scrollX, scrollY, zoom } = api.getAppState();
    publish(scrollX, scrollY, zoom);
    return api.onScrollChange(publish);
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
      if (e.key === "Escape") {
        setFollowId(null);
      }
    };
    // Our own scrolling is the signal to stop; programmatic scrolls from follow() fire neither of these.
    const onUserInput = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.("[data-presence]")) {
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

  return { peers, followId, handleFollow: setFollowId };
};
