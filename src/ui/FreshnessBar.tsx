import { type ReactNode, useEffect, useRef, useState } from "react"
import BrandMark from "./BrandMark"
import ChainLogo, { ChainName } from "./ChainLogo"
import { fmtCount, fmtStamp } from "./format"
import {
  ALL,
  CHAIN_LABEL,
  groupLetters,
  indexedThrough,
  type Model,
  type Scope,
  totalChains,
  USUAL_START,
} from "./model"
import RainBackdrop from "./RainBackdrop"

type Props = {
  model: Model
  scope: Scope
  setScope: (s: Scope) => void
  group: string
  setGroup: (g: string) => void
  usd: boolean
  setUsd: (b: boolean) => void
  children?: ReactNode
  aside?: ReactNode
}

export default function FreshnessBar(p: Props) {
  const { meta } = p.model

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Settlement Monitor</span>
          <span className="brand-for">for Rain</span>
        </div>
        <div className="freshness">
          Indexed through <b>{fmtStamp(indexedThrough(p.model.chains))}</b>
          <span className="sep">·</span>
          {meta.coverage.indexed.map((c) => (
            <span
              key={c}
              title={`${CHAIN_LABEL[c]} · block ${fmtCount(meta.indexedThrough[c]?.block ?? 0)}`}
            >
              <ChainLogo chain={c} size={14} />
            </span>
          ))}
          <span className="sep">·</span>
          <span title={`Not yet: ${meta.coverage.notYet.join(", ")}`}>
            {meta.coverage.indexed.length} of {totalChains(meta)} chains
          </span>
        </div>
      </header>
      <section className="hero">
        <RainBackdrop />
        <div className="hero-copy">
          <h1>Did the last settlement batch arrive complete?</h1>
          <p className="hero-lede">
            Rain settles card statements onchain once a day, starting from about{" "}
            {USUAL_START}. This monitor tracks each batch from public data: how
            complete, how fast, and what is still awaiting liquidation.
          </p>
        </div>
        {p.aside}
        <Controls {...p} />
        {p.children}
      </section>
    </>
  )
}

function Controls(p: Props) {
  return (
    <div className="controls">
      <fieldset className="seg" aria-label="Chains">
        {(["all", ...p.model.meta.coverage.indexed] as Scope[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={p.scope === s}
            onClick={() => p.setScope(s)}
          >
            {s === "all" ? (
              "All chains"
            ) : (
              <ChainName chain={s} label={CHAIN_LABEL[s]} />
            )}
          </button>
        ))}
      </fieldset>
      <GroupPicker {...p} />
      <button
        type="button"
        className="toggle"
        aria-pressed={p.usd}
        onClick={() => p.setUsd(!p.usd)}
      >
        <span className="box" aria-hidden>
          {p.usd ? "✓" : ""}
        </span>
        USD as liquidated onchain (cents/100)
      </button>
    </div>
  )
}

function GroupPicker(p: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const chain = p.model.chains.find((c) => c.chain === p.scope)
  const letters = chain ? groupLetters(chain) : []

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", close)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", close)
    }
  }, [open])

  const pick = (g: string) => {
    p.setGroup(g)
    setOpen(false)
  }

  return (
    <div className="picker" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        disabled={p.scope === "all"}
        title={
          p.scope === "all"
            ? "Pick one chain to filter by Coordinator group"
            : undefined
        }
        onClick={() => setOpen(!open)}
      >
        Coordinator group <b>{p.group === ALL ? "All" : p.group}</b> ▾
      </button>
      {open && (
        <div className="menu">
          <button
            type="button"
            className="all"
            aria-pressed={p.group === ALL}
            onClick={() => pick(ALL)}
          >
            All groups
          </button>
          {letters.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={p.group === g}
              onClick={() => pick(g)}
            >
              {g}
            </button>
          ))}
          <div className="note">
            Grouped by contract, without program names; mapping not attempted.
            Letters are per chain, ordered by volume.
          </div>
        </div>
      )}
    </div>
  )
}
