import { useCallback, useEffect, useMemo, useState } from "react"
import AlertsPanel from "./ui/AlertsPanel"
import BatchHeatmap from "./ui/BatchHeatmap"
import Cards from "./ui/Cards"
import ChainTable from "./ui/ChainTable"
import CompletenessChart from "./ui/CompletenessChart"
import Explainer from "./ui/Explainer"
import FreshnessBar from "./ui/FreshnessBar"
import HeroBars from "./ui/HeroBars"
import Intro from "./ui/Intro"
import LatencyPanel from "./ui/LatencyPanel"
import Methodology from "./ui/Methodology"
import {
  ALL,
  inScope,
  lastClosedDay,
  loadModel,
  type Model,
  type Scope,
} from "./ui/model"

export type View = {
  model: Model
  scope: Scope
  group: string
  usd: boolean
  day: string // selected closed day; every day-scoped panel follows it
  latest: string // last closed day, the default selection
  setDay: (d: string) => void
}

const SECTIONS = [
  ["completeness", "Batch completeness"],
  ["chains", "Chains"],
  ["ledger", "Daily close ledger"],
  ["latency", "Liquidation latency"],
  ["alerts", "Alerts"],
  ["method", "Methodology"],
] as const

/** The section whose heading is nearest the top of the viewport. */
function useActiveSection(ready: boolean) {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (!ready) return
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0]
        if (top) setActive(top.target.id)
      },
      { rootMargin: "-80px 0px -60% 0px" },
    )
    for (const [id] of SECTIONS) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [ready])
  return active
}

export default function App() {
  const [model, setModel] = useState<Model | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>("all")
  const [group, setGroup] = useState(ALL)
  const [usd, setUsd] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const active = useActiveSection(model !== null)
  // Video intro, opened with ?intro; the dashboard renders underneath.
  const [intro, setIntro] = useState(() =>
    new URLSearchParams(window.location.search).has("intro"),
  )
  const endIntro = useCallback(() => setIntro(false), [])

  useEffect(() => {
    loadModel()
      .then(setModel)
      .catch((e: unknown) => setError(String(e)))
  }, [])

  const closed = useMemo(
    () => (model ? lastClosedDay(inScope(model, "all")) : null),
    [model],
  )

  if (error)
    return <div className="page error">Could not load data: {error}</div>
  if (!model || !closed)
    return <div className="page loading">Loading onchain snapshots…</div>

  const view: View = {
    model,
    scope,
    group,
    usd,
    day: day ?? closed,
    latest: closed,
    // A batch still running has no closed numbers to inspect.
    setDay: (d) => {
      if (!model.openDays.has(d)) setDay(d)
    },
  }

  return (
    <div className="page">
      {intro && <Intro model={model} onDone={endIntro} />}
      <FreshnessBar
        model={model}
        scope={scope}
        setScope={(s) => {
          setScope(s)
          // Group letters are per chain; they mean nothing across chains.
          if (s === "all") setGroup(ALL)
        }}
        group={group}
        setGroup={setGroup}
        usd={usd}
        setUsd={setUsd}
        aside={<HeroBars view={view} />}
      >
        <Cards view={view} />
      </FreshnessBar>
      <Explainer model={model} />
      <nav className="index" aria-label="Sections">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={active === id ? "true" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <CompletenessChart view={view} />
      <ChainTable view={view} />
      <BatchHeatmap view={view} />
      <LatencyPanel view={view} />
      <AlertsPanel view={view} />
      <Methodology model={model} />
      <footer className="footer">
        Independent prototype by <a href="https://akena.co">Akena</a> · Public
        onchain data · Not affiliated with Rain.
      </footer>
    </div>
  )
}
