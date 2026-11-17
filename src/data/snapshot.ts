// Anonymised aggregate snapshots in public/data/: the privacy boundary.
// They hold counts, histograms, batch windows and pending ages only. No proxy
// addresses, tx hashes, statementId or teamId; Coordinator addresses appear
// only in meta.groups (methodology drawer).
import { z } from "zod"

export const CHAINS = ["arbitrum", "polygon", "avalanche"] as const
/** Group key of the all-groups aggregate rows. */
export const ALL = "*"

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const group = z.string().regex(/^(\*|[A-Z]{1,2})$/) // "*" = all groups
const ts = z.number().int()

export const BatchSummarySchema = z.object({
  day,
  group,
  primary: z.object({
    start: ts,
    end: ts,
    count: z.number().int(),
    cents: z.number().int(),
  }),
  secondary: z.array(z.object({ start: ts, count: z.number().int() })),
})
export type BatchSummary = z.infer<typeof BatchSummarySchema>

// Upper bounds (seconds) of the log-spaced latency bins; the last bin is >24 h.
export const LATENCY_BINS = [
  30,
  45,
  60,
  90,
  120,
  300,
  900,
  3600,
  21600,
  86400,
  Infinity,
] as const
export const LATENCY_BIN_LABELS = [
  "≤30 s",
  "30–45 s",
  "45–60 s",
  "60–90 s",
  "90–120 s",
  "2–5 min",
  "5–15 min",
  "15–60 min",
  "1–6 h",
  "6–24 h",
  ">24 h",
] as const

export const LatencySchema = z.object({
  day,
  group,
  n: z.number().int(),
  p50: z.number(),
  p95: z.number(),
  p99: z.number(),
  max: z.number(),
  bins: z.array(z.number().int()).length(LATENCY_BINS.length),
})
export type Latency = z.infer<typeof LatencySchema>

// Statements and liquidations per 10-minute UTC bucket (b = 0…143).
export const BucketSchema = z.object({
  day,
  group,
  b: z.number().int().min(0).max(143),
  s: z.number().int(),
  l: z.number().int(),
})
export type Bucket = z.infer<typeof BucketSchema>

export const PendingSchema = z.object({
  group,
  day, // UTC publish day of the statement
  ageSec: z.number().int(),
  cents: z.number().int(),
})
export type Pending = z.infer<typeof PendingSchema>

export const OutlierSchema = z.object({
  day,
  group,
  latencySec: z.number().int(),
  centsBucket: z.enum(["<$10", "$10–100", "$100–1k", ">$1k"]),
})
export type Outlier = z.infer<typeof OutlierSchema>

export const ChainSnapshotSchema = z.object({
  chain: z.enum(CHAINS),
  indexedThrough: z.object({ block: z.number().int(), ts }),
  // UTC days fully covered by the index, ascending (gaps allowed).
  days: z.array(day),
  batches: z.array(BatchSummarySchema),
  latency: z.array(LatencySchema),
  buckets: z.array(BucketSchema),
  pending: z.array(PendingSchema),
  outliers: z.array(OutlierSchema),
})
export type ChainSnapshot = z.infer<typeof ChainSnapshotSchema>

export const MetaSchema = z.object({
  // Partial: a chain appears once it has been indexed.
  indexedThrough: z.partialRecord(
    z.enum(CHAINS),
    z.object({ block: z.number().int(), ts }),
  ),
  coverage: z.object({
    indexed: z.array(z.enum(CHAINS)),
    notYet: z.array(z.string()),
    notes: z.array(z.string()),
  }),
  groups: z.record(
    z.enum(CHAINS),
    z.array(
      z.object({
        group,
        address: z.string().regex(/^0x[0-9a-f]{40}$/),
        version: z.string(),
      }),
    ),
  ),
})
export type Meta = z.infer<typeof MetaSchema>

/**
 * Throws if `json` contains any 32-byte hex value (tx or statement hash) or a
 * 20-byte address outside `allowedAddresses` (Coordinators in meta.groups).
 * Runs in the test suite and at the end of scripts/aggregate.ts.
 */
export function assertNoIdentifiers(
  json: string,
  allowedAddresses: ReadonlySet<string>,
): void {
  const hashes = json.match(/0x[0-9a-fA-F]{64}/g)
  if (hashes) throw new Error(`snapshot contains a 32-byte hash: ${hashes[0]}`)
  for (const m of json.matchAll(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g)) {
    if (!allowedAddresses.has(m[0].toLowerCase()))
      throw new Error(`snapshot contains a non-Coordinator address: ${m[0]}`)
  }
}
