import { z } from "zod";
import type { LlmChatResult, LlmClient, LlmMessage, LlmTool, LlmToolCall } from "../infra/llm.js";
import {
  AgentLimitError,
  AppError,
  ExternalServiceError,
  LlmError,
} from "../shared/errors/app-error.js";
import { createLogger, type Logger } from "../shared/utils/logger.js";
import { toLlmToolDefinition, type AnyTool } from "./tool.js";
import type { Trace } from "./trace.js";

/** A tool that hangs must not hang the request. */
const TOOL_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_STEPS = 6;

export interface AgentDeps {
  name: string;
  /** The system prompt: role, scope, and which tool to use when. */
  instructions: string;
  tools: AnyTool[];
  llm: LlmClient;
  /** Hard cap on llm → tools → llm round trips before we give up. */
  maxSteps?: number;
  logger?: Logger;
}

/** What one tool call hands back to the model. Always a string — that is the wire format. */
interface ToolOutcome {
  toolCallId: string;
  content: string;
}

/**
 * The agent loop: ask the model, run whatever tools it asks for, feed the results back,
 * repeat until it answers in prose or hits `maxSteps`.
 *
 * Domain-agnostic by design. An Agent knows about instructions, tools and a model; what
 * those tools do is the feature's business. The orchestrator and every specialist are
 * instances of this one class, differing only in instructions and tools.
 */
export class Agent {
  private _name: string;
  private _instructions: string;
  private _tools: Map<string, AnyTool>;
  private _toolDefinitions: LlmTool[];
  private _llm: LlmClient;
  private _maxSteps: number;
  private _logger: Logger;

  constructor({
    name,
    instructions,
    tools,
    llm,
    maxSteps = DEFAULT_MAX_STEPS,
    logger = createLogger(),
  }: AgentDeps) {
    this._name = name;
    this._instructions = instructions;
    this._tools = new Map(tools.map((tool) => [tool.name, tool]));
    this._toolDefinitions = tools.map(toLlmToolDefinition);
    this._llm = llm;
    this._maxSteps = maxSteps;
    this._logger = logger;
  }

  get name(): string {
    return this._name;
  }

  /**
   * Runs the agent to a final text answer, recording each step in `trace`.
   *
   * Throws only when the agent cannot continue: the model is unreachable, or it kept
   * calling tools past `maxSteps`. A tool that fails is not a failure of the run — the
   * error goes back to the model, which is free to retry it or explain itself.
   */
  async run(input: string, trace: Trace): Promise<string> {
    const startedAt = Date.now();
    trace.log({ type: "agent_start", agent: this._name, input });

    const messages: LlmMessage[] = [
      { role: "system", content: this._instructions },
      { role: "user", content: input },
    ];

    for (let step = 0; step < this._maxSteps; step++) {
      const reply = await this._chat(messages, trace);

      if (reply.toolCalls.length === 0) {
        if (reply.content === null) {
          this._fatal(trace, new LlmError("The assistant returned an empty response."));
        }

        trace.log({
          type: "agent_end",
          agent: this._name,
          output: reply.content,
          durationMs: Date.now() - startedAt,
        });
        return reply.content;
      }

      // The assistant turn must be replayed with its tool calls attached, or the tool
      // messages that follow have nothing to answer.
      messages.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls });

      const outcomes = await Promise.all(
        reply.toolCalls.map((call) => this._callTool(call, trace)),
      );
      for (const outcome of outcomes) {
        messages.push({ role: "tool", toolCallId: outcome.toolCallId, content: outcome.content });
      }
    }

    return this._fatal(
      trace,
      new AgentLimitError(
        `The assistant could not finish this request within ${this._maxSteps} steps.`,
      ),
    );
  }

  /** One model call, timed into the trace. An unreachable model ends the run. */
  private async _chat(messages: LlmMessage[], trace: Trace): Promise<LlmChatResult> {
    const startedAt = Date.now();

    try {
      const reply = await this._llm.chat({
        messages,
        ...(this._toolDefinitions.length > 0 ? { tools: this._toolDefinitions } : {}),
      });

      trace.log({
        type: "llm_call",
        agent: this._name,
        durationMs: Date.now() - startedAt,
        toolCalls: reply.toolCalls.length,
      });
      return reply;
    } catch (err) {
      this._fatal(trace, err);
    }
  }

  /**
   * Runs one tool call and renders the outcome as a string for the model.
   *
   * Never throws: every failure — unknown tool, unparseable or invalid arguments, a
   * timeout, a service error — becomes an `{ error, details? }` result the model can read
   * and react to. Self-correction depends on it seeing what went wrong.
   */
  private async _callTool(call: LlmToolCall, trace: Trace): Promise<ToolOutcome> {
    const startedAt = Date.now();
    const tool = this._tools.get(call.name);
    const args = parseToolArgs(call.arguments);

    // Log the attempt before judging it, so a malformed call still shows up in the trace.
    trace.log({
      type: "tool_call",
      agent: this._name,
      tool: call.name,
      callId: call.id,
      args: args.ok ? args.value : call.arguments,
    });

    if (!tool) {
      const known = [...this._tools.keys()].join(", ") || "none";
      return this._toolError(call, trace, startedAt, {
        error: `Unknown tool "${call.name}". Available tools: ${known}.`,
      });
    }

    if (!args.ok) {
      return this._toolError(call, trace, startedAt, {
        error: "Invalid arguments",
        details: args.error,
      });
    }

    const validated = tool.schema.safeParse(args.value);
    if (!validated.success) {
      return this._toolError(call, trace, startedAt, {
        error: "Invalid arguments",
        details: z.prettifyError(validated.error),
      });
    }

    try {
      const result = await withTimeout(tool.execute(validated.data), TOOL_TIMEOUT_MS, tool.name);

      trace.log({
        type: "tool_result",
        agent: this._name,
        tool: tool.name,
        callId: call.id,
        status: "ok",
        durationMs: Date.now() - startedAt,
      });
      return { toolCallId: call.id, content: stringifyResult(result) };
    } catch (err) {
      // An AppError was anticipated by whoever threw it, so its message is safe to show
      // the model. Anything else is a bug: log it in full, tell the model nothing.
      if (err instanceof AppError) {
        return this._toolError(call, trace, startedAt, { error: err.message });
      }

      this._logger.error(`agent "${this._name}": tool "${tool.name}" threw an unexpected error`, err);
      return this._toolError(call, trace, startedAt, {
        error: `The tool "${tool.name}" failed unexpectedly.`,
      });
    }
  }

  /** Records a failed tool result and shapes it for the model. */
  private _toolError(
    call: LlmToolCall,
    trace: Trace,
    startedAt: number,
    payload: { error: string; details?: unknown },
  ): ToolOutcome {
    trace.log({
      type: "tool_result",
      agent: this._name,
      tool: call.name,
      callId: call.id,
      status: "error",
      durationMs: Date.now() - startedAt,
      error: payload.error,
    });
    return { toolCallId: call.id, content: JSON.stringify(payload) };
  }

  /** Records an error that ends the run, then rethrows it. Returns `never`. */
  private _fatal(trace: Trace, err: unknown): never {
    trace.log({
      type: "error",
      agent: this._name,
      message: err instanceof Error ? err.message : "The agent run failed.",
      ...(err instanceof AppError ? { code: err.code } : {}),
    });
    throw err;
  }
}

type ParsedArgs = { ok: true; value: unknown } | { ok: false; error: string };

/** Models emit arguments as a JSON string, and send `""` for a tool that takes none. */
function parseToolArgs(raw: string): ParsedArgs {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "arguments are not valid JSON",
    };
  }
}

/** The tool message must be a string; `undefined` would silently drop the result. */
function stringifyResult(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result ?? null);
}

/**
 * Caps how long a tool may run. Rejects with an operational error, so the loop reports the
 * timeout to the model like any other tool failure instead of aborting the run.
 */
async function withTimeout<T>(work: Promise<T>, ms: number, toolName: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ExternalServiceError(toolName, `The tool "${toolName}" timed out after ${ms}ms.`)),
      ms,
    );
  });

  try {
    return await Promise.race([work, expiry]);
  } finally {
    clearTimeout(timer);
  }
}
