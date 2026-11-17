import type { ReactNode } from "react"
import type { View } from "../App"
import { SLOW_LIQUIDATION_SEC } from "../core/thresholds"
import { LATENCY_BIN_LABELS, LATENCY_BINS } from "../data/snapshot"
import { ChainName } from "./ChainLogo"

import { fmtAge, fmtCount, fmtDay, fmtDuration } from "./format"
import { ALL, CHAIN_LABEL, inScope, rangeDays } from "./model"
import { TipBody, Tooltip, useTooltip } from "./Tooltip"

// First histogram bin past the slow-liquidation threshold; only those
// bins take the alert colour, so the chart and the rule share one threshold.
const SLOW_BIN =
  LATENCY_BINS.findIndex((upper) => upper >= SLOW_LIQUIDATION_SEC) + 1
const SLOW = fmtAge(SLOW_LIQUIDATION_SEC)

const W = 640
const H = 220
const M = { l: 8, r: 8, t: 16, b: 44 }

export default function LatencyPanel({ view }: { view: View }) {
  const chains = inScope(view.model, view.scope)
  const { group, day } = view
  const rows = chains.flatMap((c) =>
    c.snap.latency
      .filter((l) => l.day === day && l.group === group)
      .map((l) => ({ chain: c.chain, ...l })),
  )
  const bins = LATENCY_BIN_LABELS.map((_, i) =>
    rows.reduce((a, r) => a + (r.bins[i] ?? 0), 0),
  )
  const total = bins.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...bins)
  const bw = (W - M.l - M.r) / bins.length
  const tip = useTooltip()

  const days = new Set(rangeDays(chains))
  const outliers = chains
    .flatMap((c) =>
      c.snap.outliers
        .filter((o) => days.has(o.day) && (group === ALL || o.group === group))
        .map((o) => ({ chain: c.chain, ...o })),
    )
    .sort((a, b) => b.day.localeCompare(a.day) || b.latencySec - a.latencySec)

  return (
    <section className="section" id="latency">
      <div className="section-head">
        <div>
          <h2>Liquidation latency · {fmtDay(day)}</h2>
          <p className="lede">
            Time from statement to completed liquidation, for the selected day.
          </p>
        </div>
      </div>
      <div className="two-col">
        <div className="sheet">
          {total === 0 ? (
            <div className="hist muted">No settled statements on this day.</div>
          ) : (
            <div className="hist-scroll">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                role="img"
                aria-label="Latency histogram"
                className="hist"
              >
                {bins.map((v, i) => {
                  const h = ((H - M.t - M.b) * v) / max
                  const x = M.l + i * bw
                  return (
                    <g key={LATENCY_BIN_LABELS[i]}>
                      <rect
                        x={x + 4}
                        width={bw - 8}
                        y={H - M.b - h}
                        height={Math.max(v ? 2 : 0, h)}
                        rx={Math.min(6, (bw - 8) / 2)}
                        className={i >= SLOW_BIN ? "hist-bar slow" : "hist-bar"}
                      />
                      {v > 0 && (
                        <text
                          x={x + bw / 2}
                          y={H - M.b - h - 4}
                          textAnchor="middle"
                        >
                          {fmtCount(v)}
                        </text>
                      )}
                      <text
                        x={x + bw / 2}
                        y={H - M.b + 16}
                        textAnchor="middle"
                        className="bin-label"
                      >
                        {LATENCY_BIN_LABELS[i]}
                      </text>
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover only reveals the numbers already printed on the bar */}
                      <rect
                        x={x}
                        width={bw}
                        y={M.t}
                        height={H - M.t - M.b}
                        fill="transparent"
                        onMouseMove={(e) =>
                          tip.show(
                            e,
                            <TipBody
                              title={`Liquidated in ${LATENCY_BIN_LABELS[i]}`}
                              rows={[
                                [
                                  "Statements",
                                  `${fmtCount(v)} · ${((100 * v) / total).toFixed(1)}%`,
                                ],
                                ...rows.map((r): [ReactNode, ReactNode] => [
                                  CHAIN_LABEL[r.chain],
                                  fmtCount(r.bins[i] ?? 0),
                                ]),
                              ]}
                              note={
                                i >= SLOW_BIN
                                  ? `Over ${SLOW} after publication · observed`
                                  : undefined
                              }
                            />,
                          )
                        }
                        onMouseLeave={tip.hide}
                      />
                    </g>
                  )
                })}
                <line
                  x1={M.l}
                  x2={W - M.r}
                  y1={H - M.b}
                  y2={H - M.b}
                  stroke="var(--rule-strong)"
                />
              </svg>
            </div>
          )}
          <Tooltip bind={tip.bind} />
          <table className="ledger pct-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th className="num">p50</th>
                <th className="num">p95</th>
                <th className="num">p99</th>
                <th className="num">Liquidated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.chain}>
                  <td>
                    <ChainName chain={r.chain} label={CHAIN_LABEL[r.chain]} />
                  </td>
                  <td className="num strong">{fmtDuration(r.p50)}</td>
                  <td className="num strong">{fmtDuration(r.p95)}</td>
                  <td className="num">{fmtDuration(r.p99)}</td>
                  <td className="num">{fmtCount(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sheet fill">
          <div className="outliers">
            <table className="ledger">
              <caption>Slow liquidations, over {SLOW} · last 28 days</caption>
              <thead>
                <tr>
                  <th>Day · chain</th>
                  <th>Group</th>
                  <th className="num">Latency</th>
                  {view.usd && <th className="num">Amount</th>}
                </tr>
              </thead>
              <tbody>
                {outliers.length === 0 && (
                  <tr>
                    <td className="muted">None in this range.</td>
                  </tr>
                )}
                {outliers.map((o, i) => (
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity by design (anonymised)
                    key={i}
                    className={o.day === day ? "selected" : undefined}
                  >
                    <td className="mono">
                      <span className="outlier-when">
                        {fmtDay(o.day)}{" "}
                        <ChainName
                          chain={o.chain}
                          label={CHAIN_LABEL[o.chain]}
                        />
                      </span>
                    </td>
                    <td className="mono">{o.group}</td>
                    <td className="num">{fmtDuration(o.latencySec)}</td>
                    {view.usd && <td className="num">{o.centsBucket}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="source">Source: onchain statements and liquidations.</div>
    </section>
  )
}
