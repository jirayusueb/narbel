const FOREIGN_KEY_VIOLATION = "23503";

const isForeignKeyViolation = (error: unknown): boolean => {
  const cause = error instanceof Error ? error.cause : undefined;
  return [error, cause].some(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      "code" in candidate &&
      candidate.code === FOREIGN_KEY_VIOLATION
  );
};

// the board or comment was deleted after the event was written: its mirror rows went with it by
// cascade, and a late post or edit cannot bring them back, so nothing is left to do
export const unlessBoardGone = async (work: Promise<void>) => {
  try {
    await work;
  } catch (error) {
    if (!isForeignKeyViolation(error)) {
      throw error;
    }
  }
};
