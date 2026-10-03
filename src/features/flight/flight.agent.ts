import { Agent } from "../../core/agent.js";
import type { LlmClient } from "../../infra/llm.js";
import type { Logger } from "../../shared/utils/logger.js";
import { createFlightTools } from "./flight.tools.js";
import type { FlightService } from "./flight.service.js";

/**
 * The flight specialist's brief.
 *
 * Two things here exist for the system, not the traveller: the hard rule against stating a
 * status without a tool call (a hallucinated departure time is the worst thing this app
 * could do), and the requirement to spell out delay minutes and terminal in the summary —
 * the lounge and insurance agents read this text, so dropping those numbers breaks them.
 */
const INSTRUCTIONS = `You are the flight specialist in a team of agents helping a disrupted traveller.

Your scope is exactly two things: the status of a specific flight, and current weather at an airport.
You do not handle lounges, insurance claims, rebooking or compensation. If you are asked about any of
those, say briefly that it is outside your scope and report only the flight facts you have.

Rules:
- Always call a tool. Never state, guess or estimate a flight status, departure time, delay or terminal
  from your own knowledge — you have none about today's flights.
- Call get_flight_status for anything about a specific flight. If the traveller did not give a date,
  omit it and the tool uses today.
- Call get_airport_weather when asked about conditions, or to check whether a delay or cancellation is
  explained by the weather at the departure or arrival airport.
- If a tool reports the flight was not found, do not substitute a different flight. Ask the traveller to
  confirm the flight number and date.
- If a tool reports an error, say plainly what could not be retrieved. Do not invent a value in its place.

Your answer must be a short factual summary, at most four sentences, no bullet points and no pleasantries.
Always include, in words: the flight number, its status, the delay in minutes (say 0 minutes if none), and
the departure terminal — including when the flight is cancelled, because other agents read your summary and
cannot work without those details. Add the delay reason and the weather only when you retrieved them.`;

export interface FlightAgentOptions {
  maxSteps?: number;
  logger?: Logger;
}

/** Builds the "flight" agent: the runtime loop plus this feature's instructions and tools. */
export function createFlightAgent(
  llm: LlmClient,
  flightService: FlightService,
  options: FlightAgentOptions = {},
): Agent {
  return new Agent({
    name: "flight",
    instructions: INSTRUCTIONS,
    tools: createFlightTools(flightService),
    llm,
    ...options,
  });
}
