// Indexes Rain Coordinator settlement events into cache/<chain>/<day>.json.
// usage: pnpm index --chain arbitrum --from 2026-10-13 [--to 2026-11-07]
// --to is inclusive (whole UTC day); default is the chain head.
// The cache holds tx hashes for local debugging, so cache/ is gitignored.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { ALL_TOPICS } from "../src/chain/abi"
import { type Chain, COORDINATORS } from "../src/chain/coordinators"
import { type Decoded, decodeLog } from "../src/chain/decode"
import { dayOf, dayStart } from "../src/core/day"
import { type CacheDay, CacheDaySchema, IndexStateSchema } from "./cache"
import { blockAt, blockTimestamps, getLogs, headBlock } from "./rpc"

const { values } = parseArgs({
  options: {
    chain: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
  },
})
const chain = values.chain as Chain
if (!(chain in COORDINATORS) || !values.from)
  throw new Error("usage: --chain arbitrum|polygon|avalanche --from YYYY-MM-DD")

const dir = `cache/${chain}`
mkdirSync(dir, { recursive: true })

const addresses = COORDINATORS[chain].map((c) => c.address)
const known = new Set<string>(addresses)

const head = await headBlock(chain)
const to = values.to
const [fromBlock, toBlock] = await Promise.all([
  blockAt(chain, dayStart(values.from), head),
  to ? blockAt(chain, dayStart(to) + 86_400, head).then((b) => b - 1) : head,
])
console.error(`${chain}: blocks ${fromBlock}..${toBlock}`)

// chunks of 1M blocks keep memory flat and persist progress; a
// crash re-runs at most one chunk (writes are idempotent by tx:logIndex).
const CHUNK = 1_000_000
for (let b = fromBlock; b <= toBlock; b += CHUNK) {
  const e = Math.min(b + CHUNK - 1, toBlock)
  const t0 = Date.now()
  const logs = await getLogs(chain, b, e, addresses, ALL_TOPICS)
  const ms = Date.now() - t0

  // Tenderly logs on Arbitrum/Polygon carry blockTimestamp; arb1 and
  // Avalanche return 0x0, so those blocks get an exact eth_getBlockByNumber.
  const missing = [
    ...new Set(
      logs
        .filter((l) => !Number(l.blockTimestamp ?? 0))
        .map((l) => Number(l.blockNumber)),
    ),
  ]
  const ts = await blockTimestamps(chain, missing, (n) => {
    if (n % 1000 === 0) console.error(`${chain}: ts ${n}/${missing.length}`)
  })

  const byDay = new Map<string, Loaded>()
  for (const log of logs) {
    const block = Number(log.blockNumber)
    const t = Number(log.blockTimestamp ?? 0) || (ts.get(block) as number)
    const d = decodeLog(log, t, known)
    if (!d) continue
    const key = dayOf(t)
    const loaded = byDay.get(key) ?? loadDay(key)
    byDay.set(key, loaded)
    add(loaded, d, `${log.transactionHash}:${Number(log.logIndex)}`)
  }
  for (const [d, { data }] of byDay) writeDay(d, data)
  recordRange(b, e, (await blockTimestamps(chain, [e])).get(e) as number)
  console.error(
    `${chain}: ${b}..${e} ${logs.length} logs, ${missing.length} ts fetched, ${ms} ms getLogs`,
  )
}

// A cached day plus the ids already in it (tx:logIndex ids are unique across
// statements, liquidations and withdrawals).
type Loaded = { data: CacheDay; ids: Set<string> }

function loadDay(d: string): Loaded {
  const p = `${dir}/${d}.json`
  const data: CacheDay = existsSync(p)
    ? CacheDaySchema.parse(JSON.parse(readFileSync(p, "utf8")))
    : { statements: [], liquidations: [], withdrawals: [] }
  const ids = new Set<string>()
  for (const r of [
    ...data.statements,
    ...data.liquidations,
    ...data.withdrawals,
  ])
    ids.add(r.id)
  return { data, ids }
}

function add({ data, ids }: Loaded, d: Decoded, id: string) {
  if (ids.has(id)) return
  ids.add(id)
  const list =
    d.kind === "statement"
      ? data.statements
      : d.kind === "liquidation"
        ? data.liquidations
        : data.withdrawals
  list.push({ ...d.record, id } as never)
}

function writeDay(d: string, data: CacheDay) {
  writeFileSync(`${dir}/${d}.json`, JSON.stringify(data))
}

function recordRange(from: number, to: number, toTs: number) {
  const p = `${dir}/state.json`
  const state = existsSync(p)
    ? IndexStateSchema.parse(JSON.parse(readFileSync(p, "utf8")))
    : { ranges: [] }
  state.ranges.push({ from, to, toTs })
  // merge overlapping/adjacent ranges
  state.ranges.sort((a, b) => a.from - b.from)
  const merged: typeof state.ranges = []
  for (const r of state.ranges) {
    const last = merged.at(-1)
    if (last && r.from <= last.to + 1) {
      if (r.to > last.to) Object.assign(last, { to: r.to, toTs: r.toTs })
    } else merged.push({ ...r })
  }
  writeFileSync(p, JSON.stringify({ ranges: merged }, null, 2))
}
