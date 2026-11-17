import { describe, expect, it } from "vitest"
import { assertNoIdentifiers } from "./snapshot"

const COORD = "0x8853fb72d93efc186d8bb806195cbe4563261bc9"
const allowed = new Set([COORD])

describe("assertNoIdentifiers", () => {
  it("accepts counts and Coordinator addresses from meta.groups", () => {
    const json = JSON.stringify({
      groups: [{ group: "A", address: COORD }],
      n: 5,
    })
    expect(() => assertNoIdentifiers(json, allowed)).not.toThrow()
  })

  it("rejects a 32-byte hash (tx or statement key)", () => {
    const json = JSON.stringify({ key: `0x${"ab".repeat(32)}` })
    expect(() => assertNoIdentifiers(json, allowed)).toThrow(/32-byte/)
  })

  it("rejects an address outside meta.groups, in any case", () => {
    const proxy = "0x00000000000000000000000000000000000000AA"
    expect(() =>
      assertNoIdentifiers(JSON.stringify({ proxy }), allowed),
    ).toThrow(/non-Coordinator/)
    expect(() =>
      assertNoIdentifiers(
        JSON.stringify({ c: COORD.toUpperCase().replace("0X", "0x") }),
        allowed,
      ),
    ).not.toThrow()
  })
})
