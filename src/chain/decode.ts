import { type Address, decodeEventLog, type Hex } from "viem"
import {
  coordinatorEvents,
  statementPublishedV1,
  statementPublishedV2,
  TOPICS,
} from "./abi"

export type RawLog = {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash?: string
  logIndex?: string
  blockTimestamp?: string
}

export type StatementRecord = {
  key: Hex // keccak(statementId)
  coordinator: Address
  cents: number
  publishBlock: number
  publishTs: number
  liquidatableAfter: number
}

export type LiquidationRecord = {
  key: Hex // keccak(statementId), joins StatementRecord.key
  coordinator: Address
  netCents: number
  block: number
  ts: number
  assets: Address[]
}

export type WithdrawalRecord = {
  coordinator: Address
  asset: Address
  native: string
  block: number
  ts: number
}

export type Decoded =
  | { kind: "statement"; record: StatementRecord }
  | { kind: "liquidation"; record: LiquidationRecord }
  | { kind: "withdrawal"; record: WithdrawalRecord }

function abiFor(topic0: string) {
  if (topic0 === TOPICS.statementPublishedV1) return statementPublishedV1
  if (topic0 === TOPICS.statementPublishedV2) return statementPublishedV2
  if (topic0 === TOPICS.liquidation || topic0 === TOPICS.withdrawal) return []
  return null
}

// cents fit a JS number: the largest observed statement is ~84.2M cents.
const cents = (v: bigint) => Number(v)

/**
 * Decodes a Coordinator event. Returns null for logs from any address outside
 * `coordinators` (other contracts reuse the generic Withdrawal signature) and
 * for unknown topics. `coordinators` must hold lowercase addresses.
 */
export function decodeLog(
  log: RawLog,
  ts: number,
  coordinators: ReadonlySet<string>,
): Decoded | null {
  const coordinator = log.address.toLowerCase() as Address
  const topic0 = log.topics[0]
  if (!coordinators.has(coordinator) || !topic0) return null
  const abi = abiFor(topic0)
  if (!abi) return null
  const block = Number(BigInt(log.blockNumber))
  const ev = decodeEventLog({
    abi: [...abi, ...coordinatorEvents],
    topics: log.topics as [Hex, ...Hex[]],
    data: log.data as Hex,
  })
  switch (ev.eventName) {
    case "StatementPublished":
      return {
        kind: "statement",
        record: {
          key: ev.args.indexedStatementId as Hex,
          coordinator,
          cents: cents(ev.args.closingAccountBalanceCents),
          publishBlock: block,
          publishTs: ts,
          liquidatableAfter: Number(ev.args.liquidatableAfter),
        },
      }
    case "Liquidation":
      return {
        kind: "liquidation",
        record: {
          key: ev.args.indexedStatementId as Hex,
          coordinator,
          netCents: cents(ev.args.netAmountCents),
          block,
          ts,
          assets: ev.args.assets.map((a) => a.toLowerCase() as Address),
        },
      }
    case "Withdrawal":
      return {
        kind: "withdrawal",
        record: {
          coordinator,
          asset: ev.args.asset.toLowerCase() as Address,
          native: ev.args.amountNative.toString(),
          block,
          ts,
        },
      }
  }
}
