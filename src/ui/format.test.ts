import { describe, expect, it } from "vitest"
import {
  fmtAge,
  fmtCount,
  fmtDuration,
  fmtHM,
  fmtPct,
  fmtRange,
  fmtStamp,
  fmtUsd,
} from "./format"

describe("format", () => {
  it("durations: seconds, minutes, hours", () => {
    expect(fmtDuration(42)).toBe("42 s")
    expect(fmtDuration(59.6)).toBe("60 s")
    expect(fmtDuration(125)).toBe("2.1 min")
    expect(fmtDuration(3600 * 23.4)).toBe("23.4 h")
  })
  it("pending age in hours or days", () => {
    expect(fmtAge(1800)).toBe("30 min")
    expect(fmtAge(5 * 3600)).toBe("5 h")
    expect(fmtAge(2_563_725)).toBe("29.7 days")
  })
  it("cents as USD", () => {
    expect(fmtUsd(1)).toBe("$0.01")
    expect(fmtUsd(12_070)).toBe("$120.70")
    expect(fmtUsd(107_243_000)).toBe("$1.07M")
    expect(fmtUsd(12_004_000)).toBe("$120k")
  })
  it("percentages and deltas", () => {
    expect(fmtPct(61)).toBe("61%")
    expect(fmtPct(61, true)).toBe("−39%")
    expect(fmtPct(115, true)).toBe("+15%")
    expect(fmtPct(null)).toBe("—")
  })
  it("ranges and stamps", () => {
    expect(fmtRange([41, 63], fmtDuration)).toBe("41–63 s")
    expect(fmtRange([42, 42], fmtDuration)).toBe("42 s")
    expect(fmtRange([], fmtDuration)).toBe("—")
    expect(fmtStamp(Date.parse("2026-11-12T09:14:00Z") / 1000)).toBe(
      "12 Nov 09:14 UTC",
    )
  })
  it("counts with thousands separators and UTC clock", () => {
    expect(fmtCount(1696)).toBe("1,696")
    expect(fmtHM(Date.parse("2026-11-06T14:16:30Z") / 1000)).toBe("14:16")
  })
})
