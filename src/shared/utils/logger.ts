export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Set for NODE_ENV=test so suites stay readable. */
  silent?: boolean;
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const SINKS: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

/**
 * Deliberately tiny: one console line per event, filtered by level. Swapping in
 * pino later means implementing `Logger`, nothing else changes.
 */
export function createLogger({ level = "info", silent = false }: LoggerOptions = {}): Logger {
  const log = (at: LogLevel, message: string, meta?: unknown): void => {
    if (silent || RANK[at] < RANK[level]) return;

    const line = `${new Date().toISOString()} ${at.toUpperCase().padEnd(5)} ${message}`;
    if (meta === undefined) SINKS[at](line);
    else SINKS[at](line, meta);
  };

  return {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),
  };
}
