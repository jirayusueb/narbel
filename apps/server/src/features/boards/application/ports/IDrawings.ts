import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Result } from "../../../../shared/kernel/types/Result";

/** The drawing context's live rooms, seen from boards: Trash sends everyone away at once. */
export interface ILiveDrawings {
  /** Saves the live document, then disconnects every peer on every instance (close code 4410). */
  evict(boardId: string): Promise<void>;
}

/** The new board a drawing copy goes into; boards owns creating and removing it. */
export interface CopyTarget {
  /** Creates the new board and resolves to its id. */
  create(): Promise<string>;
  /** Removes the new board again after its drawing could not be written. */
  remove(boardId: string): Promise<void>;
}

/** The drawing context's half of duplicating a board: its pages, elements and images. */
export interface IDrawingCopier {
  /**
   * Checks the source drawing and every image it references, then creates the target and writes the
   * copy into it. An Err means nothing was created; a throw after the target exists removes it again.
   */
  copy(
    sourceId: string,
    target: CopyTarget
  ): Promise<Result<undefined, AppError>>;
}
