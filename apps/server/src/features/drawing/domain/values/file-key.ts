import type { BoardId } from "../../../../shared/kernel/types/ids";

export class FileKey {
  private constructor() {
    // static builders only
  }

  static prefix(boardId: BoardId) {
    return `boards/${boardId}/`;
  }

  static of(boardId: BoardId, fileId: string) {
    return `${FileKey.prefix(boardId)}${fileId}`;
  }
}
