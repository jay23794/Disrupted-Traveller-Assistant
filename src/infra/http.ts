import { ExternalServiceError } from "../shared/errors/app-error.js";
import type { Logger } from "../shared/utils/logger.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES = 1;
const RETRY_DELAY_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface GetJsonOptions {
  /** Name used in the error a traveller sees. Defaults to the URL's hostname. */
  service?: string;
  timeoutMs?: number;
  /** Extra attempts after the first, for timeouts, network faults, 429s and 5xx. */
  retries?: number;
  logger?: Logger;
}

/**
 * Internal failure with a retry verdict attached. Kept private so the only error that
 * escapes this module is an ExternalServiceError.
 */
class HttpFailure extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.retryable = retryable;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "upstream service";
  }
}

/** One attempt: fetch, abort on timeout, require a 2xx, parse the body as JSON. */
async function attempt<T>(url: string, service: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      // 429 and 5xx may pass; a 4xx means the request itself is wrong.
      const retryable = response.status === 429 || response.status >= 500;
      throw new HttpFailure(`${service} returned HTTP ${response.status}`, retryable);
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new HttpFailure(`${service} returned a response we could not read`, false, err);
    }
  } catch (err) {
    if (err instanceof HttpFailure) throw err;
    if (timedOut) {
      throw new HttpFailure(`${service} did not respond within ${timeoutMs}ms`, true, err);
    }
    throw new HttpFailure(`${service} could not be reached`, true, err);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GETs JSON from an upstream service, with a timeout and a bounded retry.
 *
 * The body is cast, not validated: callers own the shape and parse it with Zod, so a
 * provider that changes its payload fails in that provider rather than halfway down the
 * call stack. Every failure leaves as an ExternalServiceError (502), which the agent
 * runtime reports to the model and the error handler turns into a clean response.
 */
export async function getJson<T>(url: string, options: GetJsonOptions = {}): Promise<T> {
  const {
    service = hostOf(url),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    logger,
  } = options;

  for (let tries = 0; ; tries++) {
    try {
      return await attempt<T>(url, service, timeoutMs);
    } catch (err) {
      const failure =
        err instanceof HttpFailure ? err : new HttpFailure(`${service} request failed`, false, err);

      if (tries < retries && failure.retryable) {
        logger?.warn(`${failure.message}, retrying (attempt ${tries + 2} of ${retries + 1})`);
        await sleep(RETRY_DELAY_MS * (tries + 1));
        continue;
      }

      logger?.error(`giving up on ${service}: ${failure.message}`, failure.cause);
      throw new ExternalServiceError(service, failure.message, failure.cause ?? failure);
    }
  }
}
