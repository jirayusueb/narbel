const PREFIX = "narbel:";
// Device-only boards (the guest scratch board) belong to the browser, not to an account.
const LOCAL_PREFIX = `${PREFIX}local:`;

// Per user, so a shared browser never offers one account's boards to another.
export const boardCacheName = (userId: string, boardId: string) =>
  `${PREFIX}${userId}:${boardId}`;

export const localBoardCacheName = (boardId: string) =>
  `${LOCAL_PREFIX}${boardId}`;

const deleteDatabase = (name: string) =>
  // oxlint-disable-next-line promise/avoid-new -- IDBRequest is event-based, there is no promise API.
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    // An open editor still holds its connection; the delete completes as soon as it unmounts,
    // so a blocked request counts as handed off.
    for (const type of ["success", "error", "blocked"]) {
      request.addEventListener(type, () => resolve());
    }
  });

export const deleteBoardCache = (userId: string, boardId: string) =>
  deleteDatabase(boardCacheName(userId, boardId));

// Sign-out clears account caches; device-only boards survive an account switch.
export const deleteAllBoardCaches = async () => {
  const databases = await indexedDB.databases();
  await Promise.all(
    databases.flatMap(({ name }) =>
      name?.startsWith(PREFIX) && !name.startsWith(LOCAL_PREFIX)
        ? [deleteDatabase(name)]
        : []
    )
  );
};
