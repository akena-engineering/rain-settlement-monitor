import type { View } from "../App"
import { SLOW_LIQUIDATION_SEC } from "../core/thresholds"
import {
  fmtAge,
  fmtCount,
  fmtDay,
  fmtDuration,
  fmtPct,
  fmtRange,
  fmtStamp,
  fmtUsd,
} from "./format"
import {
  ALL,
  batchWindow,
  CHAIN_LABEL,
  combinedRow,
  indexedThrough,
  inScope,
  isShort,
  rowFor,
} from "./model"

/** The day's answer to the hero question, worst chain first. */
function verdict(view: View) {
  const rows = inScope(view.model, view.scope).flatMap((c) => {
    const { index } = rowFor(c.byDay.get(view.day), view.group)
    return index === null ? [] : [{ chain: c.chain, index }]
  })
  const short = rows
    .filter((r) => isShort(r.index))
    .sort((a, b) => a.index - b.index)
  if (rows.length === 0) return { tone: "quiet", text: "Baseline forming" }
  if (short.length === 0)
    return { tone: "ok", text: "Complete on every chain in view" }
  return {
    tone: "short",
    text: `Short on ${short.map((r) => `${CHAIN_LABEL[r.chain]} (${r.index}%)`).join(", ")}`,
  }
}

export default function Cards({ view }: { view: View }) {
  const chains = inScope(view.model, view.scope)
  const { group, day } = view
  const row = combinedRow(chains, day, group)
  const window = batchWindow(chains, day, group)
  const cents = chains
    .flatMap((c) =>
      c.snap.batches.filter((b) => b.day === day && b.group === group),
    )
    .reduce((a, b) => a + b.primary.cents, 0)
  const lat = chains.flatMap((c) =>
    c.snap.latency.filter((l) => l.day === day && l.group === group),
  )
  const pending = chains.flatMap((c) =>
    c.snap.pending
      .filter((p) => group === ALL || p.group === group)
      .map((p) => ({ ...p, chain: c.chain })),
  )
  const oldest = pending.reduce<(typeof pending)[number] | null>(
    (a, p) => (!a || p.ageSec > a.ageSec ? p : a),
    null,
  )
  const v = verdict(view)

  return (
    <section className="close-line" aria-label="Selected batch">
      <div className="fact">
        <div className="label">
          {day === view.latest ? "Last batch" : "Batch"} · {fmtDay(day)}
          {day !== view.latest && (
            <button
              type="button"
              className="link"
              onClick={() => view.setDay(view.latest)}
            >
              Back to latest
            </button>
          )}
        </div>
        <div className="value">
          {fmtCount(row.count)}{" "}
          <small className={isShort(row.index) ? "short" : undefined}>
            · {fmtPct(row.index)} of baseline
          </small>
        </div>
        <div className="meta">
          <span className={`verdict ${v.tone}`}>{v.text}</span>
          {window && ` · ${window}`}
          {view.usd && ` · ${fmtUsd(cents)}`}
        </div>
      </div>
      <div className="fact">
        <div className="label">Liquidation p50, by chain</div>
        <div className="value">
          {fmtRange(
            lat.map((l) => l.p50),
            fmtDuration,
          )}
        </div>
        <div className="meta">
          p95{" "}
          {fmtRange(
            lat.map((l) => l.p95),
            fmtDuration,
          )}
        </div>
      </div>
      <div className="fact">
        <div className="label">Awaiting liquidation</div>
        <div className="value">{fmtCount(pending.length)}</div>
        <div className="meta">
          {view.usd
            ? `${fmtUsd(pending.reduce((a, p) => a + p.cents, 0))} remaining`
            : `${pending.length === 1 ? "statement" : "statements"} not yet liquidated`}
        </div>
      </div>
      <div className="fact">
        <div className="label">Oldest awaiting</div>
        <div
          className={
            oldest && oldest.ageSec > SLOW_LIQUIDATION_SEC
              ? "value warn"
              : "value"
          }
        >
          {oldest ? fmtAge(oldest.ageSec) : "—"}
        </div>
        <div className="meta">
          {oldest
            ? `${CHAIN_LABEL[oldest.chain]} · group ${oldest.group} · published ${fmtDay(oldest.day)}`
            : "none open"}
        </div>
      </div>
      <div className="close-source">
        Observed onchain · indexed through {fmtStamp(indexedThrough(chains))}
      </div>
    </section>
  )
}
