import type { Cursor } from "../../../../shared/kernel/types/Cursor";

/** Encoded Yjs state vector, pruned to clients with live elements; minted only by the scene adapter. */
export type SceneVersion = Uint8Array & {
  readonly __sceneVersion: unique symbol;
};

const FORMAT = 1;

interface Wire {
  v: number;
  b: string;
  s: string;
  a: number;
  i: string;
}

const isWire = (value: unknown): value is Wire => {
  const wire = value as Wire | null;
  return (
    typeof wire === "object" &&
    wire !== null &&
    wire.v === FORMAT &&
    typeof wire.b === "string" &&
    typeof wire.s === "string" &&
    typeof wire.a === "number" &&
    Number.isFinite(wire.a) &&
    typeof wire.i === "string"
  );
};

/** Where an agent last looked at one board: a scene version plus the last comment activity it was shown. */
export class ChangeCursor {
  private constructor(
    readonly boardId: string,
    readonly scene: SceneVersion,
    /** keyset position over (activityAt, id) of comments already shown */
    readonly comments: Cursor
  ) {}

  /** First cursor of a watch: no comment activity shown yet, so comments start at `now`. */
  static start(boardId: string, scene: SceneVersion, now: Date): ChangeCursor {
    return new ChangeCursor(boardId, scene, { at: now, id: "" });
  }

  /** Null for anything this server did not mint for `boardId`: garbage, another format, another board. */
  static parse(raw: string, boardId: string): ChangeCursor | null {
    try {
      const wire: unknown = JSON.parse(
        Buffer.from(raw, "base64url").toString("utf-8")
      );
      const at = isWire(wire) ? new Date(wire.a) : null;
      return isWire(wire) &&
        wire.b === boardId &&
        at !== null &&
        !Number.isNaN(at.getTime())
        ? new ChangeCursor(
            boardId,
            new Uint8Array(Buffer.from(wire.s, "base64url")) as SceneVersion,
            { at, id: wire.i }
          )
        : null;
    } catch {
      return null;
    }
  }

  /** Same board, newer position; comments stay put when no comment row was shown. */
  advance(scene: SceneVersion, lastComment?: Cursor): ChangeCursor {
    return new ChangeCursor(this.boardId, scene, lastComment ?? this.comments);
  }

  encode(): string {
    const wire: Wire = {
      v: FORMAT,
      b: this.boardId,
      s: Buffer.from(this.scene).toString("base64url"),
      a: this.comments.at.getTime(),
      i: this.comments.id,
    };
    return Buffer.from(JSON.stringify(wire)).toString("base64url");
  }
}
