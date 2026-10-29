import { CaptureUpdateAction, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { SYNC_URL } from "@/shared/config";

import { shouldTakeIncoming } from "./merge";

export type CollabStatus = "connecting" | "syncing" | "live" | "offline";

interface Session {
  doc: Y.Doc;
  provider: WebsocketProvider;
}

interface PointerUpdate {
  pointer: { x: number; y: number; tool: "pointer" | "laser" };
  button: "down" | "up";
}

const LOCAL_ORIGIN = Symbol("local-edit");

export const useBoardCollab = ({
  boardId,
  userName,
}: {
  boardId: string;
  userName: string;
}) => {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CollabStatus>("connecting");
  const [peers, setPeers] = useState(0);
  // Excalidraw replaces its scene when its own async initialization finishes, so remote
  // elements are applied only after that, starting with one full reconcile.
  const [sceneReady, setSceneReady] = useState(false);
  // id -> last version we wrote or received, so unchanged elements are not rewritten.
  const sentVersions = useRef(new Map<string, number>());

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(SYNC_URL, boardId, doc);
    sentVersions.current.clear();
    // The doc and socket are external resources owned by this effect; consumers need them as state.
    // oxlint-disable-next-line react/set-state-in-effect
    setSession({ doc, provider });

    const refreshStatus = () => {
      if (provider.wsconnected) {
        setStatus(provider.synced ? "live" : "syncing");
      } else {
        setStatus(provider.wsconnecting ? "connecting" : "offline");
      }
    };
    provider.on("status", refreshStatus);
    provider.on("sync", refreshStatus);
    refreshStatus();

    return () => {
      provider.destroy();
      doc.destroy();
      setSession(null);
    };
  }, [boardId]);

  useEffect(() => {
    if (!session) {
      return;
    }
    session.provider.awareness.setLocalStateField("user", { name: userName });
  }, [session, userName]);

  useEffect(() => {
    if (!(session && api && sceneReady)) {
      return;
    }
    const { doc, provider } = session;
    const elements = doc.getMap<ExcalidrawElement>("elements");

    const applyRemote = (keys: Iterable<string>) => {
      const local = new Map(
        api.getSceneElementsIncludingDeleted().map((el) => [el.id, el])
      );
      const incoming: ExcalidrawElement[] = [];
      for (const key of keys) {
        const remote = elements.get(key);
        if (remote && shouldTakeIncoming(local.get(key), remote)) {
          incoming.push({ ...remote });
        }
      }
      if (incoming.length === 0) {
        return;
      }
      const restored = restoreElements(incoming, null);
      for (const el of restored) {
        sentVersions.current.set(el.id, el.version);
        local.set(el.id, el);
      }
      api.updateScene({
        elements: [...local.values()],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };

    const onElements = (event: Y.YMapEvent<ExcalidrawElement>) => {
      if (event.transaction.origin !== LOCAL_ORIGIN) {
        applyRemote(event.keysChanged);
      }
    };
    elements.observe(onElements);
    applyRemote(elements.keys());

    const { awareness } = provider;
    const onAwareness = () => {
      const collaborators = new Map<SocketId, Collaborator>();
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID) {
          continue;
        }
        const id = String(clientId);
        collaborators.set(id as SocketId, {
          id,
          username: state.user?.name,
          pointer: state.pointer,
          button: state.button,
        });
      }
      setPeers(collaborators.size);
      api.updateScene({ collaborators });
    };
    awareness.on("change", onAwareness);
    onAwareness();

    return () => {
      elements.unobserve(onElements);
      awareness.off("change", onAwareness);
    };
  }, [session, api, sceneReady]);

  const onChange = useCallback(
    (scene: readonly ExcalidrawElement[], appState: AppState) => {
      if (!session || appState.isLoading) {
        return;
      }
      if (!sceneReady) {
        setSceneReady(true);
        return;
      }
      const changed = scene.filter(
        (el) => sentVersions.current.get(el.id) !== el.version
      );
      if (changed.length === 0) {
        return;
      }
      const elements = session.doc.getMap<ExcalidrawElement>("elements");
      session.doc.transact(() => {
        for (const el of changed) {
          sentVersions.current.set(el.id, el.version);
          if (shouldTakeIncoming(elements.get(el.id), el)) {
            // Excalidraw mutates elements in place; storing the live object would let the
            // map's copy change silently and make later versions look already-synced.
            elements.set(el.id, { ...el });
          }
        }
      }, LOCAL_ORIGIN);
    },
    [session, sceneReady]
  );

  const onPointerUpdate = useCallback(
    ({ pointer, button }: PointerUpdate) => {
      session?.provider.awareness.setLocalStateField("pointer", pointer);
      session?.provider.awareness.setLocalStateField("button", button);
    },
    [session]
  );

  return {
    api: sceneReady ? api : null,
    bindApi: setApi,
    doc: session?.doc ?? null,
    status,
    peers,
    onChange,
    onPointerUpdate,
  };
};
