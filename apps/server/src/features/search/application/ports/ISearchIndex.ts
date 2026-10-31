import type { SearchQuery } from "../../domain/values/SearchQuery";

export type MatchKind = "title" | "text" | "comment";

export interface RawMatch {
  kind: MatchKind;
  /** the full text that matched */
  text: string;
  pageId?: string;
  commentId?: string;
}

/** The text search mirrors, read side. */
export interface ISearchIndex {
  /** Element text and comment matches on `boardIds` only, keyed by board: text before comments, at most `perBoard` each. */
  matches(
    boardIds: string[],
    query: SearchQuery,
    perBoard: number
  ): Promise<Map<string, RawMatch[]>>;
}

export interface IndexedText {
  pageId: string;
  elementId: string;
  text: string;
}

/** The mirror of drawing's text: one row per text element. */
export interface ITextIndex {
  /** Makes the board's rows equal `texts` unless a set saved at `savedAt` or later was applied before. */
  replace(boardId: string, savedAt: Date, texts: IndexedText[]): Promise<void>;
}

export interface IndexedComment {
  boardId: string;
  pageId: string;
  commentId: string;
  body: string;
}

/**
 * The mirror of discussion's comments. Each write carries the time of its change, so a late or
 * repeated event never reverts a newer edit, and a deleted comment never comes back.
 */
export interface ICommentIndex {
  /** Adds the comment unless it is known already, edited or deleted. */
  post(comment: IndexedComment, at: Date): Promise<void>;
  /** Writes the body unless a change at `at` or later, or a delete, was applied. */
  edit(comment: IndexedComment, at: Date): Promise<void>;
  /** Drops the comments for good. */
  remove(
    where: { boardId: string; pageId: string },
    commentIds: string[],
    at: Date
  ): Promise<void>;
}
