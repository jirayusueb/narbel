import { Elysia, t } from "elysia";

import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { NotificationUseCases } from "../../application/usecases/NotificationUseCases";

const HEARTBEAT_MS = 25_000;

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // tells nginx-style proxies not to buffer the stream
  "X-Accel-Buffering": "no",
};

const eventStream = (
  uc: NotificationUseCases,
  userId: string,
  signal: AbortSignal
) => {
  const encoder = new TextEncoder();
  let stop: (() => Promise<void>) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const close = async () => {
    clearInterval(heartbeat);
    await stop?.();
    stop = undefined;
  };
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // the client may be gone while a Redis callback or heartbeat is still firing
      const write = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          void close();
        }
      };
      write("retry: 3000\n: connected\n\n");
      heartbeat = setInterval(() => write(": hb\n\n"), HEARTBEAT_MS);
      signal.addEventListener("abort", close, { once: true });
      stop = await uc.subscribe(userId, (json) => {
        write(
          `event: notification\ndata: ${new TextDecoder().decode(json)}\n\n`
        );
      });
      if (signal.aborted) {
        await close();
      }
    },
    cancel: close,
  });
};

export const createNotificationController = (
  betterAuth: BetterAuthPlugin,
  uc: NotificationUseCases
) =>
  new Elysia({ name: "notification/http", prefix: "/api/notifications" })
    .use(betterAuth)
    .use(resultPlugin)
    .get(
      "/",
      {
        auth: true,
        query: t.Object({
          cursor: t.Optional(t.String()),
          limit: t.Optional(t.Numeric()),
        }),
      },
      async ({ user, query }) => asWire(await uc.list(user.id, query))
    )
    .post(
      "/read",
      {
        auth: true,
        body: t.Object({
          ids: t.Optional(t.Array(t.String(), { maxItems: 200 })),
        }),
      },
      async ({ user, body }) => asWire(await uc.markRead(user.id, body.ids))
    )
    .get(
      "/stream",
      { auth: true },
      ({ user, request }) =>
        new Response(eventStream(uc, user.id, request.signal), {
          headers: sseHeaders,
        })
    );
