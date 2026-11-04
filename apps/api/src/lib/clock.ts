// ADR-005: the clock is injectable so tests can move time forward deterministically.

let offsetMs = 0;

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

/** Test helper: advance the application clock. */
export function advanceClock(ms: number): void {
  offsetMs += ms;
}

export function resetClock(): void {
  offsetMs = 0;
}

export const HOUR = 3_600_000;

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * HOUR);
}
