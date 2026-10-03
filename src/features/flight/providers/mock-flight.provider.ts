import { z } from "zod";
import {
  flightNumberSchema,
  flightStateSchema,
  flightStatusSchema,
  airportCodeSchema,
  type FlightStatus,
} from "../flight.schema.js";
import type { FlightRepository } from "../flight.repository.js";
import { addDays, atTime, todayIsoDate } from "../../../shared/utils/dates.js";
import flightRecords from "../data/flights.json" with { type: "json" };

/**
 * A fixture as stored on disk. Dates are relative (`dayOffset: 0` is today) and times are
 * plain `HH:MM`, so the demo data never expires: a flight delayed by four hours is always
 * delayed four hours *today*, whenever the reviewer runs this.
 */
const flightRecordSchema = z.object({
  flightNumber: flightNumberSchema,
  airline: z.string().min(1),
  origin: airportCodeSchema,
  destination: airportCodeSchema,
  terminal: z.string().min(1),
  /** Days from today: 0 today, -1 yesterday. */
  dayOffset: z.int(),
  scheduledDeparture: z.string().regex(/^\d{2}:\d{2}$/, "must be an HH:MM time"),
  status: flightStateSchema,
  delayMinutes: z.int().min(0),
  delayReason: z.string().min(1).optional(),
});

type FlightRecord = z.infer<typeof flightRecordSchema>;

/** Turns a stored fixture into a real FlightStatus against the date it is being read on. */
function toFlightStatus(record: FlightRecord, now: Date): FlightStatus {
  const { dayOffset, scheduledDeparture, ...flight } = record;
  const date = addDays(todayIsoDate(now), dayOffset);

  return flightStatusSchema.parse({
    ...flight,
    date,
    scheduledDeparture: atTime(date, scheduledDeparture),
    estimatedDeparture: atTime(date, scheduledDeparture, record.delayMinutes),
  });
}

/**
 * Stands in for an airline status API, reading the JSON fixtures.
 *
 * Records are validated once at construction so broken demo data fails at boot rather
 * than mid-conversation, but resolved to absolute dates per call — a process left running
 * overnight should still answer about the new "today".
 */
export class MockFlightProvider implements FlightRepository {
  private _records: FlightRecord[];
  private _now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this._records = z.array(flightRecordSchema).parse(flightRecords);
    this._now = now;
  }

  async findByNumber(flightNumber: string, date: string): Promise<FlightStatus | null> {
    const now = this._now();
    const match = this._records
      .map((record) => toFlightStatus(record, now))
      .find((flight) => flight.flightNumber === flightNumber && flight.date === date);

    return match ?? null;
  }
}
