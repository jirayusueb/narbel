import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

import type { IPubSub } from "../../../../shared/application/interfaces/IPubSub";
import type {
  IBoardScenes,
  AgentSelection,
  SceneAccess,
} from "../../application/ports/IBoardScenes";
import type {
  IBoardSyncGateway,
  SyncPeer,
  SyncSession,
} from "../../application/ports/IBoardSyncGateway";
import type { IBoardDocumentStore } from "../repositories/DrizzleBoardDocumentStore";
import { diffTexts, extractBoardText, indexTexts } from "./boardText";
import type { BoardText, TextIndex } from "./boardText";
import { markAgentWriter } from "./changes";
import { ensurePages, pruneTombstones, sceneAccess } from "./pages";
import { ROOM_TIMING, RoomTimers } from "./RoomTimers";
import type { RoomTiming } from "./RoomTimers";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const SERVER_ORIGIN = Symbol("server");
// updates that arrived from another instance: shown to local peers, never re-published
const BUS_ORIGIN = Symbol("bus");
const UNSAVED_ORIGIN = Symbol("unsaved");

const channel = (boardId: string) => `sync:${boardId}`;

interface PeerState {
  clients: Set<number>;
  canWrite: boolean;
}

interface Room {
  boardId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /** connected peers -> awareness client ids each one controls, and whether its edits apply */
  peers: Map<SyncPeer, PeerState>;
  /** awareness client whose selection changed last, and each client's last selection */
  selectionClient: number | undefined;
  selectionKeys: Map<number, string>;
  dirty: boolean;
  /** focus calls so far; each one publishes a fresh number so viewers react once per call */
  reveals: number;
  saving: Promise<void>;
  timers: RoomTimers;
  /** the `board_text` rows as last written by this instance; unknown until the first save */
  writtenTexts: TextIndex | undefined;
  unsubscribe: (() => Promise<void>) | undefined;
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
 * persisted ~1s after changes (at most 10s after the first unsaved one), and unloaded once it has
 * had no peers and no use for the grace period.
 */
export class YjsBoardHub implements IBoardScenes, IBoardSyncGateway {
  private readonly rooms = new Map<string, Promise<Room>>();
  // a room being unloaded must finish saving before the next load reads the row
  private readonly flushing = new Map<string, Promise<void>>();

  constructor(
    private readonly store: IBoardDocumentStore,
    private readonly bus: IPubSub,
    private readonly timing: RoomTiming = ROOM_TIMING
  ) {}

  async transact<T>(
    boardId: string,
    fn: (scene: SceneAccess) => T
  ): Promise<T> {
    const room = await this.room(boardId);
    return room.doc.transact((tr) => {
      const out = fn(sceneAccess(room.doc));
      if (tr.changed.size > 0) {
        markAgentWriter(room.doc);
      }
      return out;
    }, SERVER_ORIGIN);
  }

  async getSelection(boardId: string): Promise<string[] | undefined> {
    const room = await this.room(boardId);
    if (room.peers.size === 0) {
      return undefined;
    }
    const selection = (clientId: number | undefined) => {
      const value =
        clientId === undefined
          ? undefined
          : room.awareness.getStates().get(clientId)?.selection;
      return Array.isArray(value) ? (value as string[]) : undefined;
    };
    return selection(room.selectionClient) ?? [];
  }

  async setSelection(
    boardId: string,
    { pageId, ids, reveal }: AgentSelection
  ): Promise<void> {
    const room = await this.room(boardId);
    // the web honours a reveal only from a registered agent, so a pure focus must register too
    room.doc.transact(() => markAgentWriter(room.doc), SERVER_ORIGIN);
    room.reveals += reveal ? 1 : 0;
    room.awareness.setLocalState({
      user: { name: "MCP" },
      mcp: true,
      ...(pageId === undefined ? {} : { pageId }),
      selection: ids,
      ...(reveal ? { reveal: room.reveals } : {}),
    });
  }

  async connect(
    boardId: string,
    peer: SyncPeer,
    canWrite: boolean
  ): Promise<SyncSession> {
    const room = await this.room(boardId);
    room.peers.set(peer, { clients: new Set(), canWrite });
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
    room.timers.stop();
    room.dirty = false;
    const peers = [...room.peers.keys()];
    room.peers.clear();
    this.destroy(room);
    for (const peer of peers) {
      peer.close();
    }
  }

  /** Every use of a room goes through here, which restarts its idle grace period. */
  private async room(boardId: string): Promise<Room> {
    let pending = this.rooms.get(boardId);
    if (!pending) {
      pending = this.load(boardId);
      this.rooms.set(boardId, pending);
      this.dropOnLoadFailure(boardId, pending);
    }
    const room = await pending;
    room.timers.used();
    return room;
  }

  private async dropOnLoadFailure(boardId: string, pending: Promise<Room>) {
    try {
      await pending;
    } catch {
      this.rooms.delete(boardId);
    }
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
      selectionClient: undefined,
      selectionKeys: new Map(),
      dirty: ensurePages(doc, SERVER_ORIGIN),
      reveals: 0,
      saving: Promise.resolve(),
      timers: new RoomTimers(this.timing, {
        save: () => this.flush(room),
        idle: () => this.unload(room),
      }),
      writtenTexts: undefined,
      unsubscribe: undefined,
    };
    if (room.dirty) {
      markAgentWriter(doc);
      room.timers.changed();
    }

    doc.on("update", (update: Uint8Array, origin: unknown) => {
      const message = encodeMessage(MESSAGE_SYNC, (e) => {
        syncProtocol.writeUpdate(e, update);
      });
      for (const peer of room.peers.keys()) {
        if (peer !== origin) {
          peer.send(message);
        }
      }
      // the instance that took the edit persists it
      if (origin !== BUS_ORIGIN) {
        if (origin !== UNSAVED_ORIGIN) {
          room.dirty = true;
          room.timers.changed();
        }
        this.publish(room, message);
      }
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
            owned.clients.add(id);
          }
          for (const id of removed) {
            owned.clients.delete(id);
          }
        }
        for (const id of [...added, ...updated]) {
          const selection = awareness.getStates().get(id)?.selection;
          const key = Array.isArray(selection)
            ? JSON.stringify(selection)
            : undefined;
          if (key !== undefined && room.selectionKeys.get(id) !== key) {
            room.selectionKeys.set(id, key);
            room.selectionClient = id;
          }
        }
        for (const id of removed) {
          room.selectionKeys.delete(id);
          if (room.selectionClient === id) {
            room.selectionClient = undefined;
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
        if (origin !== BUS_ORIGIN) {
          this.publish(room, message);
        }
      }
    );

    try {
      room.unsubscribe = await this.bus.subscribe(channel(boardId), (message) =>
        this.receiveFromBus(room, message)
      );
      // ask the other instances for what happened since the stored snapshot
      this.publish(
        room,
        encodeMessage(MESSAGE_SYNC, (e) => {
          syncProtocol.writeSyncStep1(e, doc);
        })
      );
    } catch (error) {
      // without the bus this instance still serves its own peers
      console.error(
        `Board ${boardId} could not subscribe to the sync bus`,
        error
      );
    }

    pruneTombstones(doc, Date.now(), UNSAVED_ORIGIN);

    return room;
  }

  private publish(room: Room, message: Uint8Array) {
    this.attempt(
      `Board ${room.boardId} could not publish to the sync bus`,
      () => this.bus.publish(channel(room.boardId), message)
    );
  }

  // fire-and-forget: a bus outage must never break local editing
  private async attempt(failure: string, run: () => Promise<void>) {
    try {
      await run();
    } catch (error) {
      console.error(failure, error);
    }
  }

  private receiveFromBus(room: Room, message: Uint8Array) {
    try {
      const decoder = decoding.createDecoder(message);
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
          BUS_ORIGIN
        );
      } else if (type === MESSAGE_SYNC) {
        const isStep1 =
          decoding.readVarUint(decoding.createDecoder(message.subarray(1))) ===
          syncProtocol.messageYjsSyncStep1;
        const reply = encoding.createEncoder();
        encoding.writeVarUint(reply, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, reply, room.doc, BUS_ORIGIN);
        if (encoding.length(reply) > 1) {
          this.publish(room, encoding.toUint8Array(reply));
        }
        const states = [...room.awareness.getStates().keys()];
        if (isStep1 && states.length > 0) {
          // a newly loaded instance has no presence yet
          this.publish(
            room,
            encodeMessage(MESSAGE_AWARENESS, (e) => {
              encoding.writeVarUint8Array(
                e,
                awarenessProtocol.encodeAwarenessUpdate(room.awareness, states)
              );
            })
          );
        }
      }
    } catch (error) {
      console.error(
        `Board ${room.boardId} dropped a malformed bus message`,
        error
      );
    }
  }

  private receive(room: Room, peer: SyncPeer, message: Uint8Array) {
    const state = room.peers.get(peer);
    if (!state) {
      return;
    }
    const decoder = decoding.createDecoder(message);
    switch (decoding.readVarUint(decoder)) {
      case MESSAGE_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        if (state.canWrite) {
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, peer);
        } else if (
          decoding.readVarUint(decoder) === syncProtocol.messageYjsSyncStep1
        ) {
          // a read-only peer only gets its sync step 1 answered; its step 2 and updates are dropped unread
          syncProtocol.readSyncStep1(decoder, encoder, room.doc);
        }
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
    const state = room.peers.get(peer);
    if (!state) {
      return;
    }
    room.peers.delete(peer);
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      [...state.clients],
      null
    );
    if (room.peers.size === 0) {
      this.flush(room);
      room.timers.used();
    }
  }

  private flush(room: Room) {
    room.timers.saved();
    if (room.dirty) {
      room.dirty = false;
      const state = Y.encodeStateAsUpdate(room.doc);
      room.saving = this.persist(room, state, extractBoardText(room.doc));
    }
  }

  private async unload(room: Room) {
    if (room.peers.size > 0) {
      return;
    }
    this.flush(room);
    const done = room.saving;
    this.flushing.set(room.boardId, done);
    this.rooms.delete(room.boardId);
    await done;
    this.flushing.delete(room.boardId);
    if (room.dirty) {
      // the final save failed; nothing else holds this state, so surface it
      console.error(`Board ${room.boardId} unloaded with unsaved changes`);
    }
    room.timers.stop();
    this.destroy(room);
  }

  private async persist(room: Room, state: Uint8Array, texts: BoardText[]) {
    try {
      await room.saving;
      const next = indexTexts(texts);
      // text rows are rewritten only when they differ from what this instance last wrote
      await this.store.save(
        room.boardId,
        state,
        diffTexts(room.writtenTexts, next)
      );
      room.writtenTexts = next;
    } catch (error) {
      // keep the changes; the next update or disconnect retries
      room.dirty = true;
      console.error(`Failed to persist board ${room.boardId}`, error);
    }
  }

  private destroy(room: Room) {
    if (room.unsubscribe) {
      this.attempt(
        `Board ${room.boardId} could not unsubscribe`,
        room.unsubscribe
      );
    }
    room.awareness.destroy();
    room.doc.destroy();
  }
}
