// zod schemas for the local, gitignored indexer cache (cache/<chain>/*.json).
import { z } from "zod"

const hex = z.string().regex(/^0x[0-9a-f]*$/)
const id = z.string() // `${tx}:${logIndex}`, local debugging only

export const CacheDaySchema = z.object({
  statements: z.array(
    z.object({
      id,
      key: hex,
      coordinator: hex,
      cents: z.number().int(),
      publishBlock: z.number().int(),
      publishTs: z.number().int(),
      liquidatableAfter: z.number().int(),
    }),
  ),
  liquidations: z.array(
    z.object({
      id,
      key: hex,
      coordinator: hex,
      netCents: z.number().int(),
      block: z.number().int(),
      ts: z.number().int(),
      assets: z.array(hex),
    }),
  ),
  withdrawals: z.array(
    z.object({
      id,
      coordinator: hex,
      asset: hex,
      native: z.string(),
      block: z.number().int(),
      ts: z.number().int(),
    }),
  ),
})
export type CacheDay = z.infer<typeof CacheDaySchema>

export const IndexStateSchema = z.object({
  ranges: z.array(
    z.object({ from: z.number(), to: z.number(), toTs: z.number() }),
  ),
})
