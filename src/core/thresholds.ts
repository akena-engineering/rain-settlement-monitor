// demo objective: identify materially short batches.
export const SHORT_BATCH_RATIO = 0.6
// demo objective: require broad participation in a systemic observation.
export const SYSTEMIC_TENANT_SHARE = 0.75
// demo objective: require enough batches to establish a baseline.
export const MIN_BASELINE_BATCHES = 7
// demo objective: allow thirty minutes beyond observed batch starts.
export const LATE_BATCH_GRACE_MIN = 30
// demo objective: observe liquidation delays exceeding one hour.
export const SLOW_LIQUIDATION_SEC = 3600
// demo objective: compare p95 with three times its usual value.
export const P95_MULTIPLIER = 3
// demo objective: separate batches after forty-five minutes.
export const BATCH_GAP_MIN = 45
// demo objective: retain fourteen eligible baseline observations.
export const BASELINE_WINDOW = 14
// demo objective: baseline history older than four weeks is stale (index
// gaps such as July → October, or groups that stopped batching).
export const BASELINE_MAX_AGE_DAYS = 28
// demo objective: a batch below 80% of baseline shows as Warning.
export const WARNING_INDEX = 80
// demo objective: two or more short groups on a chain show as Warning.
export const WARNING_SHORT_GROUPS = 2

/** A batch index (% of baseline) below SHORT_BATCH_RATIO counts as short. */
export const isShort = (index: number | null): boolean =>
  index !== null && index < SHORT_BATCH_RATIO * 100
