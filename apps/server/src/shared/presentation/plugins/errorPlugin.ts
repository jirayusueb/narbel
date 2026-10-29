import { Elysia, NotFound, ParseError, ValidationError } from "elysia";

import { errorBody } from "./resultPlugin";

export const errorPlugin = new Elysia({ name: "error-plugin" }).onError(
  "global",
  ({ error, set }) => {
    if (error instanceof ValidationError) {
      set.status = 400;
      return errorBody(
        "ValidationFailed",
        "Request validation failed",
        error.all
      );
    }
    if (error instanceof ParseError) {
      set.status = 400;
      return errorBody("ValidationFailed", "Malformed request body");
    }
    if (error instanceof NotFound) {
      set.status = 404;
      return errorBody("NotFound", "Route not found");
    }
    console.error(error);
    set.status = 500;
    return errorBody("InternalError", "Internal server error");
  }
);
