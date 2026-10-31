/**
 * Runs `step` for each item one after another. A database transaction holds one connection, and
 * node-postgres refuses (from v9) a query while another is still running on it.
 */
export const inSequence = async <T>(
  items: readonly T[],
  step: (item: T) => Promise<unknown>,
  from = 0
): Promise<void> => {
  const item = items[from];
  if (from >= items.length || item === undefined) {
    return;
  }
  await step(item);
  await inSequence(items, step, from + 1);
};
