import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardPresence } from "../ports/IBoardPresence";
import type {
  IBoardSyncGateway,
  SyncPeer,
  SyncSession,
} from "../ports/IBoardSyncGateway";

export const TOUCH_INTERVAL_MS = 15_000;

export class ConnectBoardSync {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly gateway: IBoardSyncGateway,
    private readonly presence: IBoardPresence,
    private readonly now: () => number = Date.now
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
    const session = await this.gateway.connect(
      input.boardId,
      input.peer,
      granted.value.access.canWrite
    );
    return ok(this.track(input.boardId, input.actor, session));
  }

  // presence calls are not awaited: a slow or dead Redis must never delay sync frames
  private track(
    boardId: string,
    actor: Actor,
    session: SyncSession
  ): SyncSession {
    const connectionId = crypto.randomUUID();
    let lastTouch = this.now();
    const viewer = { userId: actor.userId ?? null, name: actor.name ?? null };
    void this.presence.join(boardId, connectionId, viewer);
    return {
      receive: (message) => {
        session.receive(message);
        const at = this.now();
        if (at - lastTouch >= TOUCH_INTERVAL_MS) {
          lastTouch = at;
          void this.presence.join(boardId, connectionId, viewer);
        }
      },
      close: () => {
        session.close();
        void this.presence.leave(boardId, connectionId);
      },
    };
  }
}
