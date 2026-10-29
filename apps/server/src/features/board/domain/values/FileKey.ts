export const boardFilePrefix = (boardId: string) => `boards/${boardId}/`;
export const boardFileKey = (boardId: string, fileId: string) =>
  `${boardFilePrefix(boardId)}${fileId}`;
