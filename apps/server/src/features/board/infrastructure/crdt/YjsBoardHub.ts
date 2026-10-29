import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

import type {
  IBoardScenes,
  SceneAccess,
} from "../../application/ports/IBoardScenes";
import type {
  IBoardSyncGateway,
  SyncPeer,
  SyncSession,
} from "../../application/ports/IBoardSyncGateway";
import type { SceneElement } from "../../domain/entities/SceneElement";
import { shouldAcceptIncoming } from "../../domain/rules/mergeElement";
import type { IBoardDocumentStore } from "../repositories/DrizzleBoardDocumentStore";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PERSIST_DEBOUNCE_MS = 1000;
const SERVER_ORIGIN = Symbol("server");

interface Room {
  boardId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /** connected peers -> awareness client ids each one controls */
  peers: Map<SyncPeer, Set<number>>;
  dirty: boolean;
  saving: Promise<void>;
  timer: ReturnType<typeof setTimeout> | undefined;
}

const encodeMessage = (
  type: number,
  write: (encoder: encoding.Encoder) => void
) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, type);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

/**
 * In-memory registry of live board documents. A document is loaded on first use,
 * persisted ~1s after changes, and unloaded once nobody is connected and it is saved.
 */
export class YjsBoardHub implements IBoardScenes, IBoardSyncGateway {
  private readonly rooms = new Map<string, Promise<Room>>();
  // a room being unloaded must finish saving before the next load reads the row
  private readonly flushing = new Map<string, Promise<void>>();

  constructor(private readonly store: IBoardDocumentStore) {}

  async transact<T>(
    boardId: string,
    fn: (scene: SceneAccess) => T
  ): Promise<T> {
    const room = await this.room(boardId);
    const elements = room.doc.getMap<SceneElement>("elements");
    const scene: SceneAccess = {
      get: (id) => elements.get(id),
      all: () => [...elements.values()],
      put: (element) => {
        if (shouldAcceptIncoming(elements.get(element.id), element)) {
          elements.set(element.id, element);
        }
      },
    };
    try {
      return room.doc.transact(() => fn(scene), SERVER_ORIGIN);
    } finally {
      // also unloads rooms that only this call kept alive
      this.schedulePersist(room);
    }
  }

  async connect(boardId: string, peer: SyncPeer): Promise<SyncSession> {
    const room = await this.room(boardId);
    room.peers.set(peer, new Set());
    peer.send(
      encodeMessage(MESSAGE_SYNC, (e) => {
        syncProtocol.writeSyncStep1(e, room.doc);
      })
    );
    const states = room.awareness.getStates();
    if (states.size > 0) {
      peer.send(
        encodeMessage(MESSAGE_AWARENESS, (e) => {
          encoding.writeVarUint8Array(
            e,
            awarenessProtocol.encodeAwarenessUpdate(room.awareness, [
              ...states.keys(),
            ])
          );
        })
      );
    }
    return {
      receive: (message) => this.receive(room, peer, message),
      close: () => this.disconnect(room, peer),
    };
  }

  async discard(boardId: string): Promise<void> {
    const pending = this.rooms.get(boardId);
    if (!pending) {
      return;
    }
    const room = await pending;
    this.rooms.delete(boardId);
    clearTimeout(room.timer);
    room.dirty = false;
    const peers = [...room.peers.keys()];
    room.peers.clear();
    this.destroy(room);
    for (const peer of peers) {
      peer.close();
    }
  }

  private room(boardId: string): Promise<Room> {
    let pending = this.rooms.get(boardId);
    if (!pending) {
      pending = this.load(boardId);
      this.rooms.set(boardId, pending);
      pending.catch(() => this.rooms.delete(boardId));
    }
    return pending;
  }

  private async load(boardId: string): Promise<Room> {
    await this.flushing.get(boardId);
    const state = await this.store.load(boardId);
    const doc = new Y.Doc();
    if (state) {
      Y.applyUpdate(doc, state);
    }
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null);
    const room: Room = {
      boardId,
      doc,
      awareness,
      peers: new Map(),
      dirty: false,
      saving: Promise.resolve(),
      timer: undefined,
    };

    doc.on("update", (update: Uint8Array, origin: unknown) => {
      room.dirty = true;
      const message = encodeMessage(MESSAGE_SYNC, (e) => {
        syncProtocol.writeUpdate(e, update);
      });
      for (const peer of room.peers.keys()) {
        if (peer !== origin) {
          peer.send(message);
        }
      }
      this.schedulePersist(room);
    });

    awareness.on(
      "update",
      (
        {
          added,
          updated,
          removed,
        }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        const changed = [...added, ...updated, ...removed];
        const owned = room.peers.get(origin as SyncPeer);
        if (owned) {
          for (const id of added) {
            owned.add(id);
          }
          for (const id of removed) {
            owned.delete(id);
          }
        }
        const message = encodeMessage(MESSAGE_AWARENESS, (e) => {
          encoding.writeVarUint8Array(
            e,
            awarenessProtocol.encodeAwarenessUpdate(awareness, changed)
          );
        });
        for (const peer of room.peers.keys()) {
          peer.send(message);
        }
      }
    );
    return room;
  }

  private receive(room: Room, peer: SyncPeer, message: Uint8Array) {
    const decoder = decoding.createDecoder(message);
    switch (decoding.readVarUint(decoder)) {
      case MESSAGE_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, peer);
        // only a sync step 1 produces a reply (length > the type byte)
        if (encoding.length(encoder) > 1) {
          peer.send(encoding.toUint8Array(encoder));
        }
        break;
      }
      case MESSAGE_AWARENESS: {
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
          peer
        );
        break;
      }
      default: {
        break;
      }
    }
  }

  private disconnect(room: Room, peer: SyncPeer) {
    const owned = room.peers.get(peer);
    if (!owned) {
      return;
    }
    room.peers.delete(peer);
    awarenessProtocol.removeAwarenessStates(room.awareness, [...owned], null);
    if (room.peers.size === 0) {
      this.schedulePersist(room, 0);
    }
  }

  private schedulePersist(room: Room, delay = PERSIST_DEBOUNCE_MS) {
    clearTimeout(room.timer);
    room.timer = setTimeout(() => void this.flush(room), delay);
  }

  private async flush(room: Room) {
    room.timer = undefined;
    if (room.dirty) {
      room.dirty = false;
      const state = Y.encodeStateAsUpdate(room.doc);
      room.saving = room.saving
        .then(() => this.store.save(room.boardId, state))
        .catch((error) => {
          // keep the changes; the next update or disconnect retries
          room.dirty = true;
          console.error(`Failed to persist board ${room.boardId}`, error);
        });
    }
    if (room.peers.size === 0) {
      const done = room.saving;
      this.flushing.set(room.boardId, done);
      this.rooms.delete(room.boardId);
      await done;
      this.flushing.delete(room.boardId);
      if (room.dirty) {
        // the final save failed; nothing else holds this state, so surface it
        console.error(`Board ${room.boardId} unloaded with unsaved changes`);
      }
      this.destroy(room);
    }
  }

  private destroy(room: Room) {
    room.awareness.destroy();
    room.doc.destroy();
  }
}
