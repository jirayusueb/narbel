/**
 * Runs `work` in one transaction. `Tx` carries the repositories bound to it, so every write the
 * work makes commits together or not at all. Throwing rolls back; so does returning an `Err`.
 */
export interface IUnitOfWork<Tx> {
  run<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
}
