import { z } from "zod";

/** IATA airport code: three letters, e.g. LHR. Shared by flights and weather lookups. */
export const airportCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "must be a 3-letter IATA airport code, e.g. LHR");

/**
 * IATA flight designator: a 2–3 character carrier code then 1–4 digits (BA117, EK002).
 * Uppercased on parse so "ba117" and "BA117" are the same flight.
 */
export const flightNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,3}\d{1,4}$/, "must be an IATA flight number, e.g. BA117");

/** Departure date as `YYYY-MM-DD`. */
export const flightDateSchema = z.iso.date();

/**
 * Where a flight stands right now. `departed` is terminal and says nothing about
 * punctuality on its own — a departed flight can still carry a delay worth claiming for.
 */
export const flightStateSchema = z.enum(["on_time", "delayed", "cancelled", "departed"]);
export type FlightState = z.infer<typeof flightStateSchema>;

/**
 * One flight's status: the full answer to "what is happening with my flight?".
 *
 * `delayMinutes` is the single number downstream decisions hang on — insurance delay
 * thresholds, rebooking advice, whether a lounge wait is worth suggesting — so it is
 * always present rather than implied by comparing the two timestamps.
 */
export const flightStatusSchema = z
  .object({
    flightNumber: flightNumberSchema,
    date: flightDateSchema,
    airline: z.string().min(1),
    origin: airportCodeSchema,
    destination: airportCodeSchema,
    /** Departure terminal as the airport labels it, e.g. "5" at LHR. */
    terminal: z.string().min(1),
    scheduledDeparture: z.iso.datetime(),
    /** Scheduled plus the delay. Equal to `scheduledDeparture` when nothing has slipped. */
    estimatedDeparture: z.iso.datetime(),
    status: flightStateSchema,
    delayMinutes: z.int().min(0),
    /** Why it slipped, in words a traveller can read. Absent when there is no delay. */
    delayReason: z.string().min(1).optional(),
  })
  .check((ctx) => {
    // Guards the mock fixtures at boot: a "delayed" flight with no delay, or a
    // punctual one carrying minutes, would quietly mislead every agent downstream.
    const { status, delayMinutes } = ctx.value;

    if (status === "delayed" && delayMinutes <= 0) {
      ctx.issues.push({
        code: "custom",
        input: delayMinutes,
        path: ["delayMinutes"],
        message: 'must be greater than 0 when status is "delayed"',
      });
    }

    if (status === "on_time" && delayMinutes !== 0) {
      ctx.issues.push({
        code: "custom",
        input: delayMinutes,
        path: ["delayMinutes"],
        message: 'must be 0 when status is "on_time"',
      });
    }
  });

export type FlightStatus = z.infer<typeof flightStatusSchema>;

/** Current conditions at an airport — context for whether a delay is weather-driven. */
export const airportWeatherSchema = z.object({
  tempC: z.number(),
  /** Free text, as a weather feed would phrase it: "Heavy snow", "Clear". */
  condition: z.string().min(1),
  windKph: z.number().min(0),
});

export type AirportWeather = z.infer<typeof airportWeatherSchema>;
