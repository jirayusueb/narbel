import { CaptureUpdateAction, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import type { UserRef } from "@/entities/user";
import { api as serverApi } from "@/shared/api";
import { SYNC_URL } from "@/shared/config";
import { colorFromName, elementKey, isOnPage } from "@/shared/lib";

import {
  deriveCollabStatus,
  WS_FORBIDDEN_REASON,
  WS_POLICY_VIOLATION,
} from "./collab-status";
import type { CollabStatus } from "./collab-status";
import { byZOrder, shouldTakeIncoming } from "./merge";

export type { CollabStatus } from "./collab-status";

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
  const queryClient = useQueryClient();
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

    // The server refuses the upgrade with a plain HTTP 403/404, which a browser reports only as a
    // failed socket; ask the same URL over HTTP to tell "no access" from "server down".
    let noAccess = false;
    // One access check per outage: spent once the server actually answers, reset once the provider syncs again.
    // While the server is unreachable the check keeps retrying, so a refusal after it comes back is still caught.
    let probed = false;
    let probing = false;
    // A destroyed provider still fires close events (and late probes resolve); they must not touch the next one's status.
    let disposed = false;
    const refreshStatus = () => {
      if (disposed) {
        return;
      }
      if (provider.synced) {
        probed = false;
      }
      setStatus(
        deriveCollabStatus({
          wsconnected: provider.wsconnected,
          synced: provider.synced,
          wsUnsuccessfulReconnects: provider.wsUnsuccessfulReconnects,
          noAccess,
        })
      );
    };
    const denyAccess = () => {
      if (disposed) {
        return;
      }
      noAccess = true;
      provider.disconnect();
      refreshStatus();
      // board-page turns the real 403/404 into Unlock / NotFound.
      queryClient.invalidateQueries({ queryKey: ["boards", boardId] });
    };
    const probeAccess = async () => {
      if (probed || probing || noAccess) {
        return;
      }
      probing = true;
      // The sync route answers 404 to any plain GET, so ask the board endpoint, which resolves access the same way
      // the upgrade does. A network failure means the server is down: stay offline and keep retrying.
      const res = await serverApi.api
        .boards({ id: boardId })
        .get({ query: { share: shareToken } })
        .catch(() => null);
      probing = false;
      // Eden reports an unreachable server as a synthetic 503 with no response; only a real answer spends the check.
      if (!res?.response) {
        return;
      }
      probed = true;
      if (res.status === 403 || res.status === 404) {
        denyAccess();
      }
    };
    // y-websocket bumps its failure counter right after emitting connection-close.
    const onClose = (event: CloseEvent | null) => {
      if (disposed) {
        return;
      }
      if (
        event?.code === WS_POLICY_VIOLATION &&
        event.reason === WS_FORBIDDEN_REASON
      ) {
        denyAccess();
        return;
      }
      queueMicrotask(refreshStatus);
      if (!provider.synced) {
        probeAccess();
      }
    };
    provider.on("status", refreshStatus);
    provider.on("sync", refreshStatus);
    provider.on("connection-close", onClose);
    provider.on("connection-error", refreshStatus);
    provider.on("closed", refreshStatus);
    refreshStatus();

    return () => {
      disposed = true;
      provider.destroy();
      doc.destroy();
      setSession(null);
    };
  }, [boardId, shareToken, queryClient]);

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

  const pendingPointer = useRef<PointerUpdate | null>(null);
  const pointerFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(pointerFrame.current), []);
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
      found.sort(byZOrder);
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
      incoming.sort(byZOrder);
      const restored = restoreElements(incoming, null);
      for (const el of restored) {
        sentVersions.current.set(el.id, el.version);
        local.set(el.id, el);
      }
      // a remote reorder only changes `index`; the array position must follow it
      const next = [...local.values()];
      next.sort(byZOrder);
      api.updateScene({
        elements: next,
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
    const local = awareness.getLocalState();
    if (local && local.pageId !== pageId) {
      // the pointer belongs to the page being left; carried over, peers would draw it on this one
      cancelAnimationFrame(pointerFrame.current);
      pointerFrame.current = 0;
      pendingPointer.current = null;
      awareness.setLocalState({
        ...local,
        pageId,
        pointer: undefined,
        button: undefined,
      });
    }
    const onAwareness = (_: unknown, origin: unknown) => {
      if (origin === "local") {
        return;
      }
      const collaborators = new Map<SocketId, Collaborator>();
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID || state.pageId !== pageId) {
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
    onAwareness(null, "init");

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

  // One awareness write per frame, latest value wins.
  const onPointerUpdate = useCallback(
    (update: PointerUpdate) => {
      pendingPointer.current = update;
      if (!session || pointerFrame.current) {
        return;
      }
      pointerFrame.current = requestAnimationFrame(() => {
        pointerFrame.current = 0;
        const next = pendingPointer.current;
        const { awareness } = session.provider;
        const local = awareness.getLocalState();
        if (next && local) {
          awareness.setLocalState({
            ...local,
            pointer: next.pointer,
            button: next.button,
          });
        }
      });
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
