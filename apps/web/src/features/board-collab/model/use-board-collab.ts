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

import type { UserRef } from "@/entities/user";
import { SYNC_URL } from "@/shared/config";
import { colorFromName, elementKey, isOnPage } from "@/shared/lib";

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
  user,
  pageId,
  canWrite,
  shareToken,
}: {
  boardId: string;
  user: UserRef;
  pageId: string | null;
  canWrite: boolean;
  shareToken?: string;
}) => {
  const { id: userId, name: userName, username, avatarUrl } = user;
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<CollabStatus>("connecting");
  // Excalidraw replaces its scene when its own async initialization finishes, so remote
  // elements are applied only after that, starting with one full reconcile.
  const [sceneReady, setSceneReady] = useState(false);
  // id -> last version we wrote or received, so unchanged elements are not rewritten.
  const sentVersions = useRef(new Map<string, number>());
  // Local edits are written to this page; it only changes in the same step that swaps the scene.
  const activePage = useRef<string | null>(null);
  const lastSelection = useRef("");

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(SYNC_URL, boardId, doc, {
      params: shareToken ? { share: shareToken } : {},
    });
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
  }, [boardId, shareToken]);

  useEffect(() => {
    if (!session) {
      return;
    }
    session.provider.awareness.setLocalStateField("user", {
      id: userId,
      name: userName,
      username,
      avatarUrl,
    });
  }, [session, userId, userName, username, avatarUrl]);

  useEffect(() => {
    if (!(session && api && sceneReady && pageId)) {
      return;
    }
    const { doc, provider } = session;
    const elements = doc.getMap<ExcalidrawElement>("elements");

    const pageElements = () => {
      const found: ExcalidrawElement[] = [];
      for (const [key, value] of elements) {
        if (isOnPage(pageId, key)) {
          found.push({ ...value });
        }
      }
      return restoreElements(found, null);
    };

    // Switching page swaps the whole scene; undo history from another page must not leak in.
    const scene = pageElements();
    sentVersions.current.clear();
    for (const el of scene) {
      sentVersions.current.set(el.id, el.version);
    }
    activePage.current = pageId;
    api.updateScene({
      elements: scene,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history.clear();

    const applyRemote = (keys: Iterable<string>) => {
      const local = new Map(
        api.getSceneElementsIncludingDeleted().map((el) => [el.id, el])
      );
      const incoming: ExcalidrawElement[] = [];
      for (const key of keys) {
        const remote = elements.get(key);
        if (
          remote &&
          isOnPage(pageId, key) &&
          shouldTakeIncoming(local.get(remote.id), remote)
        ) {
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

    const { awareness } = provider;
    awareness.setLocalStateField("pageId", pageId);
    const onAwareness = () => {
      const collaborators = new Map<SocketId, Collaborator>();
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID) {
          continue;
        }
        const id = String(clientId);
        const name: string | undefined = state.user?.name;
        collaborators.set(id as SocketId, {
          id,
          username: name,
          color: name ? colorFromName(name) : undefined,
          pointer: state.pointer,
          button: state.button,
        });
      }
      api.updateScene({ collaborators });
    };
    awareness.on("change", onAwareness);
    onAwareness();

    return () => {
      elements.unobserve(onElements);
      awareness.off("change", onAwareness);
    };
  }, [session, api, sceneReady, pageId]);

  const onChange = useCallback(
    (scene: readonly ExcalidrawElement[], appState: AppState) => {
      if (!session || appState.isLoading) {
        return;
      }
      if (!sceneReady) {
        setSceneReady(true);
        return;
      }
      const selection = Object.keys(appState.selectedElementIds);
      const selectionKey = selection.join(",");
      if (selectionKey !== lastSelection.current) {
        lastSelection.current = selectionKey;
        session.provider.awareness.setLocalStateField("selection", selection);
      }
      const page = activePage.current;
      if (!(page && canWrite)) {
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
          const key = elementKey(page, el.id);
          if (shouldTakeIncoming(elements.get(key), el)) {
            // Excalidraw mutates elements in place; storing the live object would let the
            // map's copy change silently and make later versions look already-synced.
            elements.set(key, { ...el });
          }
        }
      }, LOCAL_ORIGIN);
    },
    [session, sceneReady, canWrite]
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
    awareness: session?.provider.awareness ?? null,
    status,
    onChange,
    onPointerUpdate,
  };
};
