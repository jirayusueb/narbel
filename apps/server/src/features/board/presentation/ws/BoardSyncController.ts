import { Elysia, status, t } from "elysia";
import { websocket } from "elysia/websocket";

import { errorBody } from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { SyncSession } from "../../application/ports/IBoardSyncGateway";
import type { BoardUseCases } from "../../ioc";

const WS_POLICY_VIOLATION = 1008;

const toBytes = (message: unknown): Uint8Array | undefined => {
  if (message instanceof Uint8Array) {
    return message;
  }
  if (message instanceof ArrayBuffer) {
    return new Uint8Array(message);
  }
  return undefined;
};

export const createBoardSyncController = (
  betterAuth: BetterAuthPlugin,
  uc: BoardUseCases
) => {
  // open() is async but the client sends sync step 1 right away, so messages await this
  const sessions = new Map<string, Promise<SyncSession | undefined>>();

  return new Elysia({ name: "board/sync" })
    .use(betterAuth)
    .use(websocket())
    .ws("/api/boards/sync/:id", {
      auth: true,
      params: t.Object({ id: t.String() }),
      // owner check at upgrade time, so strangers get a plain HTTP 404 instead of a socket
      beforeHandle: async ({ user, params }) => {
        const board = await uc.getBoard.execute({
          userId: user.id,
          boardId: params.id,
        });
        if (board.isErr()) {
          return status(404, errorBody("NotFound", "Board not found"));
        }
      },
      parse: (_ws, message) => message,
      open(ws) {
        const connect = async () => {
          const result = await uc.connectBoardSync.execute({
            userId: ws.user.id,
            boardId: ws.params.id,
            peer: {
              send: (data) => {
                ws.send(data);
              },
              close: () => ws.close(),
            },
          });
          if (result.isErr()) {
            ws.close(WS_POLICY_VIOLATION, "forbidden");
            return;
          }
          return result.value;
        };
        sessions.set(ws.id, connect());
      },
      async message(ws, message) {
        const bytes = toBytes(message);
        if (bytes) {
          const session = await sessions.get(ws.id);
          session?.receive(bytes);
        }
      },
      async close(ws) {
        const session = await sessions.get(ws.id);
        sessions.delete(ws.id);
        session?.close();
      },
    });
};
