import type { ErrorRequestHandler } from "express";
import { z, ZodError } from "zod";
import { errorResponse } from "../utils/apiResponse.js";
import type { Logger } from "../utils/logger.js";
import { AppError, ValidationError } from "./app-error.js";

/** express.json() rejects malformed bodies with a tagged SyntaxError. */
function isMalformedJson(err: unknown): boolean {
  return err instanceof SyntaxError && "body" in err;
}

/**
 * The single place where an error becomes an HTTP response. Registered last in
 * createApp(), so every route and middleware reports failures the same way and
 * no controller needs a try/catch.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const where = `${req.method} ${req.originalUrl}`;

    if (err instanceof AppError && err.isOperational) {
      logger.warn(`${where} -> ${err.statusCode} ${err.code}: ${err.message}`);
      const details = err instanceof ValidationError ? err.details : undefined;
      res.status(err.statusCode).json(errorResponse(err.code, err.message, details));
      return;
    }

    if (err instanceof ZodError) {
      logger.warn(`${where} -> 400 VALIDATION_ERROR`);
      res
        .status(400)
        .json(errorResponse("VALIDATION_ERROR", "Validation failed", z.flattenError(err)));
      return;
    }

    if (isMalformedJson(err)) {
      logger.warn(`${where} -> 400 INVALID_JSON`);
      res.status(400).json(errorResponse("INVALID_JSON", "Request body is not valid JSON"));
      return;
    }

    // Unexpected: a bug, or a non-operational AppError. Log everything we have,
    // tell the caller nothing — stack traces and upstream messages stay server-side.
    logger.error(`${where} -> 500 unhandled error`, err);
    res
      .status(500)
      .json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred. Please try again."));
  };
}
