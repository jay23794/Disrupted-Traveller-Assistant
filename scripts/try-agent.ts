/**
 * Drive one agent from the command line and print its answer plus the trace.
 *
 *   npm run try:agent -- flight "Is BA117 delayed today?"
 *   npm run try:agent -- flight "Why is BA008 so late?" --real-weather
 *
 * Wiring lives here for now; it moves into src/infra/container.ts in a later step.
 */
import "dotenv/config";
import { loadEnv } from "../src/config/env.js";
import type { Agent } from "../src/core/agent.js";
import { Trace, type TraceEvent } from "../src/core/trace.js";
import { createFlightAgent } from "../src/features/flight/flight.agent.js";
import { FlightService } from "../src/features/flight/flight.service.js";
import { MockFlightProvider } from "../src/features/flight/providers/mock-flight.provider.js";
import { MockWeatherProvider } from "../src/features/flight/providers/mock-weather.provider.js";
import { OpenMeteoWeatherProvider } from "../src/features/flight/providers/open-meteo.provider.js";
import { createLoungeAgent } from "../src/features/lounge/lounge.agent.js";
import { LoungeService } from "../src/features/lounge/lounge.service.js";
import { MockLoungeProvider } from "../src/features/lounge/providers/mock-lounge.provider.js";
import { MockMembershipProvider } from "../src/features/lounge/providers/mock-membership.provider.js";
import { OpenAiCompatibleLlmClient, type LlmClient } from "../src/infra/llm.js";
import { AppError } from "../src/shared/errors/app-error.js";
import { createLogger, type Logger } from "../src/shared/utils/logger.js";

interface BuildDeps {
  llm: LlmClient;
  logger: Logger;
  maxSteps: number;
  realWeather: boolean;
}

/** Every agent this script can run. Later steps add lounge, insurance and orchestrator. */
const AGENTS: Record<string, (deps: BuildDeps) => Agent> = {
  flight: ({ llm, logger, maxSteps, realWeather }) => {
    const weather = realWeather
      ? new OpenMeteoWeatherProvider({ logger })
      : new MockWeatherProvider();
    const service = new FlightService(new MockFlightProvider(), weather);

    return createFlightAgent(llm, service, { maxSteps, logger });
  },

  lounge: ({ llm, logger, maxSteps }) => {
    const service = new LoungeService(new MockLoungeProvider(), new MockMembershipProvider());

    return createLoungeAgent(llm, service, { maxSteps, logger });
  },
};

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
const [name, ...rest] = argv.filter((arg) => !arg.startsWith("--"));
const message = rest.join(" ").trim();

if (name === undefined || message === "") {
  console.error(`usage: npm run try:agent -- <agent> "<message>" [--real-weather] [--quiet]

agents: ${Object.keys(AGENTS).join(", ")}
example: npm run try:agent -- flight "Is BA117 delayed today?"`);
  process.exit(1);
}

const build = AGENTS[name];
if (!build) {
  console.error(`unknown agent "${name}". available: ${Object.keys(AGENTS).join(", ")}`);
  process.exit(1);
}

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL });
const agent = build({
  llm: new OpenAiCompatibleLlmClient({ env, logger }),
  logger,
  maxSteps: env.AGENT_MAX_STEPS,
  realWeather: flags.has("--real-weather"),
});

const truncate = (text: string, max = 100): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`;

function describe(event: TraceEvent): string {
  switch (event.type) {
    case "agent_start":
      return `${event.agent} start — "${truncate(event.input)}"`;
    case "agent_end":
      return `${event.agent} done in ${event.durationMs}ms`;
    case "llm_call":
      return `${event.agent} llm ${event.durationMs}ms → ${event.toolCalls} tool call(s)`;
    case "tool_call":
      return `${event.agent} → ${event.tool}(${truncate(JSON.stringify(event.args))})`;
    case "tool_result":
      return `${event.agent} ← ${event.tool} ${event.status} ${event.durationMs}ms${
        event.error === undefined ? "" : `: ${event.error}`
      }`;
    case "error":
      return `${event.agent} error: ${event.message}`;
  }
}

function printTrace(trace: Trace): void {
  const first = trace.events[0];
  if (!first) return;
  const startedAt = Date.parse(first.timestamp);

  console.log("\n--- trace ---");
  for (const event of trace.events) {
    const offset = String(Date.parse(event.timestamp) - startedAt).padStart(5);
    console.log(`  +${offset}ms  ${describe(event)}`);
  }
  console.log(
    `  agents=${trace.agentsCalled().join(",")} llmCalls=${trace.totalLlmCalls()} ` +
      `toolCalls=${trace.toolCalls().length} failed=${trace.failedToolCalls().length}`,
  );
}

const trace = new Trace();

console.log(`agent=${name} model=${env.LLM_MODEL} weather=${flags.has("--real-weather") ? "open-meteo" : "mock"}`);
console.log(`> ${message}\n`);

try {
  const answer = await agent.run(message, trace);
  console.log(answer);
} catch (err) {
  process.exitCode = 1;
  console.error(
    err instanceof AppError ? `\n${err.code}: ${err.message}` : `\nunexpected failure: ${String(err)}`,
  );
} finally {
  if (!flags.has("--quiet")) printTrace(trace);
}
