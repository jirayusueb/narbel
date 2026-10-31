export interface ILibraryRepository {
  /** null when the user never saved a library */
  find(userId: string): Promise<unknown[] | null>;
  save(userId: string, items: unknown[]): Promise<void>;
}
