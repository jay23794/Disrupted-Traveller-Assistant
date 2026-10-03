import cors from "cors";
import express, { type Express } from "express";
import { NotFoundError } from "./shared/errors/app-error.js";
import { createErrorHandler } from "./shared/errors/error-handler.js";
import { successResponse } from "./shared/utils/apiResponse.js";
import type { Logger } from "./shared/utils/logger.js";

export interface AppDeps {
  logger: Logger;
}

/**
 * Builds the HTTP app from injected dependencies and returns it without
 * listening, so server.ts owns the socket and tests/scripts can drive the app
 * directly. Feature routers get mounted here as they are built.
 */
export function createApp({ logger }: AppDeps): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json(successResponse({ status: "ok", uptime: Math.round(process.uptime()) }));
  });

  // Reached only when no route above matched: turn it into a normal 404 error.
  app.use((req, _res) => {
    throw new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`);
  });

  // Last, always: everything thrown above lands here.
  app.use(createErrorHandler(logger));

  return app;
}
