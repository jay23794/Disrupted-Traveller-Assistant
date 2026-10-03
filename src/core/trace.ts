/** Carried by every event, so a trace reads as one timeline across every agent. */
export interface TraceEventMeta {
  /** ISO-8601. Stamped by `Trace.log()` so callers cannot disagree about the clock. */
  timestamp: string;
  /** Which agent the event belongs to — an orchestrator and its sub-agents share one Trace. */
  agent: string;
}

/**
 * Everything the runtime records. `tool_call` and `tool_result` share a `callId` so a
 * result can be matched to its call even when a step runs several tools in parallel.
 */
export type TraceEvent =
  | (TraceEventMeta & { type: "agent_start"; input: string })
  | (TraceEventMeta & { type: "agent_end"; output: string; durationMs: number })
  | (TraceEventMeta & { type: "tool_call"; tool: string; callId: string; args: unknown })
  | (TraceEventMeta & {
      type: "tool_result";
      tool: string;
      callId: string;
      status: "ok" | "error";
      durationMs: number;
      /** Present on `status: "error"`: the message that was handed back to the model. */
      error?: string;
    })
  | (TraceEventMeta & { type: "llm_call"; durationMs: number; toolCalls: number })
  | (TraceEventMeta & { type: "error"; message: string; code?: string });

export type TraceEventType = TraceEvent["type"];

/** The one member of the union with the given `type`, e.g. `TraceEventOf<"tool_call">`. */
export type TraceEventOf<T extends TraceEventType> = Extract<TraceEvent, { type: T }>;

/** Distributes over the union so each member keeps its own fields. */
type WithoutTimestamp<E> = E extends unknown ? Omit<E, "timestamp"> : never;

/** What callers pass to `log()`: an event minus the timestamp the Trace adds. */
export type TraceEventInput = WithoutTimestamp<TraceEvent>;

/**
 * The audit trail of a single request: which agents ran, which tools they called, what
 * failed and how long each step took. One Trace is created per request and threaded
 * through every agent, so the whole delegation is reconstructable afterwards.
 *
 * Recording only — a Trace never changes what the runtime does.
 */
export class Trace {
  private _events: TraceEvent[] = [];

  log(event: TraceEventInput): void {
    // TypeScript cannot reassemble a distributed Omit back into the union, so the cast
    // stands in for what the type of `event` already guarantees.
    this._events.push({ ...event, timestamp: new Date().toISOString() } as TraceEvent);
  }

  get events(): readonly TraceEvent[] {
    return this._events;
  }

  /** Agent names in the order they first started — the delegation path. */
  agentsCalled(): string[] {
    const names: string[] = [];
    for (const event of this._events) {
      if (event.type === "agent_start" && !names.includes(event.agent)) names.push(event.agent);
    }
    return names;
  }

  /** Every tool call, or only those made by one agent. */
  toolCalls(agent?: string): TraceEventOf<"tool_call">[] {
    return this._events.filter(
      (event): event is TraceEventOf<"tool_call"> =>
        event.type === "tool_call" && (agent === undefined || event.agent === agent),
    );
  }

  /** Tool results the agent reported back to the model as errors. */
  failedToolCalls(): TraceEventOf<"tool_result">[] {
    return this._events.filter(
      (event): event is TraceEventOf<"tool_result"> =>
        event.type === "tool_result" && event.status === "error",
    );
  }

  totalLlmCalls(): number {
    return this._events.filter((event) => event.type === "llm_call").length;
  }
}
