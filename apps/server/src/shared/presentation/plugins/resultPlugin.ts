import { Elysia } from "elysia";

import { STATUS_BY_CODE } from "../../kernel/errors/AppError";
import type { AppError } from "../../kernel/errors/AppError";
import { Err, Ok } from "../../kernel/types/Result";
import type { Result } from "../../kernel/types/Result";

export const errorBody = (
  code: string,
  message: string,
  details?: unknown
) => ({
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

interface ResponseSet {
  status?: number | string;
  headers: unknown;
}

/** Turns a use-case Result into the wire response; undefined for anything else. */
export const resultToResponse = (
  responseValue: unknown,
  set: ResponseSet
): Response | undefined => {
  if (responseValue instanceof Err) {
    const { code, message, details } = responseValue.error;
    // Errors describe current state (a trashed board can be restored); Chromium caches a header-less 410 forever.
    return Response.json(errorBody(code, message, details), {
      status: STATUS_BY_CODE[code as keyof typeof STATUS_BY_CODE] ?? 500,
      headers: {
        ...(set.headers as Record<string, string>),
        "Cache-Control": "no-store",
      },
    });
  }
  if (responseValue instanceof Ok) {
    const status = typeof set.status === "number" ? set.status : 200;
    const headers = set.headers as Record<string, string>;
    if (status === 204 || responseValue.value === undefined) {
      return new Response(null, { status, headers });
    }
    return Response.json(responseValue.value, { status, headers });
  }
};

// Handlers return a use-case Result; this turns it into the wire response.
// A handler that wants 201 sets `set.status = 201` before returning the Result.
export const resultPlugin = new Elysia({ name: "result-plugin" }).mapResponse(
  "global",
  ({ responseValue, set }) => resultToResponse(responseValue, set)
);

// Handlers hand the Result straight to `resultPlugin`; this cast only keeps the
// success type visible to Eden clients, since a Result<T, _> never reaches the wire.
export const asWire = <T>(result: Result<T, AppError>): T =>
  result as unknown as T;
