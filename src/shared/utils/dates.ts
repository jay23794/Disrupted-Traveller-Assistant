/**
 * Minimal UTC date helpers. The mock data is stored relative to "today" so the demo
 * never goes stale, which means two layers need the same small arithmetic.
 *
 * Everything here is UTC: a mock backend has no business guessing airport-local
 * timezones, and the whole system reads and writes ISO-8601.
 */

/** Today as `YYYY-MM-DD`. */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Shifts a `YYYY-MM-DD` date by whole days, forwards or backwards. */
export function addDays(isoDate: string, days: number): string {
  const shifted = new Date(`${isoDate}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return todayIsoDate(shifted);
}

/**
 * Combines a `YYYY-MM-DD` date with an `HH:MM` time into an ISO-8601 instant,
 * optionally pushed later by some minutes (how an estimated departure is derived
 * from a scheduled one plus a delay).
 */
export function atTime(isoDate: string, time: string, plusMinutes = 0): string {
  const instant = new Date(`${isoDate}T${time}:00Z`);
  instant.setUTCMinutes(instant.getUTCMinutes() + plusMinutes);
  return instant.toISOString();
}
