import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import type { Result } from "../../../../shared/kernel/types/Result";

/** What drawing needs to know about a board the caller reached. */
export interface ReachedBoard {
  board: {
    id: string;
    title: { value: string };
    /** the board's last edit; previews are cached per edit */
    updatedAt: Date;
  };
  access: { canWrite: boolean };
}

/**
 * The boards context's AccessPolicy, seen from drawing: "may this caller read or write this board".
 * Drawing holds no access rules of its own.
 */
export interface IBoardAccess {
  decide(
    boardId: string,
    actor: Actor,
    need: "read" | "write"
  ): Promise<Result<ReachedBoard, AppError>>;
}

/** The board facts boards keeps that a document save and the file sweep need. */
export interface BoardState {
  updatedAt: Date;
  trashedAt: Date | null;
}

/** Boards' record of a board, as the drawing's storage reads and moves it. */
export interface IBoardRecords {
  /** Also a board in Trash; null once it is gone. */
  findIncludingTrashed(boardId: string): Promise<BoardState | null>;
  /** Moves the board's last-edit time, which its list sorts by; called inside a document save's transaction. */
  markEdited(boardId: string, at: Date): Promise<unknown>;
}

/** The new board a duplicated drawing goes into; boards creates it and removes it after a failed copy. */
export interface CopyTarget {
  create(): Promise<string>;
  remove(boardId: string): Promise<void>;
}
