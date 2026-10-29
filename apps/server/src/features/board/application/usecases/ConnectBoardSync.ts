import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { loadOwnedBoard } from "../BoardAccess";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type {
  IBoardSyncGateway,
  SyncPeer,
  SyncSession,
} from "../ports/IBoardSyncGateway";

export class ConnectBoardSync {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly gateway: IBoardSyncGateway
  ) {}

  async execute(input: {
    userId: string;
    boardId: string;
    peer: SyncPeer;
  }): Promise<Result<SyncSession, AppError>> {
    const board = await loadOwnedBoard(
      this.boards,
      input.boardId,
      input.userId
    );
    if (board.isErr()) {
      return err(board.error);
    }
    return ok(await this.gateway.connect(input.boardId, input.peer));
  }
}
