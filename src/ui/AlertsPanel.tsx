import { useState } from "react"
import type { View } from "../App"
import type { Alert } from "../core/alerts"
import {
  BATCH_GAP_MIN,
  LATE_BATCH_GRACE_MIN,
  P95_MULTIPLIER,
  SHORT_BATCH_RATIO,
  SLOW_LIQUIDATION_SEC,
  SYSTEMIC_TENANT_SHARE,
  WARNING_INDEX,
  WARNING_SHORT_GROUPS,
} from "../core/thresholds"
import { ChainName } from "./ChainLogo"
import { fmtAge, fmtDay, fmtHM } from "./format"
import {
  type AlertGroup,
  CHAIN_LABEL,
  type ChainView,
  chainList,
  groupAlerts,
  inScope,
  RULE_LABEL,
  RULES,
  ruleState,
  STATE_LABEL,
  shortBatchFacts,
  shortBatchMetric,
} from "./model"

const RULE_TEXT: Record<Alert["rule"], string> = {
  "systemic-short-batch": `Batch below ${SHORT_BATCH_RATIO * 100}% of baseline for at least ${SYSTEMIC_TENANT_SHARE * 100}% of established groups on a chain, once the batch closes (${BATCH_GAP_MIN} min without a new statement). Warning below ${WARNING_INDEX}%, or with ${WARNING_SHORT_GROUPS}+ short groups.`,
  "late-batch": `No primary batch started by the latest baseline start + ${LATE_BATCH_GRACE_MIN} min.`,
  "slow-liquidation": `A statement liquidated, or still awaiting liquidation, more than ${fmtAge(SLOW_LIQUIDATION_SEC)} after publication.`,
  "latency-p95": `The day's liquidation p95 above ${P95_MULTIPLIER}× the baseline p95.`,
}

/** The line under the rule name; the chains are already named beside it. */
function historyDetail(g: AlertGroup, chains: ChainView[]): string {
  if (g.rule === "systemic-short-batch")
    return shortBatchMetric(shortBatchFacts(g, chains))
  const open = g.alerts.find((a) => a.open)?.open
  if (open)
    return `Awaiting liquidation · ${open.count} open, oldest ${fmtAge(open.oldestAgeSec)}`
  return g.alerts[0]?.detail ?? ""
}

export default function AlertsPanel({ view }: { view: View }) {
  const chains = inScope(view.model, view.scope)
  const history = groupAlerts(chains)
  // Default: the widest systemic alert (most chains), latest first.
  const widest = history
    .filter((g) => g.rule === "systemic-short-batch")
    .sort((a, b) => b.alerts.length - a.alerts.length)[0]
  const [picked, setPicked] = useState<string | null>(null)
  const selected = history.find((g) => g.id === picked) ?? widest ?? history[0]

  return (
    <section className="section" id="alerts">
      <div className="section-head">
        <div>
          <h2>Alerts</h2>
          <p className="lede">
            Four rules, replayed over every indexed day. States are for{" "}
            {fmtDay(view.day)}. Thresholds are demo objectives.
          </p>
        </div>
      </div>
      <div className="alerts">
        <div className="sheet">
          {RULES.map((rule) => (
            <div className="rule" key={rule}>
              <div className="name">
                {RULE_LABEL[rule]}
                <span className="objective">demo objective</span>
              </div>
              <div className="desc">{RULE_TEXT[rule]}</div>
              <div className="states">
                {view.model.chains.map((c) => {
                  const s = ruleState(c, view.day, rule)
                  return (
                    <span key={c.chain}>
                      <ChainName chain={c.chain} label={CHAIN_LABEL[c.chain]} />{" "}
                      <span className={`state ${s}`}>{STATE_LABEL[s]}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="sheet history">
            <div className="history-list">
              {history.length === 0 && (
                <div className="rule muted">No alerts in the indexed data.</div>
              )}
              {history.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={g.id === selected?.id}
                  onClick={() => {
                    setPicked(g.id)
                    view.setDay(g.day)
                  }}
                >
                  <span className="when">
                    {fmtDay(g.day)} {fmtHM(g.firedAt)}
                  </span>
                  <span className="what">
                    <span className={`rule-name ${g.rule}`}>
                      {RULE_LABEL[g.rule]}
                    </span>
                    <span className="muted"> · {chainList(g.alerts)}</span>
                    <br />
                    <span className="muted">{historyDetail(g, chains)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
