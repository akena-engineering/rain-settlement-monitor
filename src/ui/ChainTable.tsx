import type { View } from "../App"
import { ChainName } from "./ChainLogo"
import { fmtCount, fmtDay, fmtDuration, fmtHM, fmtPct, fmtUsd } from "./format"
import {
  ALL,
  CHAIN_LABEL,
  RULE_LABEL,
  RULES,
  rowFor,
  ruleState,
  STATE_LABEL,
  totalChains,
} from "./model"
import { TipBody, Tooltip, useTooltip } from "./Tooltip"

export default function ChainTable({ view }: { view: View }) {
  const { group, day } = view
  const tip = useTooltip()
  const { coverage } = view.model.meta
  return (
    <section className="section" id="chains">
      <div className="section-head">
        <div>
          <h2>Chains · {fmtDay(day)}</h2>
          <p className="lede">
            The selected batch on each chain. Windows match to the minute on
            every chain.
          </p>
        </div>
      </div>
      <div className="sheet table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>Chain</th>
              <th className="wide-only">Batch window (UTC)</th>
              <th className="num">Statements</th>
              <th className="num">Of baseline</th>
              {view.usd && <th className="num">USD</th>}
              <th className="num">p50 / p95</th>
              <th className="num wide-only">Awaiting now</th>
              {RULES.map((rule) => (
                <th key={rule} className="rule-col">
                  {RULE_LABEL[rule]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.model.chains.map((c) => {
              // Group letters are per chain: other chains show their totals.
              const dim = view.scope !== "all" && view.scope !== c.chain
              const g = dim ? ALL : group
              const d = c.byDay.get(day)
              const b = c.snap.batches.find(
                (x) => x.day === day && x.group === g,
              )
              const r = d ? rowFor(d, g) : null
              const l = c.snap.latency.find(
                (x) => x.day === day && x.group === g,
              )
              const pending = c.snap.pending.filter(
                (p) => g === ALL || p.group === g,
              )
              return (
                <tr key={c.chain} className={dim ? "dim" : undefined}>
                  <td>
                    <ChainName chain={c.chain} label={CHAIN_LABEL[c.chain]} />
                  </td>
                  <td className="mono wide-only">
                    {b
                      ? `${fmtHM(b.primary.start)}–${fmtHM(b.primary.end)}`
                      : "no batch"}
                    {b?.secondary.length ? ` +${b.secondary.length} rerun` : ""}
                  </td>
                  <td className="num">{fmtCount(r?.count ?? 0)}</td>
                  <td className="num">{fmtPct(r?.index ?? null)}</td>
                  {view.usd && (
                    <td className="num">{fmtUsd(b?.primary.cents ?? 0)}</td>
                  )}
                  <td className="num">
                    {l ? `${fmtDuration(l.p50)} / ${fmtDuration(l.p95)}` : "—"}
                  </td>
                  <td className="num wide-only">{fmtCount(pending.length)}</td>
                  {RULES.map((rule) => {
                    const s = ruleState(c, day, rule)
                    const fired = c.alerts.find(
                      (a) => a.rule === rule && a.day === day && !a.open,
                    )
                    return (
                      <td
                        key={rule}
                        className="rule-col"
                        onMouseMove={(e) =>
                          tip.show(
                            e,
                            <TipBody
                              title={`${RULE_LABEL[rule]} · ${CHAIN_LABEL[c.chain]}`}
                              rows={[["State", STATE_LABEL[s]]]}
                              note={
                                s === "breached"
                                  ? fired?.detail
                                  : s === "warning"
                                    ? "Same signal, below the alert threshold"
                                    : s === "nodata"
                                      ? "Baseline still forming"
                                      : undefined
                              }
                            />,
                          )
                        }
                        onMouseLeave={tip.hide}
                      >
                        <span className={`state ${s}`}>{STATE_LABEL[s]}</span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="source">
        {coverage.indexed.length} of {totalChains(view.model.meta)} chains with
        Rain Coordinators indexed. {coverage.notYet.join(", ")}: not yet.
      </div>
      <Tooltip bind={tip.bind} />
    </section>
  )
}
