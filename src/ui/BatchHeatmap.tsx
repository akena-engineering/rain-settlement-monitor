import { type CSSProperties, useMemo } from "react"
import type { View } from "../App"
import { percentile } from "../core/settlement"
import { SHORT_BATCH_RATIO } from "../core/thresholds"
import { fmtCount, fmtDay, fmtHM, fmtPct } from "./format"
import {
  ALL,
  type ChainView,
  combinedRow,
  inScope,
  isShort,
  rangeDays,
  USUAL_START,
} from "./model"
import { TipBody, Tooltip, useTooltip } from "./Tooltip"

// 10-minute buckets from 13:00 to 18:00 UTC: the batch starts 13:20 at the
// earliest and the longest October runs end before 18:00.
const FIRST = 78
const COLS = 30
const HOURS = [13, 14, 15, 16, 17, 18]
const LEGEND_STEPS = [0.15, 0.35, 0.55, 0.75, 1]
const at = (bucket: number) => `${((bucket - FIRST) / COLS) * 100}%`
const CLOCK_1320 = at(80)

type Vars = CSSProperties & Record<`--${string}`, string | number>

const bucketLabel = (col: number) => {
  const start = (FIRST + col) * 600 // seconds since midnight
  return `${fmtHM(start)}–${fmtHM(start + 600)}`
}

/** Statements per day × 10-minute column, and the colour scale's top. */
function ledgerGrid(chains: ChainView[], days: string[], group: string) {
  const grid = new Map<string, number[]>()
  for (const d of days) grid.set(d, Array(COLS).fill(0))
  for (const c of chains)
    for (const b of c.snap.buckets) {
      const row = grid.get(b.day)
      const col = b.b - FIRST
      if (!row || col < 0 || col >= COLS) continue
      if (group !== ALL && b.group !== group) continue
      row[col] = (row[col] ?? 0) + b.s
    }
  const max =
    percentile(
      [...grid.values()].flat().filter((v) => v > 0),
      98,
    ) ?? 1
  return { grid, max }
}

export default function BatchHeatmap({ view }: { view: View }) {
  const { model, scope, group } = view
  const chains = useMemo(() => inScope(model, scope), [model, scope])
  const days = useMemo(() => rangeDays(chains).slice().reverse(), [chains])
  const { grid, max } = useMemo(
    () => ledgerGrid(chains, days, group),
    [chains, days, group],
  )
  const tip = useTooltip()

  const inProgress = model.openDays

  return (
    <section className="section" id="ledger">
      <div className="section-head">
        <div>
          <h2>Daily close ledger</h2>
          <p className="lede">
            Statements published every 10 minutes, one row per day. The pink
            line marks {USUAL_START}, the earliest usual start.
          </p>
        </div>
      </div>
      <div className="sheet close-ledger">
        <div className="hdr">Day</div>
        <div className="hdr axis">
          {HOURS.map((h) => (
            <span key={h} style={{ "--x": at(h * 6) } as Vars}>
              {h}:00
            </span>
          ))}
        </div>
        <div className="hdr right">Of baseline</div>

        {days.map((d) => {
          const cells = grid.get(d) ?? []
          const row = combinedRow(chains, d, group)
          const live = inProgress.has(d)
          const short = !live && isShort(row.index)
          const cls = ["row", d === view.day && "selected", short && "short"]
            .filter(Boolean)
            .join(" ")
          return (
            // biome-ignore lint/a11y/useSemanticElements: display:contents row inside a CSS grid
            <div
              key={d}
              role="button"
              tabIndex={live ? -1 : 0}
              aria-disabled={live || undefined}
              className={cls}
              onClick={() => view.setDay(d)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") view.setDay(d)
              }}
              onMouseLeave={tip.hide}
            >
              <div className="cell margin-l">
                <span className="date">{fmtDay(d)}</span>
                {live && <span className="today">today</span>}
              </div>
              <div className="cell strip">
                {cells.map((v, i) => (
                  // biome-ignore lint/a11y/noStaticElementInteractions: hover-only detail; the row itself is the keyboard target
                  <i
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed time axis
                    key={i}
                    className={v ? undefined : "empty"}
                    style={
                      {
                        "--v": Math.sqrt(Math.min(1, v / max)).toFixed(3),
                      } as Vars
                    }
                    onMouseMove={(e) =>
                      tip.show(
                        e,
                        <TipBody
                          title={`${fmtDay(d)} · ${bucketLabel(i)} UTC`}
                          rows={[["Statements published", fmtCount(v)]]}
                          note={
                            i + FIRST === 80
                              ? `${USUAL_START}: earliest usual start of the batch`
                              : undefined
                          }
                        />,
                      )
                    }
                  />
                ))}
                <span
                  className="clock-guide"
                  style={{ "--x": CLOCK_1320 } as Vars}
                />
              </div>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-only detail; the row itself is the keyboard target */}
              <div
                className="cell margin-r"
                onMouseMove={(e) =>
                  tip.show(
                    e,
                    <TipBody
                      title={`${fmtDay(d)} · primary batch`}
                      rows={[
                        ["Statements", fmtCount(row.count)],
                        [
                          "Baseline",
                          row.baseline === null
                            ? "forming"
                            : fmtCount(Math.round(row.baseline)),
                        ],
                        ["Of baseline", fmtPct(row.index)],
                      ]}
                      note={
                        short ? (
                          <span className="alert">
                            Short batch: below {SHORT_BATCH_RATIO * 100}% of
                            baseline
                          </span>
                        ) : live ? (
                          "Batch not complete yet"
                        ) : undefined
                      }
                    />,
                  )
                }
              >
                {live ? (
                  <span className="stamp quiet">
                    {row.count ? "in progress" : "not started"}
                  </span>
                ) : row.index === null ? (
                  <span className="stamp quiet">forming</span>
                ) : (
                  <span className={short ? "stamp" : "stamp soft"}>
                    {row.index}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="source ledger-legend">
        <span>Statements per 10 min</span>
        <span className="swatches" aria-hidden="true">
          {LEGEND_STEPS.map((s) => (
            <i key={s} style={{ "--v": s } as Vars} />
          ))}
        </span>
        <span>
          1 → {fmtCount(Math.round(max))}+ · Source: onchain statements
        </span>
      </div>
      <Tooltip bind={tip.bind} />
    </section>
  )
}
