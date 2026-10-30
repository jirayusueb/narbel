import { Elysia } from "elysia";

import type { IIdempotencyStore } from "../../application/interfaces/IIdempotencyStore";
import { errorBody, resultToResponse } from "./resultPlugin";

const HEADER = "idempotency-key";
const MAX_KEY_LENGTH = 255;

interface Tracked {
  key: string;
  fingerprint: string;
  store: IIdempotencyStore;
}

// Keyed by request so the macro's two hooks share the claim without touching the route context.
const tracked = new WeakMap<Request, Tracked>();

const sha256 = (text: string) =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex");

const json = (status: number, body: unknown) => Response.json(body, { status });

interface IdempotentContext {
  request: Request;
  body: unknown;
  user?: { id: string } | null;
  store: { idempotency?: IIdempotencyStore };
}

/**
 * `idempotent: true` on a route makes a repeated request carrying the same
 * `Idempotency-Key` replay the first response instead of running again.
 * The app registers the store with `.state("idempotency", store)`; the plugin declares no state of its own because that default would overwrite it.
 */
export const idempotencyPlugin = new Elysia({ name: "idempotency" }).macro({
  idempotent: {
    beforeHandle: async (context) => {
      const {
        request,
        body,
        user,
        store: state,
      } = context as unknown as IdempotentContext;
      const header = request.headers.get(HEADER);
      const store = state.idempotency;
      if (header === null || !store) {
        return;
      }
      if (header.length < 1 || header.length > MAX_KEY_LENGTH) {
        return json(
          400,
          errorBody(
            "ValidationFailed",
            `Idempotency-Key must be 1 to ${MAX_KEY_LENGTH} characters`
          )
        );
      }
      const { pathname } = new URL(request.url);
      const key = `idem:${user?.id ?? "anon"}:${request.method}:${pathname}:${header}`;
      const fingerprint = sha256(JSON.stringify(body ?? null));
      const claim = await store.claim(key, fingerprint);
      if (claim.kind === "proceed") {
        tracked.set(request, { key, fingerprint, store });
      } else if (claim.kind === "pending") {
        return json(
          409,
          errorBody(
            "Conflict",
            "A request with this Idempotency-Key is still in progress"
          )
        );
      } else if (claim.kind === "mismatch") {
        return json(
          422,
          errorBody(
            "IdempotencyKeyReused",
            "Idempotency-Key was already used with a different request body"
          )
        );
      } else if (claim.kind === "replay") {
        return new Response(claim.body, {
          status: claim.status,
          headers: { "content-type": "application/json" },
        });
      }
    },
    // afterHandle, not mapResponse: resultPlugin's global mapResponse answers first and ends the chain
    afterHandle: async ({ request, responseValue, set }) => {
      const claim = tracked.get(request);
      if (!claim) {
        return;
      }
      tracked.delete(request);
      const response =
        resultToResponse(responseValue, set) ??
        (responseValue instanceof Response ? responseValue : undefined);
      if (!response || response.status < 200 || response.status >= 300) {
        await claim.store.release(claim.key);
        return response;
      }
      await claim.store.complete(
        claim.key,
        claim.fingerprint,
        response.status,
        await response.clone().text()
      );
      return response;
    },
    error: async ({ request }) => {
      const claim = tracked.get(request);
      if (claim) {
        tracked.delete(request);
        await claim.store.release(claim.key);
      }
    },
  },
});
