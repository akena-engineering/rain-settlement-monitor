import type { Chain } from "../chain/coordinators"
import { ALL, type ChainSnapshot } from "../data/snapshot"
import {
  aggregateIndex,
  baselineStart,
  completenessIndex,
  median,
} from "./baseline"
import { dayStart } from "./day"
import {
  BASELINE_WINDOW,
  BATCH_GAP_MIN,
  isShort,
  LATE_BATCH_GRACE_MIN,
  P95_MULTIPLIER,
  SLOW_LIQUIDATION_SEC,
  SYSTEMIC_TENANT_SHARE,
} from "./thresholds"

export type AlertRule =
  | "systemic-short-batch"
  | "late-batch"
  | "slow-liquidation"
  | "latency-p95"
export type Alert = {
  rule: AlertRule
  chain: Chain
  day: string
  firedAt: number
  detail: string
  groupsAffected: number
  groupsActive: number
  open?: { count: number; oldestAgeSec: number } // evaluateOpen only
}

export function evaluate(snapshot: ChainSnapshot, day: string): Alert[] {
  const alerts: Alert[] = []
  const groups = completenessIndex(snapshot.batches, day)
  const established = groups.filter((group) => group.index !== null)
  const short = established.filter((group) => isShort(group.index))
  const batches = snapshot.batches.filter((row) => row.day === day)
  const aggregate = batches.find((row) => row.group === ALL)
  // A live monitor knows a batch is over only after BATCH_GAP_MIN of silence,
  // so batch-level rules fire then, never at the last statement (hindsight).
  const closedAt = (end: number) => end + BATCH_GAP_MIN * 60
  const add = (
    rule: AlertRule,
    firedAt: number,
    detail: string,
    groupsAffected = 0,
    groupsActive = 0,
  ) => {
    alerts.push({
      rule,
      chain: snapshot.chain,
      day,
      firedAt,
      detail,
      groupsAffected,
      groupsActive,
    })
  }
  if (
    established.length > 0 &&
    short.length / established.length >= SYSTEMIC_TENANT_SHARE &&
    batches.length > 0
  ) {
    const index = aggregateIndex(snapshot.batches, day).index
    add(
      "systemic-short-batch",
      closedAt(Math.max(...batches.map((row) => row.primary.end))),
      `Batch short${index === null ? "" : ` · ${index}% of baseline`} · ${short.length}/${established.length} groups`,
      short.length,
      established.length,
    )
  }
  const start = baselineStart(snapshot.batches, ALL, day)
  if (start !== null) {
    const deadline = dayStart(day) + start + LATE_BATCH_GRACE_MIN * 60
    const observed = aggregate?.primary.start ?? snapshot.indexedThrough.ts
    if (observed > deadline)
      add(
        "late-batch",
        deadline,
        "Batch late · observed beyond the baseline grace period",
      )
  }
  const slow = snapshot.latency.some(
    (row) =>
      row.day === day && row.group === ALL && row.max > SLOW_LIQUIDATION_SEC,
  )
  if (slow && aggregate) {
    add(
      "slow-liquidation",
      aggregate.primary.end + SLOW_LIQUIDATION_SEC,
      "Liquidation over 1 h after publication · observed",
    )
  }
  const latency = snapshot.latency.find(
    (row) => row.day === day && row.group === ALL,
  )
  const previous = snapshot.latency
    .filter((row) => row.group === ALL && row.day < day)
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-BASELINE_WINDOW)
  const usual = median(previous.map((row) => row.p95))
  if (
    latency &&
    aggregate &&
    usual !== null &&
    latency.p95 > P95_MULTIPLIER * usual
  ) {
    add(
      "latency-p95",
      closedAt(aggregate.primary.end),
      "Liquidation p95 above baseline · observed",
    )
  }
  return alerts
}

/** Statements still awaiting liquidation at the index end beyond SLOW_LIQUIDATION_SEC. */
export function evaluateOpen(snapshot: ChainSnapshot): Alert | null {
  const open = snapshot.pending.filter(
    (row) => row.ageSec > SLOW_LIQUIDATION_SEC,
  )
  const day = snapshot.days.at(-1)
  if (open.length === 0 || day === undefined) return null
  const count = open.length
  const oldestAgeSec = Math.max(...open.map((row) => row.ageSec))
  return {
    rule: "slow-liquidation",
    chain: snapshot.chain,
    day,
    firedAt: snapshot.indexedThrough.ts,
    detail: `Awaiting liquidation · ${count} ${count === 1 ? "statement" : "statements"}, oldest open ${(oldestAgeSec / 86_400).toFixed(1)} days`,
    groupsAffected: count,
    groupsActive: 0,
    open: { count, oldestAgeSec },
  }
}
