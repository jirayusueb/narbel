export class FileKey {
  private constructor() {
    // static builders only
  }

  static prefix(boardId: string) {
    return `boards/${boardId}/`;
  }

  static of(boardId: string, fileId: string) {
    return `${FileKey.prefix(boardId)}${fileId}`;
  }
}
