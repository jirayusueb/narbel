import { CaptureUpdateAction, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import type { UserRef } from "@/entities/user";
import { api as serverApi } from "@/shared/api";
import { SYNC_URL } from "@/shared/config";
import {
  boardCacheName,
  colorFromName,
  CURSOR_SYNC_MS,
  ELEMENT_SYNC_MS,
  createThrottleLatest,
  deleteBoardCache,
  isOnPage,
} from "@/shared/lib";
import type { ThrottleLatest } from "@/shared/lib";

import {
  deriveCollabStatus,
  WS_FORBIDDEN_REASON,
  WS_POLICY_VIOLATION,
  WS_TRASHED_CODE,
} from "./collab-status";
import type { CollabStatus } from "./collab-status";
import { byZOrder, incomingFor, outranking } from "./merge";
import { writeChangedElements } from "./write-changed-elements";

export type { CollabStatus } from "./collab-status";

interface Session {
  doc: Y.Doc;
  provider: WebsocketProvider;
  writeElements: ThrottleLatest<PendingScene>;
}

interface PointerUpdate {
  pointer: { x: number; y: number; tool: "pointer" | "laser" };
  button: "down" | "up";
}

interface PendingScene {
  page: string;
  scene: readonly ExcalidrawElement[];
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
  // read at event time so a role change does not tear down the scene subscription
  const canWriteNow = useEffectEvent(() => canWrite);
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
    // Signed-in only: a guest's share-link session must leave nothing on disk. Cached state paints the
    // scene through the same observers as remote updates, while the status still waits for the server.
    const cache =
      userId && !shareToken
        ? new IndexeddbPersistence(boardCacheName(userId, boardId), doc)
        : null;
    const provider = new WebsocketProvider(SYNC_URL, boardId, doc, {
      params: shareToken ? { share: shareToken } : {},
    });
    sentVersions.current.clear();
    const throttle = createThrottleLatest<PendingScene>(
      ({ page, scene }) =>
        writeChangedElements(
          doc,
          page,
          scene,
          sentVersions.current,
          LOCAL_ORIGIN
        ),
      ELEMENT_SYNC_MS
    );
    // A closing tab never runs effect cleanups, so the pending write goes out as the page hides.
    const flushOnHide = () => {
      if (document.visibilityState === "hidden") {
        throttle.flush();
      }
    };
    window.addEventListener("pagehide", throttle.flush);
    document.addEventListener("visibilitychange", flushOnHide);
    // The doc and socket are external resources owned by this effect; consumers need them as state.
    // oxlint-disable-next-line react/set-state-in-effect
    setSession({ doc, provider, writeElements: throttle });

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
    // `keepCache` is for a board moved to Trash: the owner may restore it, and this device may hold edits
    // the server never saw, so those edits are saved into the local copy instead of dropped.
    const denyAccess = ({ keepCache = false } = {}) => {
      if (disposed) {
        return;
      }
      noAccess = true;
      if (keepCache) {
        throttle.flush();
      } else {
        throttle.cancel();
      }
      provider.disconnect();
      if (cache && !keepCache) {
        deleteBoardCache(userId, boardId);
      }
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
      } else if (res.status === 410) {
        denyAccess({ keepCache: true });
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
      if (event?.code === WS_TRASHED_CODE) {
        denyAccess({ keepCache: true });
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
      window.removeEventListener("pagehide", throttle.flush);
      document.removeEventListener("visibilitychange", flushOnHide);
      throttle.flush();
      provider.destroy();
      cache?.destroy();
      doc.destroy();
      setSession(null);
    };
  }, [boardId, shareToken, userId, queryClient]);

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

  const pointerThrottle = useRef<ThrottleLatest<PointerUpdate> | null>(null);
  useEffect(() => {
    if (!session) {
      return;
    }
    const { awareness } = session.provider;
    const throttle = createThrottleLatest<PointerUpdate>((next) => {
      const local = awareness.getLocalState();
      if (local) {
        awareness.setLocalState({
          ...local,
          pointer: next.pointer,
          button: next.button,
        });
      }
    }, CURSOR_SYNC_MS);
    pointerThrottle.current = throttle;
    return () => {
      throttle.cancel();
      pointerThrottle.current = null;
    };
  }, [session]);
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

    const meta = doc.getMap("meta");
    const applyRemote = (keys: Iterable<string>, isRestore: boolean) => {
      const changedKeys = [...keys];
      const local = new Map(
        api.getSceneElementsIncludingDeleted().map((el) => [el.id, el])
      );
      const winners = isRestore
        ? []
        : outranking(
            pageId,
            changedKeys,
            (key) => elements.get(key),
            local,
            canWriteNow()
          );
      const incoming = incomingFor(
        pageId,
        changedKeys,
        (key) => elements.get(key),
        local,
        isRestore
      );
      if (winners.length > 0) {
        doc.transact(() => {
          for (const { key, element } of winners) {
            sentVersions.current.set(element.id, element.version);
            elements.set(key, { ...element });
          }
        }, LOCAL_ORIGIN);
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
        const isRestore = [...event.transaction.changed].some(
          ([type, keys]) => Object.is(type, meta) && keys.has("restore")
        );
        applyRemote(event.keysChanged, isRestore);
      }
    };
    elements.observe(onElements);

    // A restore replaces the scene under every client; an undo step from before it must not replay over it.
    const onMeta = (event: Y.YMapEvent<unknown>) => {
      if (event.keysChanged.has("restore")) {
        api.history.clear();
      }
    };
    meta.observe(onMeta);

    const { awareness } = provider;
    const local = awareness.getLocalState();
    if (local && local.pageId !== pageId) {
      // the pointer belongs to the page being left; carried over, peers would draw it on this one
      pointerThrottle.current?.cancel();
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
          selectedElementIds: Array.isArray(state.selection)
            ? Object.fromEntries(
                state.selection.map((elementId: string) => [elementId, true])
              )
            : undefined,
        });
      }
      api.updateScene({ collaborators });
    };
    awareness.on("change", onAwareness);
    onAwareness(null, "init");

    return () => {
      session.writeElements.flush();
      elements.unobserve(onElements);
      meta.unobserve(onMeta);
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
      session.writeElements.push({ page, scene });
    },
    [session, sceneReady, canWrite]
  );

  const onPointerUpdate = useCallback((update: PointerUpdate) => {
    pointerThrottle.current?.push(update);
  }, []);

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
