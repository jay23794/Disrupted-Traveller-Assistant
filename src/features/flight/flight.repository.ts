import type { AirportWeather, FlightStatus } from "./flight.schema.js";

/**
 * How the flight feature reads flight data. The service depends on this interface only,
 * so the mock provider behind it can become a real airline API without the service,
 * tools or agent changing.
 *
 * `null` means "no such flight" — absence is an ordinary answer here, not a failure.
 * Turning it into a NotFoundError is the service's decision, not the repository's.
 */
export interface FlightRepository {
  findByNumber(flightNumber: string, date: string): Promise<FlightStatus | null>;
}

/** Current conditions at an airport, from whatever weather source is wired in. */
export interface WeatherRepository {
  getCurrent(airportCode: string): Promise<AirportWeather | null>;
}
