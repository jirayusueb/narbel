/** A live board the person can read now, as boards answers it, with the person's role. */
export interface ReadableBoard {
  id: string;
  title: string;
  role: "owner" | "editor" | "viewer";
  visibility: "private" | "link" | "password";
  createdAt: Date;
  updatedAt: Date;
}

/** The boards answer search restricts every match to; search never reads grants itself. */
export interface IReadableBoards {
  readableBoards(person: {
    id: string;
    email: string;
  }): Promise<ReadableBoard[]>;
}
