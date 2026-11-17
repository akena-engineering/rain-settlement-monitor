import type { Address, Hex } from "viem"
import type { LiquidationRecord, StatementRecord } from "../chain/decode"

type Paid = { key: Hex; coordinator: Address; latencySec: number }
type Pending = {
  key: Hex
  coordinator: Address
  ageSec: number
  remainingCents: number
}

const joinKey = (r: { key: Hex; coordinator: Address }) =>
  `${r.coordinator.toLowerCase()}:${r.key.toLowerCase()}`

/**
 * Joins statements to their liquidations (same key AND coordinator) as of indexEnd.
 * A statement is paid once the running Σ netCents reaches its cents; latency is
 * measured to the liquidation that completes payment. Liquidations for statements
 * outside `statements` or after indexEnd are ignored.
 */
export function settle(
  statements: StatementRecord[],
  liquidations: LiquidationRecord[],
  indexEnd: number,
): { paid: Paid[]; pending: Pending[] } {
  const byStatement = new Map<string, LiquidationRecord[]>()
  for (const l of liquidations) {
    if (l.ts > indexEnd) continue
    const k = joinKey(l)
    const list = byStatement.get(k)
    if (list) list.push(l)
    else byStatement.set(k, [l])
  }

  const paid: Paid[] = []
  const pending: Pending[] = []
  for (const s of statements) {
    const liqs = (byStatement.get(joinKey(s)) ?? []).sort(
      (a, b) => a.ts - b.ts || a.block - b.block,
    )
    // A 0-cent statement is paid at its first liquidation (Σ 0 ≥ 0); with no
    // liquidation it stays pending with 0 remaining rather than silently "paid".
    let net = 0
    const completing = liqs.find((l) => {
      net += l.netCents
      return net >= s.cents
    })
    if (completing) {
      paid.push({
        key: s.key,
        coordinator: s.coordinator,
        latencySec: completing.ts - s.publishTs,
      })
    } else {
      pending.push({
        key: s.key,
        coordinator: s.coordinator,
        ageSec: indexEnd - s.publishTs,
        remainingCents: s.cents - net,
      })
    }
  }
  return { paid, pending }
}

/** Nearest-rank percentile (rank = ceil(p/100 × n)); null for empty input. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[Math.min(rank, sorted.length) - 1] ?? null
}
