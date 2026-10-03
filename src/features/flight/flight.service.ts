import { NotFoundError } from "../../shared/errors/app-error.js";
import { todayIsoDate } from "../../shared/utils/dates.js";
import { parseOrThrow } from "../../shared/utils/parse.js";
import type { FlightRepository, WeatherRepository } from "./flight.repository.js";
import {
  airportCodeSchema,
  flightDateSchema,
  flightNumberSchema,
  type AirportWeather,
  type FlightStatus,
} from "./flight.schema.js";

/**
 * The flight feature's business logic: look up a flight, look up airport weather.
 *
 * Depends on the two repository interfaces only, never on the mock providers, so the same
 * service runs against fixtures in the demo and a real airline API later. Input arrives
 * from a traveller via a model, so nothing is trusted: a flight number is normalised
 * ("ba 117" → "BA117") and an airport code validated before any lookup happens.
 */
export class FlightService {
  constructor(
    private _flightRepo: FlightRepository,
    private _weatherRepo: WeatherRepository,
  ) {}

  /**
   * Status of one flight on one date, defaulting to today — the date a disrupted traveller
   * standing in an airport means when they do not say one.
   *
   * Throws NotFoundError when no such flight exists: the repository treats absence as an
   * ordinary answer, but a caller asking about a specific flight needs to be told.
   */
  async getStatus(flightNumber: string, date?: string): Promise<FlightStatus> {
    const number = parseOrThrow(flightNumberSchema, flightNumber, "flight number");
    const on = parseOrThrow(flightDateSchema, date ?? todayIsoDate(), "date");

    const flight = await this._flightRepo.findByNumber(number, on);
    if (!flight) {
      throw new NotFoundError(`No flight ${number} found on ${on}`);
    }
    return flight;
  }

  /** Current conditions at an airport, by IATA code. */
  async getAirportWeather(airportCode: string): Promise<AirportWeather> {
    const code = parseOrThrow(airportCodeSchema, airportCode, "airport code");

    const weather = await this._weatherRepo.getCurrent(code);
    if (!weather) {
      throw new NotFoundError(`No weather available for airport ${code}`);
    }
    return weather;
  }
}
