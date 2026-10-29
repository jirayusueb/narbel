import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type {
  IBoardSyncGateway,
  SyncPeer,
  SyncSession,
} from "../ports/IBoardSyncGateway";

export class ConnectBoardSync {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly gateway: IBoardSyncGateway
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    peer: SyncPeer;
  }): Promise<Result<SyncSession, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    return ok(
      await this.gateway.connect(
        input.boardId,
        input.peer,
        granted.value.access.canWrite
      )
    );
  }
}
