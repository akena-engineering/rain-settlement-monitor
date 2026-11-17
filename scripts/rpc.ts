// Read-only JSON-RPC over free public endpoints: rotation, backoff and
// adaptive getLogs ranges. Used by scripts/index.ts only (never the browser).
import type { Chain } from "../src/chain/coordinators"
import type { RawLog } from "../src/chain/decode"

type Endpoint = {
  url: string
  maxRange: number // largest getLogs span the endpoint accepts
  maxAddrs: number // addresses per getLogs call
  batch: boolean // accepts JSON-RPC batches without 429
}

// Measured 2026-11-12. Tenderly first: 100k ranges, any
// address count, and on Arbitrum/Polygon logs carry blockTimestamp.
const ENDPOINTS: Record<Chain, Endpoint[]> = {
  arbitrum: [
    {
      url: "https://arbitrum.gateway.tenderly.co",
      maxRange: 100_000,
      maxAddrs: 200,
      batch: false,
    },
    {
      url: "https://arb1.arbitrum.io/rpc",
      maxRange: 99_999,
      maxAddrs: 200,
      batch: true,
    },
  ],
  polygon: [
    {
      url: "https://polygon.gateway.tenderly.co",
      maxRange: 100_000,
      maxAddrs: 200,
      batch: true,
    },
    {
      url: "https://polygon-bor-rpc.publicnode.com",
      maxRange: 9_999,
      maxAddrs: 10,
      batch: true,
    },
  ],
  avalanche: [
    {
      url: "https://avalanche.gateway.tenderly.co",
      maxRange: 100_000,
      maxAddrs: 200,
      batch: false,
    },
    {
      url: "https://avalanche-c-chain-rpc.publicnode.com",
      maxRange: 49_999,
      maxAddrs: 10,
      batch: true,
    },
  ],
}

class RangeError_ extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const hex = (n: number) => `0x${n.toString(16)}`
const TRIES = 8
const RANGE_HINTS = ["range", "spans", "too many", "exceed", "limit"]

async function post(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })
  if (res.status === 429) throw new Error("429 rate limited")
  return res.json()
}

function unwrap(r: unknown): unknown {
  const o = r as {
    result?: unknown
    error?: { code?: number; message?: string }
  }
  if (o.error) {
    const msg = `${o.error.code} ${o.error.message ?? ""}`
    // -32005 is a rate limit on most providers; only range errors shrink.
    if (o.error.code !== -32005 && RANGE_HINTS.some((h) => msg.includes(h)))
      throw new RangeError_(msg)
    throw new Error(msg)
  }
  if (o.result === undefined || o.result === null)
    throw new Error("empty result")
  return o.result
}

/** Retries with exponential backoff, rotating endpoints between attempts. */
async function withRetry<T>(
  chain: Chain,
  fn: (ep: Endpoint) => Promise<T>,
  eps: Endpoint[] = ENDPOINTS[chain],
): Promise<T> {
  let last: unknown
  for (let i = 0; i < TRIES; i++) {
    const ep = eps[i % eps.length] as Endpoint
    try {
      return await fn(ep)
    } catch (e) {
      if (e instanceof RangeError_) throw e
      last = e
      console.error(
        `retry ${i} ${new URL(ep.url).host}: ${String(e).slice(0, 140)}`,
      )
      await sleep(Math.min(30_000, 1000 * 2 ** i))
    }
  }
  throw new Error(`${chain}: rpc failed: ${String(last)}`)
}

export async function call(chain: Chain, method: string, params: unknown[]) {
  return withRetry(chain, async (ep) =>
    unwrap(await post(ep.url, { jsonrpc: "2.0", id: 1, method, params })),
  )
}

export async function headBlock(chain: Chain): Promise<number> {
  return Number(await call(chain, "eth_blockNumber", []))
}

/**
 * Logs for `addresses` × `topics` over [from, to]. Starts at the primary
 * endpoint's max range and halves on range errors; never skips a block.
 */
export async function getLogs(
  chain: Chain,
  from: number,
  to: number,
  addresses: string[],
  topics: readonly string[],
): Promise<RawLog[]> {
  const primary = ENDPOINTS[chain][0] as Endpoint
  const out: RawLog[] = []
  let span = primary.maxRange
  let b = from
  while (b <= to) {
    const e = Math.min(b + span - 1, to)
    try {
      const part = await withRetry(chain, async (ep) => {
        if (e - b + 1 > ep.maxRange) throw new RangeError_("span over limit")
        const logs: RawLog[] = []
        for (let i = 0; i < addresses.length; i += ep.maxAddrs) {
          const r = unwrap(
            await post(ep.url, {
              jsonrpc: "2.0",
              id: 1,
              method: "eth_getLogs",
              params: [
                {
                  fromBlock: hex(b),
                  toBlock: hex(e),
                  address: addresses.slice(i, i + ep.maxAddrs),
                  topics: [topics],
                },
              ],
            }),
          ) as RawLog[]
          // loops, not push(...r): spreading 100k logs overflows the stack
          for (const log of r) logs.push(log)
        }
        return logs
      })
      for (const log of part) out.push(log)
      b = e + 1
    } catch (err) {
      if (!(err instanceof RangeError_) || span <= 1) throw err
      span = Math.max(1, Math.floor(span / 2))
      console.error(
        `shrink ${chain} span ${span}: ${err.message.slice(0, 100)}`,
      )
    }
  }
  return out
}

/** Exact timestamps for blocks, JSON-RPC-batched where the endpoint allows. */
export async function blockTimestamps(
  chain: Chain,
  blocks: number[],
  onProgress?: (done: number) => void,
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  const BATCH = 20
  // Tenderly answers parallel single calls with 429 on Arbitrum/Avalanche;
  // batch-capable endpoints go first for bulk timestamp fetches.
  const batchFirst = [...ENDPOINTS[chain]].sort(
    (a, b) => Number(b.batch) - Number(a.batch),
  )
  for (let i = 0; i < blocks.length; i += BATCH) {
    const slice = blocks.slice(i, i + BATCH)
    const ts = await withRetry(
      chain,
      async (ep) => {
        if (!ep.batch)
          return Promise.all(
            slice.map(async (b) => {
              const r = unwrap(
                await post(ep.url, {
                  jsonrpc: "2.0",
                  id: 1,
                  method: "eth_getBlockByNumber",
                  params: [hex(b), false],
                }),
              ) as { timestamp: string }
              return Number(r.timestamp)
            }),
          )
        const r = (await post(
          ep.url,
          slice.map((b, id) => ({
            jsonrpc: "2.0",
            id,
            method: "eth_getBlockByNumber",
            params: [hex(b), false],
          })),
        )) as { id: number }[]
        if (!Array.isArray(r))
          throw new Error(`batch: ${JSON.stringify(r).slice(0, 100)}`)
        return [...r]
          .sort((a, b) => a.id - b.id)
          .map((x) => Number((unwrap(x) as { timestamp: string }).timestamp))
      },
      batchFirst,
    )
    slice.forEach((b, k) => {
      out.set(b, ts[k] as number)
    })
    onProgress?.(Math.min(i + BATCH, blocks.length))
  }
  return out
}

/** First block with timestamp >= ts (binary search). */
export async function blockAt(
  chain: Chain,
  ts: number,
  head: number,
): Promise<number> {
  const tsOf = async (b: number) =>
    (await blockTimestamps(chain, [b])).get(b) as number
  let lo = 1
  let hi = head
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if ((await tsOf(mid)) < ts) lo = mid + 1
    else hi = mid
  }
  return lo
}
