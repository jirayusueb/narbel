export interface RoomTiming {
  /** quiet time after a change before it is saved */
  debounceMs: number;
  /** a change is saved at most this long after the first unsaved one, however busy the room */
  maxDelayMs: number;
  /** an unused room with no peers stays loaded this long */
  graceMs: number;
}

export const ROOM_TIMING: RoomTiming = {
  debounceMs: 1000,
  maxDelayMs: 10_000,
  graceMs: 30_000,
};

/** The two clocks of a loaded room: when its changes get saved, and when it goes idle and unloads. */
export class RoomTimers {
  private save: ReturnType<typeof setTimeout> | undefined;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private unsavedSince: number | undefined;

  constructor(
    private readonly timing: RoomTiming,
    private readonly on: { save: () => void; idle: () => void }
  ) {}

  /** There is a change to save: debounced, but never later than maxDelayMs after the first one. */
  changed() {
    const now = Date.now();
    this.unsavedSince ??= now;
    const wait = Math.min(
      this.timing.debounceMs,
      this.unsavedSince + this.timing.maxDelayMs - now
    );
    clearTimeout(this.save);
    this.save = setTimeout(this.on.save, Math.max(0, wait));
  }

  /** The room is being saved now; the next change starts a new window. */
  saved() {
    clearTimeout(this.save);
    this.save = undefined;
    this.unsavedSince = undefined;
  }

  /** Any use restarts the grace period. */
  used() {
    clearTimeout(this.idle);
    this.idle = setTimeout(this.on.idle, this.timing.graceMs);
  }

  stop() {
    this.saved();
    clearTimeout(this.idle);
    this.idle = undefined;
  }
}
