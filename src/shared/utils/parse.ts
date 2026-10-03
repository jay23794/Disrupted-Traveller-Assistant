import { z, type ZodType } from "zod";
import { ValidationError } from "../errors/app-error.js";

/**
 * Validates one caller-supplied value, returning it parsed (trimmed, uppercased, defaulted)
 * or failing with a ValidationError.
 *
 * Services use this on every argument because their callers are tools driven by a language
 * model: input is never trusted, and `z.prettifyError` reads well both in an HTTP error body
 * and to a model working out how to correct its own tool call.
 */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ValidationError(`Invalid ${label}`, z.prettifyError(result.error));
  }
  return result.data;
}
