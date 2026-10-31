import { randomUUID } from "node:crypto";

import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

import type { IPubSub } from "../../../../shared/application/interfaces/IPubSub";
import type {
  BoardText,
  IBoardDocumentStore,
} from "../../application/ports/IBoardDocumentStore";
import type {
  IBoardHistory,
  RestoreOutcome,
  RestorePoint,
  VersionScene,
} from "../../application/ports/IBoardHistory";
import type {
  IBoardScenes,
  AgentSelection,
  SceneAccess,
} from "../../application/ports/IBoardScenes";
import { SYNC_CLOSE_TRASHED } from "../../application/ports/IBoardSyncGateway";
import type {
  IBoardSyncGateway,
  SyncPeer,
  SyncSession,
} from "../../application/ports/IBoardSyncGateway";
import type { TextIndex } from "./boardText";
import { diffTexts, extractBoardText, indexTexts } from "./boardText";
import { markAgentWriter } from "./changes";
import { fileIdsOf, loadState, readSnapshot, restoreScene } from "./history";
import { ensurePages, pruneTombstones, sceneAccess } from "./pages";
import { ROOM_TIMING, RoomTimers } from "./RoomTimers";
import type { RoomTiming } from "./RoomTimers";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
// the board went to Trash: every instance saves, disconnects its peers and unloads the room
const MESSAGE_EVICT = 2;
const SERVER_ORIGIN = Symbol("server");
// updates that arrived from another instance: shown to local peers, never re-published
const BUS_ORIGIN = Symbol("bus");
const UNSAVED_ORIGIN = Symbol("unsaved");

const channel = (boardId: string) => `sync:${boardId}`;
// a restore retried after the board changed under it gives up after this many tries
const RESTORE_ATTEMPTS = 5;

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
  /** persist attempts that failed; lets a caller tell whether the save it waited on succeeded */
  saveFailures: number;
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
export class YjsBoardHub
  implements IBoardScenes, IBoardSyncGateway, IBoardHistory
{
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

  read(state: Uint8Array): VersionScene {
    return readSnapshot(state);
  }

  async restore(
    boardId: string,
    state: Uint8Array,
    keep: (point: RestorePoint) => Promise<void>
  ): Promise<RestoreOutcome> {
    const target = loadState(state);
    try {
      return await this.restoreWithin(boardId, target, keep, RESTORE_ATTEMPTS);
    } finally {
      target.destroy();
    }
  }

  // one attempt per call: the board changing under the recovery point retries with a fresh one
  private async restoreWithin(
    boardId: string,
    target: Y.Doc,
    keep: (point: RestorePoint) => Promise<void>,
    attemptsLeft: number
  ): Promise<RestoreOutcome> {
    if (attemptsLeft === 0) {
      return { status: "busy" };
    }
    const room = await this.room(boardId);
    // other instances may hold edits this one has not received yet; their reply arrives while the point is saved
    this.publish(
      room,
      encodeMessage(MESSAGE_SYNC, (e) => {
        syncProtocol.writeSyncStep1(e, room.doc);
      })
    );
    const seen = Y.encodeStateVector(room.doc);
    await keep({
      state: Y.encodeStateAsUpdate(room.doc),
      fileIds: fileIdsOf(room.doc),
    });
    // no await from here to the write: the check and the restore are one step on this instance
    const current = await this.rooms.get(boardId);
    const now = Y.encodeStateVector(room.doc);
    if (
      current !== room ||
      now.length !== seen.length ||
      now.some((b, i) => b !== seen[i])
    ) {
      return this.restoreWithin(boardId, target, keep, attemptsLeft - 1);
    }
    const changed = restoreScene(room.doc, target, Date.now(), randomUUID());
    const failuresBefore = room.saveFailures;
    this.flush(room);
    await room.saving;
    if (room.saveFailures !== failuresBefore) {
      // persist kept the room dirty; make sure a retry is scheduled
      room.timers.changed();
      return { status: "unsaved" };
    }
    return { status: "restored", changed };
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

  async evict(boardId: string): Promise<void> {
    // other instances hear it on the room channel; the echo to this one is a no-op by then
    await this.attempt(`Board ${boardId} could not publish its eviction`, () =>
      this.bus.publish(channel(boardId), Uint8Array.of(MESSAGE_EVICT))
    );
    await this.evictLocal(boardId);
  }

  private async evictLocal(boardId: string): Promise<void> {
    const pending = this.rooms.get(boardId);
    const room = await pending?.catch(() => null);
    if (!room || this.rooms.get(boardId) !== pending) {
      // an eviction already under way owns the save; wait for it so callers can trust the stored state
      await this.flushing.get(boardId);
      if (room && this.rooms.has(boardId)) {
        // that save failed and the room stays live; try again so this caller learns the truth
        await this.evictLocal(boardId);
      }
      return;
    }
    this.rooms.delete(boardId);
    this.flush(room);
    const done = room.saving;
    this.flushing.set(boardId, done);
    room.timers.stop();
    const peers = [...room.peers.keys()];
    room.peers.clear();
    for (const peer of peers) {
      peer.close(SYNC_CLOSE_TRASHED.code, SYNC_CLOSE_TRASHED.reason);
    }
    await done;
    if (this.flushing.get(boardId) === done) {
      this.flushing.delete(boardId);
    }
    if (room.dirty) {
      await this.retain(room);
      throw new Error(
        `Board ${boardId} could not be saved; its unsaved changes stay in memory for retry`
      );
    }
    this.destroy(room);
  }

  /**
   * A final save failed: the live doc is the only copy of its edits, so it stays loaded and the idle
   * timer retries the save. Limit: a process crash while the store is down still loses them.
   */
  private async retain(room: Room) {
    const current = this.rooms.get(room.boardId);
    if (!current) {
      this.rooms.set(room.boardId, Promise.resolve(room));
      room.timers.used();
      return;
    }
    // a load slipped in while the save ran and read the stale row: fold the unsaved edits into it
    const live = await current.catch(() => null);
    if (!live) {
      this.rooms.set(room.boardId, Promise.resolve(room));
      room.timers.used();
      return;
    }
    Y.applyUpdate(live.doc, Y.encodeStateAsUpdate(room.doc));
    room.timers.stop();
    this.destroy(room);
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
      saveFailures: 0,
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

  private async evictFromBus(boardId: string) {
    try {
      await this.evictLocal(boardId);
    } catch (error) {
      console.error(`Board ${boardId} could not be evicted`, error);
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
      } else if (type === MESSAGE_EVICT) {
        void this.evictFromBus(room.boardId);
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
      room.saving = this.persist(
        room,
        state,
        extractBoardText(room.doc),
        fileIdsOf(room.doc)
      );
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
    if (this.flushing.get(room.boardId) === done) {
      this.flushing.delete(room.boardId);
    }
    if (room.dirty) {
      console.error(`Board ${room.boardId} kept loaded with unsaved changes`);
      await this.retain(room);
      return;
    }
    room.timers.stop();
    this.destroy(room);
  }

  private async persist(
    room: Room,
    state: Uint8Array,
    texts: BoardText[],
    fileIds: string[]
  ) {
    try {
      await room.saving;
      const next = indexTexts(texts);
      // text rows are rewritten only when they differ from what this instance last wrote
      await this.store.save(
        room.boardId,
        state,
        diffTexts(room.writtenTexts, next),
        { fileIds }
      );
      room.writtenTexts = next;
    } catch (error) {
      // keep the changes; the next update or disconnect retries
      room.dirty = true;
      room.saveFailures += 1;
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
