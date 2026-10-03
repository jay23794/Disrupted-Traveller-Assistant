import OpenAI, { APIError } from "openai";
import type { Env } from "../config/env.js";
import { LlmError } from "../shared/errors/app-error.js";
import type { Logger } from "../shared/utils/logger.js";

/* -------------------------------------------------------------------------- */
/* Our own wire types. core/ talks in these, never in openai SDK types, so the */
/* agent runtime stays independent of which provider (or SDK) we use.          */
/* -------------------------------------------------------------------------- */

/** A tool call the model asked for. `arguments` is the raw JSON string it emitted. */
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: LlmToolCall[] | undefined }
  | { role: "tool"; toolCallId: string; content: string };

/** A tool offered to the model. `parameters` is JSON Schema, e.g. z.toJSONSchema(). */
export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmChatParams {
  messages: LlmMessage[];
  tools?: LlmTool[] | undefined;
}

export interface LlmChatResult {
  content: string | null;
  toolCalls: LlmToolCall[];
}

export interface LlmClient {
  chat(params: LlmChatParams): Promise<LlmChatResult>;
}

/* -------------------------------------------------------------------------- */

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;
const RETRY_BASE_DELAY_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * z.toJSONSchema() adds $schema/$id, which some OpenAI-compatible layers
 * (Gemini's, notably) reject as unknown fields in a function definition.
 */
function stripSchemaMeta(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _schema, $id: _id, ...rest } = schema;
  return rest;
}

function toSdkMessages(messages: LlmMessage[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((message) => {
    switch (message.role) {
      case "system":
        return { role: "system", content: message.content };
      case "user":
        return { role: "user", content: message.content };
      case "tool":
        return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
      case "assistant":
        return message.toolCalls && message.toolCalls.length > 0
          ? {
              role: "assistant",
              content: message.content,
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : { role: "assistant", content: message.content };
    }
  });
}

function toSdkTools(tools: LlmTool[]): OpenAI.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: stripSchemaMeta(tool.parameters),
    },
  }));
}

/** 429 and 5xx are worth one more attempt; a 4xx will fail identically. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof APIError) || err.status === undefined) return false;
  return err.status === 429 || err.status >= 500;
}

function retryDelayMs(err: unknown, attempt: number): number {
  const headers = err instanceof APIError ? err.headers : undefined;
  const retryAfter = headers instanceof Headers ? Number(headers.get("retry-after")) : NaN;

  return Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.min(retryAfter * 1_000, 10_000)
    : RETRY_BASE_DELAY_MS * (attempt + 1);
}

/**
 * Every failure leaves this module as an LlmError with a message that is safe to
 * show a traveller. The provider's own wording and stack stay in the log.
 */
function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;

  if (err instanceof APIError) {
    const { status } = err;
    if (status === 429) {
      return new LlmError("The assistant is rate limited right now. Please retry shortly.", err);
    }
    if (status === 401 || status === 403) {
      return new LlmError("The assistant is not configured correctly (provider rejected the credentials).", err);
    }
    if (status !== undefined && status >= 500) {
      return new LlmError("The assistant's model provider is unavailable. Please retry shortly.", err);
    }
    return new LlmError(`The assistant could not complete the request (provider returned ${status ?? "an error"}).`, err);
  }

  // APIConnectionError / APIConnectionTimeoutError and anything else non-HTTP.
  return new LlmError("The assistant could not reach its model provider.", err);
}

export interface OpenAiCompatibleLlmClientDeps {
  env: Env;
  logger: Logger;
}

/**
 * Talks to any OpenAI-compatible chat-completions endpoint (Groq, Gemini,
 * Ollama) — the provider is just a base URL, model and key from env.
 */
export class OpenAiCompatibleLlmClient implements LlmClient {
  private _client: OpenAI;
  private _model: string;
  private _logger: Logger;

  constructor({ env, logger }: OpenAiCompatibleLlmClientDeps) {
    this._model = env.LLM_MODEL;
    this._logger = logger;
    this._client = new OpenAI({
      baseURL: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY ?? "not-required",
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 0, 
    });
  }

  async chat({ messages, tools }: LlmChatParams): Promise<LlmChatResult> {
    console.log("CHAT...")
    const completion = await this._send({
      model: this._model,
      messages: toSdkMessages(messages),
      ...(tools && tools.length > 0 ? { tools: toSdkTools(tools) } : {}),
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new LlmError("The assistant received an empty response from the model.");
    }

    const toolCalls = (choice.message.tool_calls ?? []).flatMap<LlmToolCall>((call) =>
      call.type === "function"
        ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }]
        : [],
    );

    this._logger.debug(
      `llm ok: finish=${choice.finish_reason} toolCalls=${toolCalls.length} tokens=${completion.usage?.total_tokens ?? "?"}`,
    );

    // Providers disagree on "no text": Gemini omits `content`, Anthropic sends
    // "". Normalise both to null so callers only ever test for null.
    const content = choice.message.content;
    return { content: content === undefined || content === "" ? null : content, toolCalls };
  }

  /** One retry on 429/5xx, then give up and surface an LlmError. */
  private async _send(
    body: OpenAI.ChatCompletionCreateParamsNonStreaming,
  ): Promise<OpenAI.ChatCompletion> {
     console.log("_send...")
    for (let attempt = 0; ; attempt++) {
      try {
        return await this._client.chat.completions.create(body);
      } catch (err) {
        if (attempt >= MAX_RETRIES || !isRetryable(err)) {
          this._logger.error(`llm request failed (model=${this._model})`, err);
          throw toLlmError(err);
        }

        const delay = retryDelayMs(err, attempt);
        const status = err instanceof APIError ? err.status : "unknown";
        this._logger.warn(`llm request failed with ${status}, retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }
}
