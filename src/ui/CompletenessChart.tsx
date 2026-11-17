import { type ReactNode, useMemo, useState } from "react"
import type { View } from "../App"
import { percentile } from "../core/settlement"
import { SHORT_BATCH_RATIO } from "../core/thresholds"
import { fmtCount, fmtDay, fmtHM, fmtPct } from "./format"
import {
  ALL,
  CHAIN_LABEL,
  type ChainView,
  combinedRow,
  groupAlerts,
  inScope,
  isShort,
  liveText,
  type Model,
  rangeDays,
  rowFor,
  shortBatchFacts,
  shortBatchMetric,
} from "./model"
import { TipBody, Tooltip, useTooltip } from "./Tooltip"

const W = 1200
const H = 360
const M = { l: 44, r: 20, t: 34, b: 30 }
// small groups batch irregularly and swing 0↔200; they still count
// in the rules, they just don't get a line.
const MIN_LINE_BASELINE = 50 // statements per batch

/** "M x,y L x,y …", breaking the line at gaps and at today's open batch. */
function linePath(
  pts: (number | null)[],
  days: string[],
  open: Set<string>,
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = ""
  let pen = false
  pts.forEach((v, i) => {
    if (v === null || open.has(days[i] as string)) {
      pen = false
      return
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `
    pen = true
  })
  return d
}

/** Everything the chart draws, computed once per selection (not per hover). */
function chartData(model: Model, chains: ChainView[], group: string) {
  const days = rangeDays(chains)
  const open = model.openDays
  const bold = days.map((d) => combinedRow(chains, d, group))
  const thin =
    group === ALL
      ? chains.flatMap((c) => {
          const letters = [
            ...new Set(c.days.flatMap((d) => d.groups.map((g) => g.group))),
          ]
          return letters.map((g) => ({
            key: `${c.chain}:${g}`,
            pts: days.map((d) => {
              const r = rowFor(c.byDay.get(d), g)
              return (r.baseline ?? 0) >= MIN_LINE_BASELINE ? r.index : null
            }),
          }))
        })
      : []
  const values = bold
    .map((r, i) => (open.has(days[i] as string) ? null : r.index))
    .filter((v): v is number => v !== null)
  const normal = values.filter((v) => !isShort(v))
  const firstIndexed = bold.findIndex((r) => r.index !== null)
  return {
    days,
    open,
    bold,
    thin,
    yMax: Math.min(220, Math.max(150, ...values.map((v) => v + 10))),
    band: [percentile(normal, 10), percentile(normal, 90)] as const,
    // Leading days without a baseline (fewer than 7 prior batches).
    forming: firstIndexed < 0 ? days.length : firstIndexed,
    systemic: groupAlerts(chains).filter(
      (g) => g.rule === "systemic-short-batch" && days.includes(g.day),
    ),
  }
}

export default function CompletenessChart({ view }: { view: View }) {
  const [hover, setHover] = useState<string | null>(null)
  const { group, model, scope } = view
  const chains = useMemo(() => inScope(model, scope), [model, scope])
  const data = useMemo(
    () => chartData(model, chains, group),
    [model, chains, group],
  )
  const { days, open, bold, thin, yMax, band, forming, systemic } = data
  const step = (W - M.l - M.r) / Math.max(1, days.length)
  const x = (i: number) => M.l + step * (i + 0.5)
  const y = (v: number) =>
    M.t + (H - M.t - M.b) * (1 - Math.min(v, yMax) / yMax)

  const tip = useTooltip()
  const dayTip = (d: string, i: number) => {
    if (open.has(d))
      return (
        <TipBody
          title={`${fmtDay(d)} · today`}
          note={liveText(bold[i]?.count ?? 0)}
        />
      )
    const r = bold[i]
    const perChain = chains.map((c): [ReactNode, ReactNode] => {
      const v = c.byDay.get(d)
      const row = rowFor(v, group)
      return [
        CHAIN_LABEL[c.chain],
        v ? `${fmtCount(row.count)} · ${fmtPct(row.index)}` : "not indexed",
      ]
    })
    const fired = systemic
      .filter((g) => g.day === d)
      .map((g) => {
        const f = shortBatchFacts(g, chains)
        return `Alert ${fmtHM(g.firedAt)} · Batch short on ${f.where} · ${shortBatchMetric(f)}`
      })
    const notes = fired
    return (
      <TipBody
        title={`${fmtDay(d)} · ${r?.index == null ? "baseline forming" : `${fmtPct(r.index)} of baseline`}`}
        rows={[["Statements", fmtCount(r?.count ?? 0)], ...perChain]}
        note={
          notes.length ? (
            <span className={fired.length ? "alert" : undefined}>
              {notes.join(" · ")}
            </span>
          ) : undefined
        }
      />
    )
  }

  const hi = hover ?? view.day
  const hiIdx = days.indexOf(hi)
  const hiRow = hiIdx >= 0 ? bold[hiIdx] : undefined
  const scopeLabel = scope === "all" ? "all chains" : CHAIN_LABEL[scope]

  let readout: ReactNode = " "
  if (hiRow && open.has(hi))
    readout = `${fmtDay(hi)} · today · ${liveText(hiRow.count)}`
  else if (hiRow)
    readout = (
      <>
        {fmtDay(hi)} · {fmtCount(hiRow.count)} statements ·{" "}
        <span className={isShort(hiRow.index) ? "short" : undefined}>
          {hiRow.index === null
            ? "baseline still forming"
            : `${fmtPct(hiRow.index)} of baseline`}
        </span>
      </>
    )

  return (
    <section className="section" id="completeness">
      <div className="section-head">
        <div>
          <h2>Batch completeness</h2>
          <p className="lede">
            {group === ALL
              ? `Each day's batch against its 14-day baseline (100). Bold line: ${scopeLabel}; thin lines: Coordinator groups.`
              : `Each day's batch against its 14-day baseline (100), for group ${group} on ${scopeLabel}.`}
          </p>
        </div>
      </div>
      <div className="sheet">
        <div className="chart-readout">{readout}</div>
        <svg
          className="wide-chart"
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label="Batch completeness index per day"
          onMouseLeave={() => setHover(null)}
        >
          {band[0] !== null && band[1] !== null && (
            <rect
              x={M.l}
              width={W - M.l - M.r}
              y={y(band[1])}
              height={Math.max(1, y(band[0]) - y(band[1]))}
              fill="rgba(20,20,20,0.05)"
            />
          )}
          {[0, 50, 100, 150, 200]
            .filter((v) => v <= yMax)
            .map((v) => (
              <g key={v}>
                <line
                  x1={M.l}
                  x2={W - M.r}
                  y1={y(v)}
                  y2={y(v)}
                  stroke={
                    v === 100 ? "rgba(20,20,20,0.25)" : "rgba(64,104,150,0.13)"
                  }
                  strokeDasharray={v === 100 ? undefined : "2 3"}
                />
                <text x={M.l - 8} y={y(v) + 4} textAnchor="end">
                  {v}
                </text>
              </g>
            ))}
          <line
            x1={M.l}
            x2={W - M.r}
            y1={y(SHORT_BATCH_RATIO * 100)}
            y2={y(SHORT_BATCH_RATIO * 100)}
            stroke="rgba(196,54,43,0.35)"
            strokeDasharray="4 4"
          />
          <text
            x={M.l + 6}
            y={y(SHORT_BATCH_RATIO * 100) - 5}
            className="t-stamp halo"
          >
            short below {SHORT_BATCH_RATIO * 100} · demo objective
          </text>

          {days.map((d, i) =>
            i % Math.ceil(days.length / 14) === 0 || d === hi ? (
              <text
                key={d}
                x={x(i)}
                y={H - 10}
                textAnchor="middle"
                className={d === hi ? "t-strong" : undefined}
              >
                {fmtDay(d)}
              </text>
            ) : null,
          )}

          {forming > 0 && (
            <text
              x={(x(0) + x(forming - 1)) / 2}
              y={y(75)}
              textAnchor="middle"
              className="t-ink"
            >
              baseline forming
            </text>
          )}
          {thin.map((t) => (
            <path
              key={t.key}
              d={linePath(t.pts, days, open, x, y)}
              fill="none"
              stroke="rgba(20,20,20,0.16)"
              strokeWidth={1}
            />
          ))}
          <path
            d={linePath(
              bold.map((r) => r.index),
              days,
              open,
              x,
              y,
            )}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={2.25}
            strokeLinejoin="round"
          />

          {systemic.map((g) => {
            const i = days.indexOf(g.day)
            const f = shortBatchFacts(g, chains)
            const everywhere =
              f.fired.length === chains.filter((c) => c.byDay.has(g.day)).length
            // The dot sits on the line it describes: the bold line when every
            // chain in view fired, otherwise the fired chains' own value.
            const index = everywhere ? (bold[i]?.index ?? null) : f.index
            if (index === null) return null
            const right = i > days.length * 0.6
            return (
              <g key={g.id}>
                <circle cx={x(i)} cy={y(index)} r={5} fill="var(--stamp)" />
                <text
                  x={x(i) + (right ? -10 : 10)}
                  y={y(index) + (everywhere ? 18 : -12)}
                  textAnchor={right ? "end" : "start"}
                  className="t-stamp halo"
                >
                  {everywhere ? "Batch short" : f.where} ·{" "}
                  {shortBatchMetric({ ...f, index })}
                </text>
              </g>
            )
          })}

          {days.map((d, i) =>
            open.has(d) ? (
              <text
                key={`today-${d}`}
                x={x(i) + step / 2}
                y={H - M.b - 8}
                textAnchor="end"
                className="t-rain halo"
              >
                today · {bold[i]?.count ? "in progress" : "not started"}
              </text>
            ) : null,
          )}

          {hiIdx >= 0 && (hover !== null || hi !== view.latest) && (
            <line
              x1={x(hiIdx)}
              x2={x(hiIdx)}
              y1={M.t}
              y2={H - M.b}
              stroke="var(--rain)"
              strokeOpacity={0.6}
            />
          )}
          {days.map((d, i) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: the day list is also reachable through the ledger rows
            <rect
              key={`hit-${d}`}
              x={x(i) - step / 2}
              width={step}
              y={M.t}
              height={H - M.t - M.b}
              fill="transparent"
              onMouseEnter={() => setHover(d)}
              onMouseMove={(e) => tip.show(e, dayTip(d, i))}
              onMouseLeave={tip.hide}
              onClick={() => view.setDay(d)}
              className="hit"
            />
          ))}
        </svg>
        <Tooltip bind={tip.bind} />
        <div className="source inset">
          Source: onchain statements. Grey band: p10–p90 of the normal days
          shown.
        </div>
      </div>
    </section>
  )
}
