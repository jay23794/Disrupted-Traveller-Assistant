import { z } from "zod";
import type { AnyTool, Tool } from "../../core/tool.js";
import type { FlightService } from "./flight.service.js";

/**
 * Argument schemas are deliberately loose about format: `flightNumber` is any string here,
 * and FlightService owns the IATA rules. The service's ValidationError comes back to the
 * model as a readable message it can correct from, so the rule lives in one place instead
 * of being restated in every tool that takes a flight number.
 */
const flightStatusArgs = z.object({
  flightNumber: z
    .string()
    .min(2)
    .describe('The flight number exactly as the traveller gave it, e.g. "BA117" or "ek002".'),
  date: z.iso
    .date()
    .optional()
    .describe("Departure date as YYYY-MM-DD. Omit this for today's flights."),
});

const airportWeatherArgs = z.object({
  airportCode: z.string().min(3).describe('Three-letter IATA airport code, e.g. "LHR".'),
});

/**
 * The flight agent's tools. Thin adapters: each one validates, calls a service method, and
 * returns the result for the model to read. No business logic, no repository access.
 */
export function createFlightTools(flightService: FlightService): AnyTool[] {
  const getFlightStatus: Tool<z.infer<typeof flightStatusArgs>> = {
    name: "get_flight_status",
    description:
      "Look up the live status of one flight: whether it is on time, delayed, cancelled " +
      "or already departed, how many minutes late it is, why, and its departure terminal. " +
      "Use this whenever the traveller mentions a flight number, asks what is happening " +
      "with their flight, or when another decision depends on the delay length. Never " +
      "state a flight's status without calling this first.",
    schema: flightStatusArgs,
    execute: ({ flightNumber, date }) => flightService.getStatus(flightNumber, date),
  };

  const getAirportWeather: Tool<z.infer<typeof airportWeatherArgs>> = {
    name: "get_airport_weather",
    description:
      "Get current conditions at an airport: temperature in Celsius, a plain-language " +
      "condition, and wind speed in km/h. Use this when the traveller asks about weather, " +
      "or to check whether a delay or cancellation is explained by conditions at the " +
      "departure or arrival airport. Takes an airport code, not a flight number.",
    schema: airportWeatherArgs,
    execute: ({ airportCode }) => flightService.getAirportWeather(airportCode),
  };

  return [getFlightStatus, getAirportWeather];
}
