/** The boards answer to notification's list: which boards a person can read now, and their current titles. */
export interface IReadableBoards {
  readableBoards(person: {
    id: string;
    email: string;
  }): Promise<{ id: string; title: string }[]>;
}
