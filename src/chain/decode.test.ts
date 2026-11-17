import { keccak256, toEventSelector, toHex } from "viem"
import { describe, expect, it } from "vitest"
import {
  coordinatorEvents,
  statementPublishedV1,
  statementPublishedV2,
  TOPICS,
} from "./abi"
import { COORDINATORS } from "./coordinators"
import { decodeLog, type RawLog } from "./decode"
import fixtures from "./fixtures/logs.json"

// Real logs captured from Arbitrum and Polygon, with statementId, teamId,
// the collateral proxy, block numbers and tx hashes replaced by placeholders
// (ABI layout intact).
const fx = fixtures as Record<keyof typeof fixtures, RawLog>
const known = new Set(
  Object.values(COORDINATORS).flatMap((cs) => cs.map((c) => c.address)),
)
const TS = 1_790_000_000

describe("topics", () => {
  // topic0 values as captured from chain.
  it("match the ABI signatures", () => {
    const [liq, wd] = coordinatorEvents
    expect(toEventSelector(statementPublishedV1[0])).toBe(
      TOPICS.statementPublishedV1,
    )
    expect(toEventSelector(statementPublishedV2[0])).toBe(
      TOPICS.statementPublishedV2,
    )
    expect(liq && toEventSelector(liq)).toBe(TOPICS.liquidation)
    expect(wd && toEventSelector(wd)).toBe(TOPICS.withdrawal)
  })
})

describe("decodeLog", () => {
  it("decodes old and 2.04 StatementPublished into the same record shape", () => {
    const v1 = decodeLog(fx.statementV1, TS, known)
    const v2 = decodeLog(fx.statementV2, TS, known)
    expect(v1).toEqual({
      kind: "statement",
      record: {
        key: keccak256(toHex("statement-1".padEnd(36, "x"))),
        coordinator: "0x8853fb72d93efc186d8bb806195cbe4563261bc9",
        cents: 1207,
        publishBlock: 256,
        publishTs: TS,
        liquidatableAfter: 1793108674,
      },
    })
    expect(v2?.kind).toBe("statement")
    expect(Object.keys(v2?.record ?? {}).sort()).toEqual(
      Object.keys(v1?.record ?? {}).sort(),
    )
    expect(v2?.record).toMatchObject({
      coordinator: "0xd59245a0cbdbc84b21a4586e57352167a9e6c778",
      publishBlock: 286,
    })
  })

  it("decodes a two-asset liquidation with its net cents", () => {
    const l = decodeLog(fx.liquidationTwoAssets, TS, known)
    expect(l).toMatchObject({
      kind: "liquidation",
      record: {
        coordinator: "0x8853fb72d93efc186d8bb806195cbe4563261bc9",
        netCents: 2610,
        block: 733,
        ts: TS,
        assets: [
          "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
          "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        ],
      },
    })
    // Join key: Liquidation.topic3 == StatementPublished.topic1
    expect(l?.record).toHaveProperty("key", fx.liquidationTwoAssets.topics[3])
  })

  it("keeps an empty-collateral retry with netCents 0", () => {
    const l = decodeLog(fx.liquidationEmptyRetry, TS, known)
    expect(l?.kind).toBe("liquidation")
    expect(l?.record).toHaveProperty("netCents", 0)
  })

  it("rejects a Withdrawal-signature log from a non-Coordinator", () => {
    expect(fx.foreignWithdrawal.topics[0]).toBe(TOPICS.withdrawal)
    expect(decodeLog(fx.foreignWithdrawal, TS, known)).toBeNull()
  })
})
