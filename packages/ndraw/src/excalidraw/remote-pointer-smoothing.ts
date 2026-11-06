import type { SocketId } from "./types";

type Point = { x: number; y: number };

const TAU_MS = 80;
// a stalled tab hands rAF one huge dt; capping keeps a single step from teleporting the cursor
const MAX_DT_MS = 50;
const SNAP_DISTANCE = 0.25;
const ACTIVE_WINDOW_MS = 300;
// per-frame travel cap in viewport px: a teleporting peer glides instead of
// jumping, whatever the distance (the bench counts >24px moves as jumps)
const MAX_STEP_VIEWPORT_PX = 20;

/**
 * Eases each collaborator's drawn pointer (scene coords) toward the latest received one
 * with an exponential filter, so 20-30Hz pointer updates do not render as jumps.
 */
export class RemotePointerSmoother {
  private readonly displayed = new Map<SocketId, Point>();
  private readonly targets = new Map<SocketId, Point>();
  // no peer has moved yet: performance.now() starts near 0, so 0 would read as a fresh move
  private lastTargetMove = Number.NEGATIVE_INFINITY;
  /** time of the last advance: every caller shares it, so two draw loops in
   * one frame cannot double the travel */
  private lastStepAt: number | null = null;

  setTargets(next: ReadonlyMap<SocketId, Point>, now: number) {
    for (const id of this.targets.keys()) {
      if (!next.has(id)) {
        this.targets.delete(id);
        this.displayed.delete(id);
      }
    }
    for (const [id, p] of next) {
      const prev = this.targets.get(id);
      if (!prev || prev.x !== p.x || prev.y !== p.y) {
        this.lastTargetMove = now;
      }
      this.targets.set(id, { x: p.x, y: p.y });
      if (!this.displayed.has(id)) {
        this.displayed.set(id, { x: p.x, y: p.y });
      }
    }
  }

  /** advance every displayed point to `now`; returns true while another frame is needed */
  advanceTo(now: number, zoom = 1): boolean {
    // rAF hands frame-start timestamps that can precede a performance.now()
    // taken earlier in the same frame; never let the clock run backwards, or
    // the next advance would replay the overlap and double the travel
    const dtMs = this.lastStepAt === null ? 0 : Math.max(0, now - this.lastStepAt);
    this.lastStepAt = this.lastStepAt === null ? now : Math.max(this.lastStepAt, now);
    const k = 1 - Math.exp(-Math.min(dtMs, MAX_DT_MS) / TAU_MS);
    // speed cap scales with elapsed time: 20 viewport px per 60Hz frame
    const maxStep = (MAX_STEP_VIEWPORT_PX / zoom) * (Math.min(dtMs, MAX_DT_MS) / (1000 / 60));
    let moving = false;
    for (const [id, target] of this.targets) {
      const shown = this.displayed.get(id)!;
      const dx = target.x - shown.x;
      const dy = target.y - shown.y;
      const gap = Math.hypot(dx, dy);
      if (gap < SNAP_DISTANCE) {
        shown.x = target.x;
        shown.y = target.y;
      } else {
        const travel = Math.min(gap * k, maxStep);
        shown.x += (dx / gap) * travel;
        shown.y += (dy / gap) * travel;
        moving = true;
      }
    }
    return moving || now - this.lastTargetMove < ACTIVE_WINDOW_MS;
  }

  get(id: SocketId): Point | undefined {
    return this.displayed.get(id);
  }
}
