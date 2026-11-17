import { TOPICS } from "../chain/abi"
import { CHAIN_LABEL, type Model } from "./model"

export default function Methodology({ model }: { model: Model }) {
  const { meta } = model
  return (
    <details className="method" id="method">
      <summary>Methodology</summary>
      <div className="method-grid">
        <div>
          <h3>Events</h3>
          <ul>
            <li>
              <code>StatementPublished</code> (two versions):{" "}
              <code>{TOPICS.statementPublishedV1}</code> and, for Coordinator
              2.04, <code>{TOPICS.statementPublishedV2}</code>
            </li>
            <li>
              <code>Liquidation</code>: <code>{TOPICS.liquidation}</code>
            </li>
            <li>
              <code>Withdrawal</code>: <code>{TOPICS.withdrawal}</code>: indexed
              from known Coordinators only, not shown on this page
            </li>
          </ul>
          <h3>Join and settlement</h3>
          <p>
            A Liquidation belongs to a statement when its indexed statementId
            hash equals the StatementPublished one on the same Coordinator. A
            statement is settled when the sum of netAmountCents reaches the
            closing balance; empty-collateral retries (0 cents) count as
            attempts. Latency is measured to the Liquidation that completes
            payment.
          </p>
          <h3>Units</h3>
          <p>
            USD = cents / 100. Checked on liquidations in USDC and USDT across
            chains: amountsNative / 10^decimals × 100 equals amountsCents and
            matches the ERC-20 Transfer.
          </p>
          <h3>Batches and baselines</h3>
          <p>
            Statements more than 45 min apart start a new batch; the largest
            batch of a UTC day is primary, smaller reruns are secondary. A
            group's baseline is the median of its previous 14 primary batches
            within 28 days, excluding days already flagged short. Groups with
            fewer than 7 batches are new and excluded from the systemic rule.
          </p>
          <h3>What onchain data cannot show</h3>
          <p>
            Card authorizations, clearing with the card network, merchant payout
            and program identities. This view covers the onchain leg only:
            statement publication and collateral liquidation.
          </p>
        </div>
        <div>
          <h3>Coverage and RPCs</h3>
          <p>
            Indexed:{" "}
            {meta.coverage.indexed.map((c) => CHAIN_LABEL[c]).join(", ")}. Not
            yet: {meta.coverage.notYet.join(", ")}.{" "}
            {meta.coverage.notes.join(" ")} Public RPCs only (Tenderly public
            gateways, arb1, publicnode); no API keys, no Rain API.
          </p>
          <h3>Coordinator groups</h3>
          <p className="muted">
            Grouped by contract, without program names; mapping not attempted.
            Groups are lettered per chain by statement volume.
          </p>
          <div className="addr-list">
            {meta.coverage.indexed.map((c) => {
              const active = new Set(
                model.chains
                  .find((v) => v.chain === c)
                  ?.snap.batches.map((b) => b.group),
              )
              return (
                <div key={c} className="addr-chain">
                  <div className="addr-title">{CHAIN_LABEL[c]}</div>
                  {meta.groups[c]
                    .filter((g) => active.has(g.group))
                    .map((g) => (
                      <div key={g.address}>
                        {g.group.padEnd(3, " ")} {g.address}{" "}
                        {g.version === "2.04" ? "2.04" : "older"}
                      </div>
                    ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </details>
  )
}
