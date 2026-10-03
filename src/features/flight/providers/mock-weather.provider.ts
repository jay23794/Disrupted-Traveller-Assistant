import { z } from "zod";
import { airportCodeSchema, airportWeatherSchema, type AirportWeather } from "../flight.schema.js";
import type { WeatherRepository } from "../flight.repository.js";

/**
 * Static conditions per airport, deliberately consistent with the flight fixtures: the
 * snow at LHR is why BA008 is seven hours late, and the sandstorm at DXB is why EK001 is
 * cancelled. That lets the flight agent corroborate a delay reason with real weather
 * instead of two sub-agents contradicting each other.
 */
const AIRPORT_WEATHER = z.record(airportCodeSchema, airportWeatherSchema).parse({
  LHR: { tempC: -1, condition: "Heavy snow", windKph: 34 },
  DXB: { tempC: 41, condition: "Blowing sand, low visibility", windKph: 52 },
  SIN: { tempC: 30, condition: "Thunderstorms", windKph: 18 },
  JFK: { tempC: 7, condition: "Clear", windKph: 12 },
  CDG: { tempC: 4, condition: "Light rain", windKph: 21 },
});

/** Stands in for a weather API. Static data: the same airport always reads the same. */
export class MockWeatherProvider implements WeatherRepository {
  async getCurrent(airportCode: string): Promise<AirportWeather | null> {
    return AIRPORT_WEATHER[airportCode] ?? null;
  }
}
