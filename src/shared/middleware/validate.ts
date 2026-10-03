import type { RequestHandler } from "express";
import { z, type ZodType } from "zod";
import { ValidationError } from "../errors/app-error.js";

/**
 * Parses req.body against a Zod schema before the controller runs, replacing the
 * body with the parsed (coerced, defaulted) value so controllers get typed input.
 * Throwing here is fine: Express catches synchronous throws from middleware.
 */
export function validate(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      throw new ValidationError("Request body validation failed", z.flattenError(result.error));
    }

    req.body = result.data;
    next();
  };
}
