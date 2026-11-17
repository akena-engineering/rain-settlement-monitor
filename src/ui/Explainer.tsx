import { type Model, totalChains, USUAL_START } from "./model"

/** Plain-language "what is this page" block, right under the hero. */
export default function Explainer({ model }: { model: Model }) {
  const { coverage } = model.meta
  const steps = [
    {
      title: "Rain publishes statements",
      text: `Once a day, from about ${USUAL_START}, Rain's contracts publish every cardholder's statement onchain.`,
    },
    {
      title: "Collateral pays them",
      text: "About a minute later, each statement is paid (liquidated) from the cardholder's collateral.",
    },
    {
      title: "This page checks each batch",
      text: "Every daily batch is compared with its own 14-day baseline: complete, on time, fully paid. Four rules flag what is unusual.",
    },
  ]
  return (
    <section className="explainer" aria-labelledby="explainer-h">
      <h2 id="explainer-h">How it works</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
            <b>{s.title}</b>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
      <p className="why">
        <b>Why it exists.</b> The chain records every settlement, so it can
        confirm a batch independently of any internal system or status page.
        Akena built this prototype from public data only, on{" "}
        {coverage.indexed.length} of the {totalChains(model.meta)} chains where
        Rain settles, to show what that monitoring looks like.
      </p>
    </section>
  )
}
