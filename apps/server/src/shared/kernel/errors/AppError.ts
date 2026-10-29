export type AppErrorCode =
  | "ValidationFailed"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "PayloadTooLarge"
  | "UnsupportedMediaType"
  | "BadGateway"
  | "InternalError";

export class AppError {
  constructor(
    public readonly code: AppErrorCode,
    public readonly message: string,
    public readonly details?: Record<string, unknown>
  ) {}

  static validation(message: string, details?: Record<string, unknown>) {
    return new AppError("ValidationFailed", message, details);
  }
  static unauthorized(message = "Unauthorized") {
    return new AppError("Unauthorized", message);
  }
  static forbidden(message = "Forbidden") {
    return new AppError("Forbidden", message);
  }
  static notFound(resource: string) {
    return new AppError("NotFound", `${resource} not found`);
  }
  static conflict(message: string) {
    return new AppError("Conflict", message);
  }
  static payloadTooLarge(message: string, details?: Record<string, unknown>) {
    return new AppError("PayloadTooLarge", message, details);
  }
  static unsupportedMediaType(
    message: string,
    details?: Record<string, unknown>
  ) {
    return new AppError("UnsupportedMediaType", message, details);
  }
  static badGateway(message: string, details?: Record<string, unknown>) {
    return new AppError("BadGateway", message, details);
  }
  static internal(message = "Internal server error") {
    return new AppError("InternalError", message);
  }
}

export const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  ValidationFailed: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  PayloadTooLarge: 413,
  UnsupportedMediaType: 415,
  BadGateway: 502,
  InternalError: 500,
};
