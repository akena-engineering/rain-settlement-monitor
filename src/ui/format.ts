// Display formatting. Every value is UTC; amounts are integer cents.
const count = new Intl.NumberFormat("en-US")

export const fmtCount = (n: number) => count.format(n)

export function fmtDuration(sec: number): string {
  if (sec < 90) return `${Math.round(sec)} s`
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`
  return `${(sec / 3600).toFixed(1)} h`
}

export function fmtAge(sec: number): string {
  if (sec < 3600) return `${Math.round(sec / 60)} min`
  if (sec < 48 * 3600) return `${Math.round(sec / 3600)} h`
  return `${(sec / 86400).toFixed(1)} days`
}

export function fmtUsd(cents: number): string {
  const usd = cents / 100
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`
  if (usd >= 1e4) return `$${Math.round(usd / 1e3)}k`
  return `$${usd.toFixed(2)}`
}

/** Index (100 = baseline) as "61%", or as a delta "−39%" vs baseline. */
export function fmtPct(index: number | null, delta = false): string {
  if (index === null) return "—"
  if (!delta) return `${Math.round(index)}%`
  const d = Math.round(index - 100)
  return `${d < 0 ? "−" : "+"}${Math.abs(d)}%`
}

export const fmtHM = (ts: number) =>
  new Date(ts * 1000).toISOString().slice(11, 16)

/** "6 Nov" */
export const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })

/** "12 Nov 09:14 UTC" */
export const fmtStamp = (ts: number) =>
  `${fmtDay(new Date(ts * 1000).toISOString().slice(0, 10))} ${fmtHM(ts)} UTC`

/** "41–63 s" for a spread of values, "42 s" when they agree, "—" if none. */
export function fmtRange(values: number[], f: (n: number) => string): string {
  if (values.length === 0) return "—"
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return lo === hi ? f(lo) : `${f(lo).replace(/ \w+$/, "")}–${f(hi)}`
}
