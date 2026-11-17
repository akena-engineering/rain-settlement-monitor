import type { Address, Hex } from "viem"
import { describe, expect, it } from "vitest"
import type { LiquidationRecord, StatementRecord } from "../chain/decode"
import { percentile, settle } from "./settlement"

const A = "0x00000000000000000000000000000000000000aa" as Address
const B = "0x00000000000000000000000000000000000000bb" as Address
const K1 = "0x01" as Hex
const K2 = "0x02" as Hex

const stmt = (
  key: Hex,
  cents: number,
  publishTs: number,
  coordinator = A,
): StatementRecord => ({
  key,
  coordinator,
  cents,
  publishBlock: 1,
  publishTs,
  liquidatableAfter: publishTs,
})

const liq = (
  key: Hex,
  netCents: number,
  ts: number,
  coordinator = A,
  block = ts,
): LiquidationRecord => ({ key, coordinator, netCents, block, ts, assets: [] })

describe("settle", () => {
  it("empty-collateral retries do not complete payment", () => {
    const r = settle(
      [stmt(K1, 5000, 1000)],
      // out of order on purpose
      [liq(K1, 5000, 1090), liq(K1, 0, 1030), liq(K1, 0, 1060)],
      2000,
    )
    expect(r.paid).toEqual([{ key: K1, coordinator: A, latencySec: 90 }])
    expect(r.pending).toEqual([])
  })

  it("partial payment stays pending with the remainder", () => {
    const r = settle([stmt(K1, 5000, 1000)], [liq(K1, 3000, 1040)], 2000)
    expect(r.paid).toEqual([])
    expect(r.pending).toEqual([
      { key: K1, coordinator: A, ageSec: 1000, remainingCents: 2000 },
    ])
  })

  it("ignores liquidations of statements outside the window", () => {
    const r = settle([], [liq(K2, 5000, 1040)], 2000)
    expect(r).toEqual({ paid: [], pending: [] })
  })

  it("unliquidated statement at index end is pending with its age", () => {
    const r = settle([stmt(K1, 5000, 1500)], [], 2000)
    expect(r.pending).toEqual([
      { key: K1, coordinator: A, ageSec: 500, remainingCents: 5000 },
    ])
  })

  it("ignores liquidations after indexEnd", () => {
    const r = settle([stmt(K1, 5000, 1000)], [liq(K1, 5000, 2001)], 2000)
    expect(r.paid).toEqual([])
    expect(r.pending[0]?.remainingCents).toBe(5000)
  })

  it("same key on different coordinators does not cross-join", () => {
    const r = settle(
      [stmt(K1, 5000, 1000, A), stmt(K1, 7000, 1000, B)],
      [liq(K1, 7000, 1050, B)],
      2000,
    )
    expect(r.paid).toEqual([{ key: K1, coordinator: B, latencySec: 50 }])
    expect(r.pending).toEqual([
      { key: K1, coordinator: A, ageSec: 1000, remainingCents: 5000 },
    ])
  })

  it("zero-cent statement: paid at first liquidation, else pending with 0", () => {
    const r = settle(
      [stmt(K1, 0, 1000), stmt(K2, 0, 1000)],
      [liq(K1, 0, 1010)],
      2000,
    )
    expect(r.paid).toEqual([{ key: K1, coordinator: A, latencySec: 10 }])
    expect(r.pending).toEqual([
      { key: K2, coordinator: A, ageSec: 1000, remainingCents: 0 },
    ])
  })
})

describe("percentile", () => {
  it("nearest rank", () => {
    const v = [120, 41, 45, 42, 41]
    expect(percentile(v, 50)).toBe(42)
    expect(percentile(v, 100)).toBe(120)
    expect(percentile(v, 0)).toBe(41)
  })
  it("null for empty", () => {
    expect(percentile([], 50)).toBeNull()
  })
})
