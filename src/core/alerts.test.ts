import { describe, expect, it } from "vitest"
import type { BatchSummary, ChainSnapshot, Latency } from "../data/snapshot"
import { evaluate, evaluateOpen } from "./alerts"

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`
const midnight = (n: number) => Date.parse(`${day(n)}T00:00:00Z`) / 1000
const row = (
  n: number,
  group: string,
  count = 2250,
  minutes = 800,
): BatchSummary => ({
  day: day(n),
  group,
  primary: {
    start: midnight(n) + minutes * 60,
    end: midnight(n) + minutes * 60 + 60,
    count,
    cents: 0,
  },
  secondary: [],
})
const history = (group: string) =>
  Array.from({ length: 14 }, (_, i) =>
    row(i + 1, group, 2250, i === 13 ? 820 : 800),
  )
const snapshot = (batches: BatchSummary[]): ChainSnapshot => ({
  chain: "arbitrum",
  indexedThrough: { block: 1, ts: midnight(15) + 900 * 60 },
  days: [day(14), day(15)],
  batches,
  latency: [],
  pending: [],
  buckets: [],
  outliers: [],
})
const latency = (n: number, p95: number, max = p95): Latency => ({
  day: day(n),
  group: "*",
  n: 100,
  p50: 60,
  p95,
  p99: max,
  max,
  bins: Array.from({ length: 11 }, () => 0),
})
const systemic = (short: number) =>
  snapshot([
    ..."ABCDEFGH"
      .split("")
      .flatMap((g, i) => [...history(g), row(15, g, i < short ? 1000 : 2250)]),
    ...history("*"),
    row(15, "*", 1400),
    row(13, "I"),
    row(14, "I"),
    row(15, "I", 1),
  ])

describe("alerts", () => {
  it("fires once for seven of eight established groups once the batch closes", () => {
    const alerts = evaluate(systemic(7), day(15)).filter(
      (a) => a.rule === "systemic-short-batch",
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      firedAt: midnight(15) + 800 * 60 + 60 + 45 * 60,
      groupsAffected: 7,
      groupsActive: 8,
      chain: "arbitrum",
    })
    expect(alerts[0]?.detail).toBe("Batch short · 62% of baseline · 7/8 groups")
  })
  it("does not fire for two of eight short groups or a group at 70%", () => {
    expect(
      evaluate(systemic(2), day(15)).some(
        (a) => a.rule === "systemic-short-batch",
      ),
    ).toBe(false)
    const s = systemic(6)
    const batch = s.batches.find((b) => b.day === day(15) && b.group === "G")
    if (batch) batch.primary.count = 1575
    expect(
      evaluate(s, day(15)).find((a) => a.rule === "systemic-short-batch")
        ?.groupsAffected,
    ).toBe(6)
  })
  it("counts missing established groups as short", () => {
    const s = systemic(7)
    s.batches = s.batches.filter((b) => !(b.day === day(15) && b.group === "A"))
    expect(
      evaluate(s, day(15)).find((a) => a.rule === "systemic-short-batch")
        ?.groupsAffected,
    ).toBe(7)
  })
  it("fires late at latest baseline start plus thirty minutes", () => {
    const alerts = evaluate(
      snapshot([...history("*"), row(15, "*", 2250, 870)]),
      day(15),
    )
    expect(alerts.find((a) => a.rule === "late-batch")?.firedAt).toBe(
      midnight(15) + 850 * 60,
    )
    expect(
      evaluate(snapshot([...history("*"), row(15, "*", 2250, 830)]), day(15)),
    ).toEqual([])
  })
  it("requires strict passage of the deadline for missing batches and baseline history", () => {
    const s = snapshot(history("*"))
    s.indexedThrough.ts = midnight(15) + 850 * 60
    expect(evaluate(s, day(15))).toEqual([])
    s.indexedThrough.ts++
    expect(evaluate(s, day(15)).map((a) => a.rule)).toEqual(["late-batch"])
    expect(evaluate(snapshot([]), day(15))).toEqual([])
  })
  it("observes slow liquidation once per day with historical timing", () => {
    const s = snapshot([row(14, "*")])
    s.latency = [latency(14, 100, 3601)]
    s.pending = [{ group: "A", day: day(14), ageSec: 4000, cents: 100 }]
    expect(evaluate(s, day(14))).toMatchObject([
      {
        rule: "slow-liquidation",
        firedAt: midnight(14) + 800 * 60 + 60 + 3600,
      },
    ])
    expect(evaluate(s, day(15))).toEqual([])
  })
  it("reports statements awaiting liquidation beyond the threshold at the index end", () => {
    const s = snapshot([])
    s.pending = [{ group: "A", day: day(15), ageSec: 3600, cents: 100 }]
    expect(evaluateOpen(s)).toBeNull()
    s.pending.push(
      { group: "A", day: day(14), ageSec: 2 * 86_400, cents: 100 },
      { group: "B", day: day(15), ageSec: 3601, cents: 5 },
    )
    expect(evaluateOpen(s)).toEqual({
      rule: "slow-liquidation",
      chain: "arbitrum",
      day: day(15),
      firedAt: s.indexedThrough.ts,
      detail: "Awaiting liquidation · 2 statements, oldest open 2.0 days",
      groupsAffected: 2,
      groupsActive: 0,
      open: { count: 2, oldestAgeSec: 2 * 86_400 },
    })
  })
  it("compares p95 to the median of the last fourteen observed days strictly", () => {
    const s = snapshot([row(15, "*")])
    s.latency = [
      ...Array.from({ length: 14 }, (_, i) => latency(i + 1, 100)),
      latency(15, 301),
    ].reverse()
    expect(evaluate(s, day(15))).toMatchObject([
      { rule: "latency-p95", firedAt: midnight(15) + 800 * 60 + 60 + 45 * 60 },
    ])
    s.latency = [latency(14, 100), latency(15, 300)]
    expect(evaluate(s, day(15))).toEqual([])
  })
})
