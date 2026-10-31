import * as Y from "yjs";

import { toElement } from "../../application/dtos/ExcalidrawElement";
import type { ExcalidrawElement } from "../../application/dtos/ExcalidrawElement";
import type {
  ElementTouch,
  SceneChanges,
} from "../../application/ports/IBoardScenes";
import type { SceneVersion } from "../../domain/values/ChangeCursor";

/** Records this doc's clientID as an agent writer. Call inside a transaction that changed the doc; idempotent. */
export const markAgentWriter = (doc: Y.Doc): void => {
  const agents = doc.getMap<true>("agents");
  const me = String(doc.clientID);
  if (!agents.has(me)) {
    agents.set(me, true);
  }
};

/**
 * Walks one key's history newest first back to the cursor: whether a non-agent wrote it after the
 * cursor, and whether the key held a value at the cursor.
 */
const keyHistory = (
  newest: Y.Item,
  given: Map<number, number>,
  agents: Y.Map<true>
) => {
  let human = false;
  let at: Y.Item | null = newest;
  // after GC a deleted run of one client's writes is a single Item; it may start before the cursor and end after it
  while (at) {
    const seen = given.get(at.id.client) ?? 0;
    if (at.id.clock + at.length <= seen) {
      break;
    }
    human ||= !agents.has(String(at.id.client));
    if (at.id.clock < seen) {
      return { human, existedAtCursor: true };
    }
    at = at.left as Y.Item | null;
  }
  return { human, existedAtCursor: at !== null };
};

/** See SceneAccess.changesSince. Relies on Y.Map's per-key Item chain (`_map`, `left`), pinned by changes.test.ts. */
export const touchesSince = (
  doc: Y.Doc,
  since: SceneVersion | null
): SceneChanges | undefined => {
  let given: Map<number, number> | null = null;
  if (since) {
    try {
      given = Y.decodeStateVector(since);
    } catch {
      return undefined;
    }
  }
  const agents = doc.getMap<true>("agents");
  const elements = doc.getMap<ExcalidrawElement>("elements");
  const isAfter = (id: Y.ID) => id.clock >= (given?.get(id.client) ?? 0);
  const touches: ElementTouch[] = [];
  const live = new Set<number>();
  for (const [key, item] of elements._map) {
    if (item.deleted) {
      continue;
    }
    live.add(item.id.client);
    if (!(given && isAfter(item.id))) {
      continue;
    }
    const { human, existedAtCursor } = keyHistory(item, given, agents);
    const element = elements.get(key);
    if (human && element) {
      touches.push({
        pageId: key.slice(0, key.length - element.id.length - 1),
        element: toElement(element),
        existedAtCursor,
      });
    }
  }
  const local = Y.decodeStateVector(Y.encodeStateVector(doc));
  const next = new Map<number, number>();
  for (const client of live) {
    next.set(client, Math.max(local.get(client) ?? 0, given?.get(client) ?? 0));
  }
  for (const [client, clock] of given ?? []) {
    if (clock > (local.get(client) ?? 0)) {
      next.set(client, clock);
    }
  }
  return {
    touches,
    version: Y.encodeStateVector(next) as SceneVersion,
  };
};
