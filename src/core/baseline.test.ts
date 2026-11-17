import { describe, expect, it } from "vitest"
import type { BatchSummary } from "../data/snapshot"
import {
  aggregateIndex,
  baselineStart,
  completenessIndex,
  median,
} from "./baseline"

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`
const row = (
  n: number,
  count: number,
  group = "A",
  minutes = 800,
): BatchSummary => ({
  day: day(n),
  group,
  primary: {
    start: Date.parse(`${day(n)}T00:00:00Z`) / 1000 + minutes * 60,
    end: Date.parse(`${day(n)}T00:00:00Z`) / 1000 + minutes * 60 + 60,
    count,
    cents: 0,
  },
  secondary: [],
})

describe("baselines", () => {
  it("compares 1,526 with fourteen varying normal batches", () => {
    const batches = Array.from({ length: 14 }, (_, i) =>
      row(i + 1, 2200 + (i % 3) * 50),
    )
    const result = completenessIndex([...batches, row(15, 1526)], day(15))[0]
    expect(result?.index).toBeGreaterThanOrEqual(67)
    expect(result?.index).toBeLessThanOrEqual(69)
  })
  it("keeps new groups null and ignores future-only groups", () => {
    expect(
      completenessIndex(
        [
          row(1, 2250),
          row(2, 2250),
          row(3, 2250),
          row(4, 900),
          row(5, 100, "B"),
        ],
        day(4),
      ),
    ).toEqual([{ group: "A", index: null, baseline: null, count: 900 }])
  })
  it("excludes chronologically short days and uses the same window for starts", () => {
    const normal = Array.from({ length: 14 }, (_, i) =>
      row(i + 1, 2200 + i * 5),
    )
    const batches = [
      ...normal,
      row(15, 900, "A", 1000),
      row(16, 2250),
    ].reverse()
    expect(completenessIndex(batches, day(16))[0]?.baseline).toBe(
      median(normal.map((r) => r.primary.count)),
    )
    expect(baselineStart(batches, "A", day(16))).toBe(800 * 60)
  })
  it("uses the latest fourteen eligible batches and counts absence as zero", () => {
    const batches = Array.from({ length: 20 }, (_, i) =>
      row(i + 1, 2000 + i * 100, "*"),
    )
    expect(aggregateIndex(batches, day(21))).toEqual({
      index: 0,
      baseline: 3250,
      count: 0,
    })
    expect(completenessIndex(batches, day(21))).toEqual([])
  })
  it("computes conventional medians and handles empty history", () => {
    expect(median([])).toBeNull()
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([9, 1, 3])).toBe(3)
    expect(baselineStart([], "*", day(1))).toBeNull()
  })

  it("ignores history older than the calendar window (index gaps, dead groups)", () => {
    // 14 July-like batches, then nothing for 60+ days: not a baseline.
    const july = Array.from({ length: 14 }, (_, i) => ({
      ...row(1, 2250),
      day: `2026-07-${String(i + 10).padStart(2, "0")}`,
    }))
    expect(completenessIndex([...july, row(1, 1500)], day(1))).toEqual([
      { group: "A", index: null, baseline: null, count: 1500 },
    ])
    // A group that stopped batching drops out instead of staying "short".
    expect(completenessIndex(july, day(1))).toEqual([])
  })
})
