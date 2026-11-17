import { ALL, type BatchSummary } from "../data/snapshot"
import { addDays, secOfDay } from "./day"
import {
  BASELINE_MAX_AGE_DAYS,
  BASELINE_WINDOW,
  isShort,
  MIN_BASELINE_BATCHES,
} from "./thresholds"

type Index = { index: number | null; baseline: number | null; count: number }

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const hi = sorted[mid] as number
  return sorted.length % 2 ? hi : ((sorted[mid - 1] as number) + hi) / 2
}

/** First day of the calendar window that may feed `day`'s baseline. */
const windowStart = (day: string) => addDays(day, -BASELINE_MAX_AGE_DAYS)

function indexFor(history: BatchSummary[], count: number): Index {
  const baseline =
    history.length >= MIN_BASELINE_BATCHES
      ? median(history.map((row) => row.primary.count))
      : null
  return {
    baseline,
    count,
    index:
      baseline === null || baseline === 0
        ? null
        : Math.round((100 * count) / baseline),
  }
}

function baselineWindow(
  batches: BatchSummary[],
  group: string,
  day: string,
): BatchSummary[] {
  const rows = batches
    .filter(
      (row) =>
        row.group === group && row.day < day && row.day >= windowStart(day),
    )
    .sort((a, b) => a.day.localeCompare(b.day))
  const history: BatchSummary[] = []
  const shortDays = new Set<string>()
  for (const row of rows) {
    if (isShort(indexFor(history, row.primary.count).index))
      shortDays.add(row.day)
    if (!shortDays.has(row.day)) {
      history.push(row)
      if (history.length > BASELINE_WINDOW) history.shift()
    }
  }
  return history
}

function groupIndex(
  batches: BatchSummary[],
  group: string,
  day: string,
): Index {
  const count =
    batches.find((row) => row.group === group && row.day === day)?.primary
      .count ?? 0
  return indexFor(baselineWindow(batches, group, day), count)
}

export function completenessIndex(
  batches: BatchSummary[],
  day: string,
): (Index & { group: string })[] {
  const groups = [
    ...new Set(
      batches
        .filter(
          (row) =>
            row.day <= day && row.day >= windowStart(day) && row.group !== ALL,
        )
        .map((row) => row.group),
    ),
  ].sort()
  return groups.map((group) => ({ group, ...groupIndex(batches, group, day) }))
}

export function aggregateIndex(batches: BatchSummary[], day: string): Index {
  return groupIndex(batches, ALL, day)
}

export function baselineStart(
  batches: BatchSummary[],
  group: string,
  day: string,
): number | null {
  const history = baselineWindow(batches, group, day)
  if (history.length < MIN_BASELINE_BATCHES) return null
  return Math.max(...history.map((row) => secOfDay(row.primary.start)))
}
