import type { Page } from "../../domain/entities/Page";
import type { ExcalidrawElement } from "../dtos/ExcalidrawElement";

export interface VersionFile {
  id: string;
  mimeType: string;
  created: number;
}

/** A historical scene, read from a saved state; never touches the live document. */
export interface VersionScene {
  pages: (Page & { elements: ExcalidrawElement[] })[];
  /** metadata of the images the visible elements use */
  files: VersionFile[];
}

/** What the document looks like right before a restore, handed to the caller to keep. */
export interface RestorePoint {
  state: Uint8Array;
  fileIds: string[];
}

export type RestoreOutcome =
  | { status: "restored"; changed: boolean }
  /** the board kept changing while the recovery point was being saved; nothing was written */
  | { status: "busy" }
  /** applied to the live board but not saved; the change stays live and is retried by the next save */
  | { status: "unsaved" };

export interface IBoardHistory {
  read(state: Uint8Array): VersionScene;
  /**
   * Makes the live document show `state` by writing the difference as new operations, so every
   * connected client receives it and edits made after the version are replaced, not merged back.
   * `keep` must durably store the recovery point; the document is rechecked afterwards and the
   * restore only applies if nothing changed meanwhile (otherwise it takes a fresh recovery point).
   */
  restore(
    boardId: string,
    state: Uint8Array,
    keep: (point: RestorePoint) => Promise<void>
  ): Promise<RestoreOutcome>;
}
