// View model: everything the UI shows, derived once from the snapshots.
// Components read from here; they do not re-derive domain facts.
import type { Chain } from "../chain/coordinators"
import { type Alert, evaluate, evaluateOpen } from "../core/alerts"
import { aggregateIndex, completenessIndex } from "../core/baseline"
import {
  BATCH_GAP_MIN,
  isShort,
  WARNING_INDEX,
  WARNING_SHORT_GROUPS,
} from "../core/thresholds"
import {
  ALL,
  CHAINS,
  type ChainSnapshot,
  ChainSnapshotSchema,
  type Meta,
  MetaSchema,
} from "../data/snapshot"
import { fmtCount, fmtHM } from "./format"

export { ALL }
export type Scope = Chain | "all"

export type IndexRow = {
  index: number | null
  baseline: number | null
  count: number
}

export type DayView = {
  day: string
  inProgress: boolean // today, batch not finished at index end
  agg: IndexRow & { start: number | null; end: number | null; cents: number }
  groups: (IndexRow & { group: string })[]
  byGroup: Map<string, IndexRow>
}

export type ChainView = {
  chain: Chain
  snap: ChainSnapshot
  days: DayView[]
  byDay: Map<string, DayView>
  alerts: Alert[] // per closed day, plus the open-at-index-end alert if any
}

export type Model = {
  meta: Meta
  chains: ChainView[]
  openDays: Set<string> // days whose batch is still running at index end
}

export const CHAIN_LABEL: Record<Chain, string> = {
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  avalanche: "Avalanche",
}

/** Earliest usual start of the daily batch (observed, all chains). */
export const USUAL_START = "13:20 UTC"

function chainView(snap: ChainSnapshot): ChainView {
  const lastDay = snap.days.at(-1)
  const days = snap.days.map((day): DayView => {
    const p = snap.batches.find((b) => b.day === day && b.group === ALL)
    const groups = completenessIndex(snap.batches, day)
    return {
      day,
      inProgress:
        day === lastDay &&
        (!p || snap.indexedThrough.ts - p.primary.end < BATCH_GAP_MIN * 60),
      agg: {
        ...aggregateIndex(snap.batches, day),
        start: p?.primary.start ?? null,
        end: p?.primary.end ?? null,
        cents: p?.primary.cents ?? 0,
      },
      groups,
      byGroup: new Map(groups.map((g) => [g.group, g])),
    }
  })
  // A batch still running is not evaluated: it would read as "short".
  const alerts = days
    .filter((d) => !d.inProgress)
    .flatMap((d) => evaluate(snap, d.day))
  const open = evaluateOpen(snap)
  if (open) alerts.push(open)
  return {
    chain: snap.chain,
    snap,
    days,
    byDay: new Map(days.map((d) => [d.day, d])),
    alerts,
  }
}

export async function loadModel(): Promise<Model> {
  const get = async (path: string) => {
    const res = await fetch(path)
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    return res.json()
  }
  // Fetch meta and every chain in parallel; a chain not indexed yet is a 404.
  const [meta, ...raw] = await Promise.all([
    get("/data/meta.json").then((j) => MetaSchema.parse(j)),
    ...CHAINS.map((c) => get(`/data/${c}.json`).catch(() => null)),
  ])
  const chains = raw
    .filter((j) => j !== null)
    .map((j) => chainView(ChainSnapshotSchema.parse(j)))
    .filter((c) => meta.coverage.indexed.includes(c.chain))
  const openDays = new Set(
    chains.flatMap((c) => c.days.filter((d) => d.inProgress).map((d) => d.day)),
  )
  return { meta, chains, openDays }
}

export const inScope = (m: Model, scope: Scope) =>
  m.chains.filter((c) => scope === "all" || c.chain === scope)

/** The oldest chain head: what the page as a whole is indexed through. */
export const indexedThrough = (chains: ChainView[]) =>
  Math.min(...chains.map((c) => c.snap.indexedThrough.ts))

/** Chains with Rain Coordinators found onchain, indexed or not. */
export const totalChains = (meta: Meta) =>
  meta.coverage.indexed.length + meta.coverage.notYet.length

const NO_ROW: IndexRow = { index: null, baseline: null, count: 0 }

/** Count/baseline/index for one chain-day, for the whole chain or a group. */
export function rowFor(d: DayView | undefined, group: string): IndexRow {
  if (!d) return NO_ROW
  return group === ALL ? d.agg : (d.byGroup.get(group) ?? NO_ROW)
}

/** Combined index across chains: Σ counts / Σ baselines (established only). */
export function combinedRow(
  chains: ChainView[],
  day: string,
  group: string,
): IndexRow {
  let count = 0
  let baseline = 0
  for (const c of chains) {
    const r = rowFor(c.byDay.get(day), group)
    count += r.count
    if (r.baseline !== null) baseline += r.baseline
  }
  return {
    count,
    baseline: baseline || null,
    index: baseline ? Math.round((100 * count) / baseline) : null,
  }
}

/** All days present on any chain in scope, ascending. */
export const unionDays = (chains: ChainView[]) =>
  [...new Set(chains.flatMap((c) => c.snap.days))].sort()

const RECENT_DAYS = 28

/** The last 28 indexed days, ascending. */
export const rangeDays = (chains: ChainView[]): string[] =>
  unionDays(chains).slice(-RECENT_DAYS)

/** Last day whose primary batch is complete on every chain in scope. */
export function lastClosedDay(chains: ChainView[]): string | null {
  const days = unionDays(chains)
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i] as string
    const views = chains.map((c) => c.byDay.get(day))
    if (views.every((v) => v && !v.inProgress && v.agg.start !== null))
      return day
  }
  return null
}

/** "13:24–13:56 UTC": earliest start to latest end of the day's batches. */
export function batchWindow(
  chains: ChainView[],
  day: string,
  group: string,
): string | null {
  const rows = chains.flatMap((c) =>
    c.snap.batches.filter((b) => b.day === day && b.group === group),
  )
  if (!rows.length) return null
  const start = Math.min(...rows.map((b) => b.primary.start))
  const end = Math.max(...rows.map((b) => b.primary.end))
  return `${fmtHM(start)}–${fmtHM(end)} UTC`
}

/** Today's running batch, in words. */
export const liveText = (count: number) =>
  count === 0
    ? `Not started · due from about ${USUAL_START}`
    : `In progress · ${fmtCount(count)} statements so far`

/** Alerts grouped into incidents: same rule + day across chains. */
export type AlertGroup = {
  id: string
  rule: Alert["rule"]
  day: string
  firedAt: number
  alerts: Alert[]
}

export function groupAlerts(chains: ChainView[]): AlertGroup[] {
  const map = new Map<string, AlertGroup>()
  for (const a of chains.flatMap((c) => c.alerts)) {
    const id = `${a.day}:${a.rule}:${a.open ? "open" : "day"}`
    const g = map.get(id) ?? {
      id,
      rule: a.rule,
      day: a.day,
      firedAt: a.firedAt,
      alerts: [],
    }
    g.alerts.push(a)
    g.firedAt = Math.min(g.firedAt, a.firedAt)
    map.set(id, g)
  }
  return [...map.values()].sort((a, b) => b.firedAt - a.firedAt)
}

export type RuleState = "ok" | "warning" | "breached" | "nodata"
export const RULES: Alert["rule"][] = [
  "systemic-short-batch",
  "late-batch",
  "slow-liquidation",
  "latency-p95",
]

/**
 * Per-rule state on a closed day, Datadog style. Flagged (internally "breached") = the rule fired
 * that day; Warning = the same signal below its threshold; No data = no
 * baseline yet. Statements still open at the index end are their own alert
 * (evaluateOpen), not a state of past days.
 */
export function ruleState(
  c: ChainView,
  day: string,
  rule: Alert["rule"],
): RuleState {
  const d = c.byDay.get(day)
  if (!d || d.agg.index === null) return "nodata"
  if (c.alerts.some((a) => a.day === day && a.rule === rule && !a.open))
    return "breached"
  if (rule === "systemic-short-batch") {
    const short = d.groups.filter((g) => isShort(g.index)).length
    if (d.agg.index < WARNING_INDEX || short >= WARNING_SHORT_GROUPS)
      return "warning"
  }
  return "ok"
}

/** Plain rule names for the UI; the ids stay in code. */
export const RULE_LABEL: Record<Alert["rule"], string> = {
  "systemic-short-batch": "Batch short",
  "late-batch": "Batch late",
  "slow-liquidation": "Slow liquidation",
  "latency-p95": "Liquidation p95",
}

export const STATE_LABEL: Record<RuleState, string> = {
  ok: "OK",
  warning: "Warning",
  breached: "Flagged",
  nodata: "No data",
}

export const chainList = (alerts: Alert[]) =>
  alerts.map((a) => CHAIN_LABEL[a.chain]).join(", ")

/**
 * The facts of a systemic alert, so every place (chart flag, history,
 * notification) words it the same way. `index` is the combined % of
 * baseline of the chains that fired.
 */
export function shortBatchFacts(g: AlertGroup, chains: ChainView[]) {
  const fired = chains.filter((c) => g.alerts.some((a) => a.chain === c.chain))
  return {
    fired,
    where: chainList(g.alerts),
    index: combinedRow(fired, g.day, ALL).index,
    affected: g.alerts.reduce((a, x) => a + x.groupsAffected, 0),
    active: g.alerts.reduce((a, x) => a + x.groupsActive, 0),
  }
}

/** "38% of baseline · 38/45 groups" */
export function shortBatchMetric(f: ReturnType<typeof shortBatchFacts>) {
  return [
    f.index === null ? null : `${f.index}% of baseline`,
    `${f.affected}/${f.active} groups`,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** Groups (letters) of one chain, by volume order. */
export function groupLetters(c: ChainView): string[] {
  const set = new Set(
    c.snap.batches.filter((b) => b.group !== ALL).map((b) => b.group),
  )
  return [...set].sort((a, b) => a.length - b.length || a.localeCompare(b))
}

export { isShort }
