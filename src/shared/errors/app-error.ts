/**
 * Base class for every error we throw on purpose.
 *
 * `isOperational` marks an error we anticipated (bad input, upstream 500, agent
 * hit its step cap). Those are safe to show the caller. Anything that is not an
 * operational AppError is a bug, and the error handler hides its details.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly isOperational: boolean;

  constructor(message: string, code: string, statusCode: number, isOperational = true) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, new.target);
  }
}

/** Request body, query or tool arguments failed validation. */
export class ValidationError extends AppError {
  readonly details: unknown;

  constructor(message = "Validation failed", details?: unknown) {
    super(message, "VALIDATION_ERROR", 400);
    this.details = details;
  }
}

/** A flight, lounge, policy or route the caller asked for does not exist. */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
  }
}

/** An upstream dependency (HTTP API, MCP server) failed or was unreachable. */
export class ExternalServiceError extends AppError {
  readonly service: string;

  constructor(service: string, message = `Upstream service "${service}" failed`, cause?: unknown) {
    super(message, "EXTERNAL_SERVICE_ERROR", 502);
    this.service = service;
    this.cause = cause;
  }
}

/** The LLM call failed, timed out, or returned something unusable. */
export class LlmError extends AppError {
  constructor(message = "The language model request failed", cause?: unknown) {
    super(message, "LLM_ERROR", 502);
    this.cause = cause;
  }
}

/** The agent loop hit a guardrail (max steps / timeout) before finishing. */
export class AgentLimitError extends AppError {
  constructor(message = "The agent stopped before completing the request") {
    super(message, "AGENT_LIMIT_EXCEEDED", 500);
  }
}
