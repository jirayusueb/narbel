import type { IProcessedEvents } from "../../../../shared/application/interfaces/IProcessedEvents";
import type { ICommentIndex, ITextIndex } from "./ISearchIndex";

/** The name search's consumers mark handled events under in `processed_event`. */
export const SEARCH_CONSUMER = "search";

/** The mirrors and the processed mark, bound to one transaction; they commit or roll back together. */
export interface SearchTx {
  texts: ITextIndex;
  comments: ICommentIndex;
  processed: IProcessedEvents;
}
