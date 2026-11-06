// no ndraw value imports: the module stays loadable under bun test
import type { ExcalidrawElement } from "@narbel/ndraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@narbel/ndraw/types";

export const EASE_TAU_MS = 80;
const SNAP_PX = 0.5;
const SNAP_RAD = 0.005;
const LINGER_MS = 500;
export const PARK_TTL_MS = 30_000;
const MAX_DT_MS = 100;

const MOTION_FIELDS = new Set(["x", "y", "points", "width", "height", "angle"]);
// bookkeeping that changes on every edit and says nothing about what the edit was
const BOOKKEEPING = new Set(["version", "versionNonce", "updated"]);

type Loose = Record<string, unknown>;

const sameValue = (a: unknown, b: unknown) =>
  Object.is(a, b) ||
  (typeof a === "object" &&
    typeof b === "object" &&
    JSON.stringify(a) === JSON.stringify(b));

/** True when `incoming` is the very next version of `shown` and only moved/resized/rotated it. */
export const isMotionOnly = (
  shown: ExcalidrawElement,
  incoming: ExcalidrawElement
) => {
  if (incoming.version !== shown.version + 1) {
    return false;
  }
  const a = shown as unknown as Loose;
  const b = incoming as unknown as Loose;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (BOOKKEEPING.has(key) || MOTION_FIELDS.has(key)) {
      continue;
    }
    if (!sameValue(a[key], b[key])) {
      return false;
    }
  }
  const pa = a.points as unknown[] | undefined;
  const pb = b.points as unknown[] | undefined;
  return pa?.length === pb?.length;
};

export const easeToward = (
  displayed: number,
  target: number,
  dtMs: number,
  snap = SNAP_PX
) =>
  Math.abs(target - displayed) < snap
    ? target
    : displayed + (target - displayed) * (1 - Math.exp(-dtMs / EASE_TAU_MS));

/** One easing step of `shown` toward `target`; `done` means it landed and `element` is the target itself. */
export const easeElement = (
  shown: ExcalidrawElement,
  target: ExcalidrawElement,
  dtMs: number
) => {
  let done = true;
  const step = (from: number, to: number, snap = SNAP_PX) => {
    const next = easeToward(from, to, dtMs, snap);
    if (next !== to) {
      done = false;
    }
    return next;
  };
  const x = step(shown.x, target.x);
  const y = step(shown.y, target.y);
  const width = step(shown.width, target.width);
  const height = step(shown.height, target.height);
  const angle = step(shown.angle, target.angle, SNAP_RAD);
  const from = (shown as Loose).points as number[][] | undefined;
  const to = (target as Loose).points as number[][] | undefined;
  const points = from?.map((p, i) => [
    step(p[0], to?.[i][0] ?? p[0]),
    step(p[1], to?.[i][1] ?? p[1]),
  ]);
  if (done) {
    return { element: target, done };
  }
  // versions stay untouched: the eased frame is a view of the target, not an edit
  return {
    element: {
      ...shown,
      x,
      y,
      width,
      height,
      angle,
      points,
    } as ExcalidrawElement,
    done,
  };
};

type ContainerLike = Pick<ExcalidrawElement, "id"> & {
  containerId?: string | null;
};

type InteractionState = Pick<
  AppState,
  | "selectedElementIds"
  | "selectedElementsAreBeingDragged"
  | "isResizing"
  | "isRotating"
  | "editingTextElement"
  | "newElement"
  | "selectedLinearElement"
>;

/** Ids the local user is mid-gesture on (and their bound text), which remote values must not touch. */
export const interactedIds = (
  appState: InteractionState,
  elements: readonly ContainerLike[]
) => {
  const ids = new Set<string>();
  if (
    appState.selectedElementsAreBeingDragged ||
    appState.isResizing ||
    appState.isRotating
  ) {
    for (const id of Object.keys(appState.selectedElementIds)) {
      ids.add(id);
    }
  }
  for (const id of [
    appState.editingTextElement?.id,
    appState.newElement?.id,
    appState.selectedLinearElement?.isDragging
      ? appState.selectedLinearElement.elementId
      : undefined,
  ]) {
    if (id) {
      ids.add(id);
    }
  }
  if (ids.size > 0) {
    for (const el of elements) {
      if (el.containerId && ids.has(el.containerId)) {
        ids.add(el.id);
      }
    }
  }
  return ids;
};

type MotionApi = Pick<
  ExcalidrawImperativeAPI,
  "getAppState" | "getSceneElementsIncludingDeleted" | "updateScene"
>;

type Capture = NonNullable<
  Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["captureUpdate"]
>;

export class RemoteMotion {
  readonly targets = new Map<string, ExcalidrawElement>();
  readonly parked = new Map<string, number>();
  private frame: number | null = null;
  private last = 0;
  private lastTargetAt = 0;

  private readonly api: MotionApi;
  // re-feeds ids through the normal incoming path once their gesture ended
  private readonly onRelease: (ids: string[]) => void;
  // CaptureUpdateAction.NEVER, injected so eased frames never enter undo history
  private readonly neverCapture: Capture;
  private readonly now: () => number;

  constructor(
    api: MotionApi,
    onRelease: (ids: string[]) => void,
    neverCapture: Capture,
    now: () => number = () => performance.now()
  ) {
    this.api = api;
    this.onRelease = onRelease;
    this.neverCapture = neverCapture;
    this.now = now;
  }

  /**
   * Splits restored remote elements into those to apply now and those eased (`moving`).
   * Interacted ids are parked and appear in neither list.
   * The local edit bumps `version`, so the merge rule (higher version wins) already settles the
   * conflict; parking only prevents the mid-gesture flash.
   */
  route<T extends ExcalidrawElement>(
    restored: readonly T[],
    shown: ReadonlyMap<string, ExcalidrawElement>,
    busy: ReadonlySet<string>
  ) {
    const apply: T[] = [];
    const moving: T[] = [];
    const at = this.now();
    for (const el of restored) {
      if (busy.has(el.id)) {
        this.targets.delete(el.id);
        this.parked.set(el.id, at);
        continue;
      }
      const base = this.targets.get(el.id) ?? shown.get(el.id);
      if (base && isMotionOnly(base, el)) {
        this.targets.set(el.id, el);
        moving.push(el);
      } else {
        this.targets.delete(el.id);
        apply.push(el);
      }
    }
    if (moving.length > 0) {
      this.lastTargetAt = at;
      this.start();
    }
    return { apply, moving };
  }

  /** Called on every local change: release parked ids whose gesture is over. */
  settle(appState: InteractionState, scene: readonly ContainerLike[]) {
    if (this.parked.size === 0) {
      return;
    }
    const busy = interactedIds(appState, scene);
    const at = this.now();
    const released: string[] = [];
    for (const [id, since] of this.parked) {
      if (at - since > PARK_TTL_MS) {
        this.parked.delete(id);
      } else if (!busy.has(id)) {
        this.parked.delete(id);
        released.push(id);
      }
    }
    if (released.length > 0) {
      this.onRelease(released);
    }
  }

  tick(now: number) {
    const dt = Math.min(now - this.last, MAX_DT_MS);
    this.last = now;
    const scene = this.api.getSceneElementsIncludingDeleted();
    if (this.targets.size > 0) {
      const busy = interactedIds(this.api.getAppState(), scene);
      const eased = new Map<string, ExcalidrawElement>();
      const shown = new Map(scene.map((el) => [el.id, el]));
      for (const [id, target] of this.targets) {
        const current = shown.get(id);
        if (busy.has(id)) {
          this.targets.delete(id);
          this.parked.set(id, now);
        } else if (current) {
          const step = easeElement(current, target, dt);
          eased.set(id, step.element);
          if (step.done) {
            this.targets.delete(id);
          }
        } else {
          this.targets.delete(id);
        }
      }
      if (eased.size > 0) {
        this.api.updateScene({
          elements: scene.map((el) => eased.get(el.id) ?? el),
          captureUpdate: this.neverCapture,
        });
      }
      this.lastTargetAt = now;
    }
    this.frame = null;
    if (this.targets.size > 0 || now - this.lastTargetAt < LINGER_MS) {
      this.schedule();
    }
  }

  dispose() {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.targets.clear();
    this.parked.clear();
  }

  private start() {
    if (this.frame === null) {
      this.last = this.now();
      this.schedule();
    }
  }

  private schedule() {
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }
}
