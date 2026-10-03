import "dotenv/config";
import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { createLogger } from "./shared/utils/logger.js";

// Composition root: validate config, build dependencies, start listening.
// Agent and feature wiring moves into src/infra/container.ts in a later step.
const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, silent: env.NODE_ENV === "test" });
const app = createApp({ logger });

const server = app.listen(env.PORT, () => {
  logger.info(`listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error(`port ${env.PORT} is already in use — set PORT to a free port`);
    process.exit(1);
  }
  throw err;
});

function shutdown(signal: string): void {
  logger.info(`${signal} received, closing server`);

  // Stop accepting connections, then exit once in-flight requests finish.
  const forced = setTimeout(() => {
    logger.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);
  forced.unref();

  server.close((err) => {
    if (err) {
      logger.error("error while closing server", err);
      process.exit(1);
    }
    logger.info("server closed");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
