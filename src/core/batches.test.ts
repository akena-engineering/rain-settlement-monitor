import { describe, expect, it } from "vitest"
import { clusterBatches, splitPrimary } from "./batches"

const at = (iso: string) => Date.parse(iso) / 1000

describe("clusterBatches / splitPrimary", () => {
  // 13:21 to 14:13 every 4 minutes (14 statements), then 10 at 16:10, then a small batch next day
  const primaryTs = Array.from(
    { length: 14 },
    (_, i) => at("2026-03-10T13:21:00Z") + i * 4 * 60,
  )
  const late = Array.from(
    { length: 10 },
    (_, i) => at("2026-03-10T16:10:00Z") + i,
  )
  const nextDay = [at("2026-03-11T13:20:00Z"), at("2026-03-11T13:21:00Z")]
  const all = [...nextDay, ...late, ...primaryTs].reverse()

  it("splits the daily job from a late secondary batch", () => {
    const batches = clusterBatches(all, 45)
    expect(batches).toHaveLength(3)
    const { primary, secondary } = splitPrimary(batches, "2026-03-10")
    expect(primary).toEqual({
      start: at("2026-03-10T13:21:00Z"),
      end: at("2026-03-10T14:13:00Z"),
      count: 14,
    })
    expect(secondary).toEqual([
      {
        start: at("2026-03-10T16:10:00Z"),
        end: at("2026-03-10T16:10:09Z"),
        count: 10,
      },
    ])
  })

  it("does not attribute a next-day batch to this day", () => {
    const { primary, secondary } = splitPrimary(
      clusterBatches(all, 45),
      "2026-03-11",
    )
    expect(primary?.count).toBe(2)
    expect(secondary).toEqual([])
  })

  it("gap equal to gapMin stays in the same batch", () => {
    expect(clusterBatches([0, 45 * 60], 45)).toHaveLength(1)
    expect(clusterBatches([0, 45 * 60 + 1], 45)).toHaveLength(2)
  })

  it("empty input → no batches, no primary", () => {
    expect(clusterBatches([], 45)).toEqual([])
    expect(splitPrimary([], "2026-03-10")).toEqual({
      primary: null,
      secondary: [],
    })
  })
})
