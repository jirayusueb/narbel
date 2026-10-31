const PREFIX = "narbel:";

// Per user, so a shared browser never offers one account's boards to another.
export const boardCacheName = (userId: string, boardId: string) =>
  `${PREFIX}${userId}:${boardId}`;

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

export const deleteAllBoardCaches = async () => {
  const databases = await indexedDB.databases();
  await Promise.all(
    databases.flatMap(({ name }) =>
      name?.startsWith(PREFIX) ? [deleteDatabase(name)] : []
    )
  );
};
