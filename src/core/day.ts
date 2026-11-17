// UTC day helpers shared by the scripts (snapshot producer) and the app.
// Timestamps are unix seconds; days are "YYYY-MM-DD" in UTC.

export const dayOf = (ts: number) =>
  new Date(ts * 1000).toISOString().slice(0, 10)

/** Unix seconds of the day's UTC midnight. */
export const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000

export const addDays = (day: string, n: number) =>
  dayOf(dayStart(day) + n * 86_400)

/** Seconds since that day's UTC midnight. */
export const secOfDay = (ts: number) => ts - dayStart(dayOf(ts))
