/** The boards answer to notification's list: which boards a person can read now, and their current titles. */
export interface IReadableBoards {
  readableBoardTitles(person: {
    id: string;
    email: string;
  }): Promise<Map<string, string>>;
}
