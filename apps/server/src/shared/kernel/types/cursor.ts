import { AppError } from "../errors/app-error";
import { err, ok } from "./result";
import type { Result } from "./result";

/** Keyset position: rows are ordered by (at, id) and a cursor names the last row already seen. */
export interface Cursor {
  at: Date;
  id: string;
}

export const encodeCursor = ({ at, id }: Cursor) =>
  btoa(`${at.getTime()}:${id}`).replaceAll("=", "");

/** Ok(null) when there is no cursor; err when the text is not a cursor this server produced. */
export const decodeCursor = (
  raw: string | undefined
): Result<Cursor | null, AppError> => {
  if (!raw) {
    return ok(null);
  }
  try {
    const text = atob(raw);
    const split = text.indexOf(":");
    const at = new Date(Number(text.slice(0, split)));
    const id = text.slice(split + 1);
    return split < 1 || id === "" || Number.isNaN(at.getTime())
      ? err(AppError.validation("Invalid cursor"))
      : ok({ at, id });
  } catch {
    return err(AppError.validation("Invalid cursor"));
  }
};
