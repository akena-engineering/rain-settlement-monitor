import { dayOf } from "./day"

export type Batch = { start: number; end: number; count: number }

/** Groups publish timestamps (unix s); a gap > gapMin minutes starts a new batch. */
export function clusterBatches(publishTs: number[], gapMin: number): Batch[] {
  const batches: Batch[] = []
  for (const ts of [...publishTs].sort((a, b) => a - b)) {
    const last = batches.at(-1)
    if (last && ts - last.end <= gapMin * 60) {
      last.end = ts
      last.count++
    } else {
      batches.push({ start: ts, end: ts, count: 1 })
    }
  }
  return batches
}

/** Among batches starting on `day` (UTC "YYYY-MM-DD"), the largest is primary (tie → earlier). */
export function splitPrimary(
  batches: Batch[],
  day: string,
): { primary: Batch | null; secondary: Batch[] } {
  const onDay = batches
    .filter((b) => dayOf(b.start) === day)
    .sort((a, b) => a.start - b.start)
  const primary = onDay.reduce<Batch | null>(
    (best, b) => (!best || b.count > best.count ? b : best),
    null,
  )
  return { primary, secondary: onDay.filter((b) => b !== primary) }
}
