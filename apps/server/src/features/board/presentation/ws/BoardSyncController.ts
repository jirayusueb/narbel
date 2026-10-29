import { Elysia, status, t } from "elysia";
import { websocket } from "elysia/websocket";

import { STATUS_BY_CODE } from "../../../../shared/kernel/errors/AppError";
import { errorBody } from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { SyncSession } from "../../application/ports/IBoardSyncGateway";
import type { BoardUseCases } from "../../ioc";
import { actorFrom, shareQuery } from "../http/actor";

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
      authOptional: true,
      params: t.Object({ id: t.String() }),
      query: shareQuery,
      // same access resolution as HTTP, at upgrade time, so strangers get a plain HTTP error instead of a socket
      beforeHandle: async ({ user, request, params }) => {
        const board = await uc.getBoard.execute({
          actor: actorFrom(request, user, params.id),
          boardId: params.id,
        });
        if (board.isErr()) {
          const { code, message, details } = board.error;
          return status(
            STATUS_BY_CODE[code] as 403 | 404,
            errorBody(code, message, details)
          );
        }
      },
      parse: (_ws, message) => message,
      open(ws) {
        const connect = async () => {
          const result = await uc.connectBoardSync.execute({
            actor: actorFrom(ws.request, ws.user, ws.params.id),
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
          try {
            session?.receive(bytes);
          } catch {
            ws.close(WS_POLICY_VIOLATION, "malformed message");
          }
        }
      },
      async close(ws) {
        const session = await sessions.get(ws.id);
        sessions.delete(ws.id);
        session?.close();
      },
    });
};
