import { useState } from "react"
import type { View } from "../App"
import { median } from "../core/baseline"
import { SHORT_BATCH_RATIO } from "../core/thresholds"
import { fmtCount, fmtDay, fmtPct } from "./format"
import {
  batchWindow,
  combinedRow,
  inScope,
  isShort,
  liveText,
  rangeDays,
} from "./model"
import { TipBody, Tooltip, useTooltip } from "./Tooltip"

const DAYS = 14

/**
 * The last 14 daily batches, in the hero where rain.xyz shows its globe.
 * Hover or focus reads a day out; click selects it for the panels below.
 */
export default function HeroBars({ view }: { view: View }) {
  const [hover, setHover] = useState<string | null>(null)
  const chains = inScope(view.model, view.scope)
  const rows = rangeDays(chains)
    .slice(-DAYS)
    .map((d) => {
      const r = combinedRow(chains, d, view.group)
      const live = view.model.openDays.has(d)
      return {
        day: d,
        ...r,
        live,
        short: !live && isShort(r.index),
        window: batchWindow(chains, d, view.group),
      }
    })
  const baseline = median(
    rows.flatMap((r) => (r.baseline !== null ? [r.baseline] : [])),
  )
  const max = Math.max(1, baseline ?? 0, ...rows.map((r) => r.count))
  const shown =
    rows.find((r) => r.day === (hover ?? view.day)) ?? rows.at(-1) ?? null
  const tip = useTooltip()
  const barTip = (r: (typeof rows)[number]) =>
    r.live ? (
      <TipBody title={`${fmtDay(r.day)} · today`} note={liveText(r.count)} />
    ) : (
      <TipBody
        title={fmtDay(r.day)}
        rows={[
          ["Statements", fmtCount(r.count)],
          ["Of baseline", r.index === null ? "forming" : fmtPct(r.index)],
          ["Batch window", r.window ?? "—"],
        ]}
        note={
          r.short ? (
            <span className="alert">
              Short batch: below {SHORT_BATCH_RATIO * 100}% of baseline
            </span>
          ) : (
            "Click to inspect this day"
          )
        }
      />
    )

  return (
    <figure className="hero-bars" aria-label="Statements per daily batch">
      <div className="readout" aria-live="polite">
        {shown && (
          <>
            <span className="day">{fmtDay(shown.day)}</span>
            {shown.live ? (
              <span className="pct">{liveText(shown.count)}</span>
            ) : (
              <>
                <span className="value">
                  {fmtCount(shown.count)}
                  <small> statements</small>
                </span>
                <span className={shown.short ? "pct short" : "pct"}>
                  {shown.index === null
                    ? "baseline forming"
                    : `${fmtPct(shown.index)} of baseline`}
                  {shown.window && ` · ${shown.window}`}
                </span>
              </>
            )}
          </>
        )}
      </div>
      <div className="bars">
        {baseline !== null && (
          <span
            className="baseline"
            style={{ bottom: `${(100 * baseline) / max}%` }}
          >
            <em>baseline</em>
          </span>
        )}
        {rows.map((r) => (
          <button
            type="button"
            key={r.day}
            className={[
              "bar",
              r.short && "short",
              r.live && "live",
              r.day === (hover ?? view.day) && "active",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ height: `${Math.max(3, (100 * r.count) / max)}%` }}
            onMouseEnter={() => setHover(r.day)}
            onMouseMove={(e) => tip.show(e, barTip(r))}
            onMouseLeave={() => {
              setHover(null)
              tip.hide()
            }}
            onFocus={() => setHover(r.day)}
            onBlur={() => setHover(null)}
            onClick={() => view.setDay(r.day)}
            aria-disabled={r.live || undefined}
            aria-label={`${fmtDay(r.day)}: ${fmtCount(r.count)} statements`}
            aria-pressed={r.day === view.day}
          />
        ))}
      </div>
      <figcaption>
        <span>{rows[0] ? fmtDay(rows[0].day) : ""}</span>
        <span>statements per daily batch</span>
        <span>today</span>
      </figcaption>
      <Tooltip bind={tip.bind} />
    </figure>
  )
}
