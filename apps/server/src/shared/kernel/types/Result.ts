export class Ok<T, E> {
  constructor(public readonly value: T) {}
  isOk(): this is Ok<T, E> {
    return true;
  }
  isErr(): this is Err<T, E> {
    return false;
  }
}

export class Err<T, E> {
  constructor(public readonly error: E) {}
  isOk(): this is Ok<T, E> {
    return false;
  }
  isErr(): this is Err<T, E> {
    return true;
  }
}

export type Result<T, E> = Ok<T, E> | Err<T, E>;

export const ok = <T, E>(value: T): Result<T, E> => new Ok(value);
export const err = <T, E>(error: E): Result<T, E> => new Err(error);

export const okEmpty = <E>(): Result<undefined, E> =>
  new Ok<undefined, E>(undefined);
