import { z } from "zod";
import { getJson } from "../../../infra/http.js";
import type { Logger } from "../../../shared/utils/logger.js";
import type { WeatherRepository } from "../flight.repository.js";
import { airportWeatherSchema, type AirportWeather } from "../flight.schema.js";

const SERVICE = "Open-Meteo";
const BASE_URL = "https://api.open-meteo.com/v1/forecast";

/**
 * Open-Meteo takes coordinates, not airport codes, and we are not going to ship an airport
 * database for a demo. These are the airports the fixtures use, so the real and mock
 * weather providers cover exactly the same set and can be swapped without surprises.
 */
const AIRPORT_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  LHR: { latitude: 51.47, longitude: -0.4543 },
  DXB: { latitude: 25.2532, longitude: 55.3657 },
  SIN: { latitude: 1.3644, longitude: 103.9915 },
  JFK: { latitude: 40.6413, longitude: -73.7781 },
  CDG: { latitude: 49.0097, longitude: 2.5479 },
};

/** WMO weather interpretation codes, in the words a traveller would use. */
const WEATHER_CODES: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  85: "Light snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorms",
  96: "Thunderstorms with hail",
  99: "Severe thunderstorms with hail",
};

/** Only the three fields we need; Open-Meteo sends plenty more. */
const openMeteoResponseSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    weather_code: z.int(),
    /** Open-Meteo defaults wind speed to km/h, which is what AirportWeather wants. */
    wind_speed_10m: z.number(),
  }),
});

const round1 = (value: number): number => Math.round(value * 10) / 10;

export interface OpenMeteoWeatherProviderDeps {
  logger: Logger;
  timeoutMs?: number;
}

/**
 * Live weather from Open-Meteo — a free, key-less API, so the demo works on any machine.
 *
 * Interchangeable with MockWeatherProvider: the service depends on WeatherRepository, so
 * which one is wired in is a container decision. Unknown airports return null rather than
 * guessing at coordinates, and the service turns that into a NotFoundError.
 */
export class OpenMeteoWeatherProvider implements WeatherRepository {
  private _logger: Logger;
  private _timeoutMs: number | undefined;

  constructor({ logger, timeoutMs }: OpenMeteoWeatherProviderDeps) {
    this._logger = logger;
    this._timeoutMs = timeoutMs;
  }

  async getCurrent(airportCode: string): Promise<AirportWeather | null> {
    const coordinates = AIRPORT_COORDINATES[airportCode];
    if (!coordinates) return null;

    const url =
      `${BASE_URL}?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}` +
      `&current=temperature_2m,weather_code,wind_speed_10m`;

    const raw = await getJson<unknown>(url, {
      service: SERVICE,
      logger: this._logger,
      ...(this._timeoutMs === undefined ? {} : { timeoutMs: this._timeoutMs }),
    });

    const parsed = openMeteoResponseSchema.safeParse(raw);
    if (!parsed.success) {
      // Reaching here means Open-Meteo changed its payload. Fail as an upstream problem
      // rather than handing a half-read response to an agent.
      this._logger.error(`${SERVICE} returned an unexpected payload`, z.prettifyError(parsed.error));
      return null;
    }

    const { temperature_2m, weather_code, wind_speed_10m } = parsed.data.current;

    return airportWeatherSchema.parse({
      tempC: round1(temperature_2m),
      condition: WEATHER_CODES[weather_code] ?? `Unknown conditions (WMO code ${weather_code})`,
      windKph: round1(wind_speed_10m),
    });
  }
}
