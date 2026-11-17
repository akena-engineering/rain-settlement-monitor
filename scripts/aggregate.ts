// Turns the private indexer cache into anonymised snapshots in public/data/.
// This is the privacy boundary: output holds counts, histograms, batch windows
// and pending ages only, checked by assertNoIdentifiers before writing.
// usage: pnpm aggregate
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { type Chain, COORDINATORS } from "../src/chain/coordinators"
import type { LiquidationRecord, StatementRecord } from "../src/chain/decode"
import { clusterBatches, splitPrimary } from "../src/core/batches"
import { addDays, dayOf, dayStart } from "../src/core/day"
import { percentile, settle } from "../src/core/settlement"
import { BATCH_GAP_MIN } from "../src/core/thresholds"
import {
  ALL,
  assertNoIdentifiers,
  type BatchSummary,
  type Bucket,
  CHAINS,
  type ChainSnapshot,
  ChainSnapshotSchema,
  LATENCY_BINS,
  type Latency,
  type Meta,
  MetaSchema,
  type Outlier,
  type Pending,
} from "../src/data/snapshot"
import { type CacheDay, CacheDaySchema, IndexStateSchema } from "./cache"

// The cache may also hold a July 2026 backfill; the page covers the recent
// weeks only, so days before FROM are left out of the snapshots.
const FROM = "2026-10-13"

function centsBucket(c: number): Outlier["centsBucket"] {
  if (c < 1_000) return "<$10"
  if (c < 10_000) return "$10–100"
  if (c < 100_000) return "$100–1k"
  return ">$1k"
}

type Paid = ReturnType<typeof settle>["paid"][number] & { cents: number }

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/** Buckets rows by the UTC day of `tsOf(row)`, in one pass. */
function byDay<T>(rows: T[], tsOf: (row: T) => number): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of rows) push(out, dayOf(tsOf(r)), r)
  return out
}

function latencyRow(day: string, group: string, lat: number[]): Latency {
  const bins = LATENCY_BINS.map(() => 0)
  for (const l of lat) {
    const i = LATENCY_BINS.findIndex((ub) => l <= ub)
    bins[i] = (bins[i] ?? 0) + 1
  }
  const sorted = [...lat].sort((a, b) => a - b)
  const p = (q: number) => percentile(sorted, q) ?? 0
  return {
    day,
    group,
    n: lat.length,
    p50: p(50),
    p95: p(95),
    p99: p(99),
    max: p(100),
    bins,
  }
}

function batchRow(
  day: string,
  group: string,
  stmts: StatementRecord[],
): BatchSummary | null {
  const { primary, secondary } = splitPrimary(
    clusterBatches(
      stmts.map((s) => s.publishTs),
      BATCH_GAP_MIN,
    ),
    day,
  )
  if (!primary) return null
  const cents = stmts
    .filter((s) => s.publishTs >= primary.start && s.publishTs <= primary.end)
    .reduce((a, s) => a + s.cents, 0)
  return {
    day,
    group,
    primary: { ...primary, cents },
    secondary: secondary.map(({ start, count }) => ({ start, count })),
  }
}

/** Contiguous runs of days, so each run settles against its own end. */
function segments(days: string[]): string[][] {
  const out: string[][] = []
  for (const d of days) {
    const last = out.at(-1)
    if (last && addDays(last.at(-1) as string, 1) === d) last.push(d)
    else out.push([d])
  }
  return out
}

function aggregate(chain: Chain): ChainSnapshot {
  const dir = `cache/${chain}`
  const groupOf = new Map<string, string>(
    COORDINATORS[chain].map((c) => [c.address, c.group]),
  )
  const state = IndexStateSchema.parse(
    JSON.parse(readFileSync(`${dir}/state.json`, "utf8")),
  )
  const last = state.ranges.reduce((a, r) => (r.to > a.to ? r : a))
  const indexedThrough = { block: last.to, ts: last.toTs }

  // a day is "indexed" when its cache file exists; an indexed day
  // with zero events would be missing. Add explicit day coverage if needed.
  const days = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .filter((d) => d >= FROM && dayStart(d) <= indexedThrough.ts)
    .sort()
  const load = (d: string): CacheDay =>
    CacheDaySchema.parse(JSON.parse(readFileSync(`${dir}/${d}.json`, "utf8")))

  const batches: BatchSummary[] = []
  const latency: Latency[] = []
  const buckets: Bucket[] = []
  const outliers: Outlier[] = []
  let pending: Pending[] = []

  const segs = segments(days)
  segs.forEach((seg, i) => {
    const data = seg.map(load)
    const statements = data.flatMap((d) => d.statements) as StatementRecord[]
    const liquidations = data.flatMap(
      (d) => d.liquidations,
    ) as LiquidationRecord[]
    const isLast = i === segs.length - 1
    const segEnd = isLast
      ? indexedThrough.ts
      : dayStart(addDays(seg.at(-1) as string, 1)) - 1
    const settled = settle(statements, liquidations, segEnd)
    const group = (r: { coordinator: string }) =>
      groupOf.get(r.coordinator) ?? "?"
    const stmtOf = new Map(
      statements.map((s) => [`${s.coordinator}:${s.key}`, s]),
    )

    // Earlier segments end at a day boundary we did not index past, so their
    // unliquidated statements are unknown, not pending.
    if (isLast)
      pending = settled.pending.map((p) => ({
        group: group(p),
        // settle() derives pending from `statements`, so the lookup always
        // hits; a miss would make dayOf throw on NaN rather than mislabel.
        day: dayOf(stmtOf.get(`${p.coordinator}:${p.key}`)?.publishTs ?? NaN),
        ageSec: p.ageSec,
        cents: p.remainingCents,
      }))

    const stmtsByDay = byDay(statements, (s) => s.publishTs)
    const liqsByDay = byDay(liquidations, (l) => l.ts)
    const paidByDay = new Map<string, Paid[]>()
    for (const p of settled.paid) {
      const s = stmtOf.get(`${p.coordinator}:${p.key}`)
      if (s) push(paidByDay, dayOf(s.publishTs), { ...p, cents: s.cents })
    }

    for (const day of seg) {
      const dayStmts = stmtsByDay.get(day) ?? []
      const stmtsByGroup = new Map<string, StatementRecord[]>()
      for (const s of dayStmts) push(stmtsByGroup, group(s), s)
      const groups = [...stmtsByGroup.keys()].sort()
      const row = batchRow(day, ALL, dayStmts)
      if (row) batches.push(row)
      for (const g of groups) {
        const row = batchRow(day, g, stmtsByGroup.get(g) ?? [])
        if (row) batches.push(row)
      }

      const paid = paidByDay.get(day) ?? []
      const latByGroup = new Map<string, number[]>()
      for (const p of paid) push(latByGroup, group(p), p.latencySec)
      if (paid.length)
        latency.push(
          latencyRow(
            day,
            ALL,
            paid.map((p) => p.latencySec),
          ),
        )
      for (const g of groups) {
        const lat = latByGroup.get(g)
        if (lat) latency.push(latencyRow(day, g, lat))
      }
      for (const p of paid) {
        if (p.latencySec <= 3600) continue
        outliers.push({
          day,
          group: group(p),
          latencySec: p.latencySec,
          centsBucket: centsBucket(p.cents),
        })
      }

      const counts = new Map<string, Bucket>()
      const midnight = dayStart(day)
      const bump = (g: string, ts: number, k: "s" | "l") => {
        const b = Math.floor((ts - midnight) / 600)
        const id = `${g}:${b}`
        const row = counts.get(id) ?? { day, group: g, b, s: 0, l: 0 }
        row[k]++
        counts.set(id, row)
      }
      for (const s of dayStmts) bump(group(s), s.publishTs, "s")
      for (const l of liqsByDay.get(day) ?? []) bump(group(l), l.ts, "l")
      for (const b of counts.values()) buckets.push(b)
    }
  })

  return ChainSnapshotSchema.parse({
    chain,
    indexedThrough,
    days,
    batches,
    latency,
    buckets,
    pending,
    outliers,
  })
}

const indexed = CHAINS.filter((c) => existsSync(`cache/${c}/state.json`))
const snapshots = indexed.map(aggregate)
const groups: Meta["groups"] = COORDINATORS
const meta: Meta = MetaSchema.parse({
  indexedThrough: Object.fromEntries(
    snapshots.map((s) => [s.chain, s.indexedThrough]),
  ),
  coverage: {
    indexed,
    notYet: ["Base", "BSC", "Optimism", "Ethereum"],
    notes: [],
  },
  groups,
})

const allowed = new Set(
  Object.values(groups).flatMap((gs) => gs.map((g) => g.address)),
)
const files: [string, unknown][] = [
  ["public/data/meta.json", meta],
  ...snapshots.map((s): [string, unknown] => [
    `public/data/${s.chain}.json`,
    s,
  ]),
]
let total = 0
for (const [path, data] of files) {
  const json = JSON.stringify(data)
  // Coordinator addresses are allowed in meta only; chain snapshots get none.
  assertNoIdentifiers(json, path.endsWith("meta.json") ? allowed : new Set())
  writeFileSync(path, json)
  total += json.length
  console.error(`${path}: ${(json.length / 1024).toFixed(0)} kB`)
}
console.error(`total ${(total / 1024).toFixed(0)} kB`)
