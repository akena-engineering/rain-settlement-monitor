// Video intro, opened with ?intro. It explains the page in six scenes;
// each plays its part of the animation and waits for a click (or Space,
// Enter, →) before the next. Esc or "Skip intro" opens the dashboard.
// Canvas 2D for the dots, HTML for the captions.
import { useCallback, useEffect, useRef, useState } from "react"
import { LATENCY_BIN_LABELS, LATENCY_BINS } from "../data/snapshot"
import { fmtDuration, fmtRange } from "./format"
import { ALL, CHAIN_LABEL, type Model } from "./model"

const DAY = "2026-11-05"
const MAX_DOTS = 3000 // the day has ~7.8k statements; a sample reads better
// Animation clock (ms): 24 h of the day, then the fall into the histogram.
const PLAY_MS = 6500
const FALL_MS = 2600
const T_FALL = PLAY_MS
const T_OUTRO = T_FALL + FALL_MS
const FADE_MS = 500
// Real latency is about a minute, invisible at this speed: dots travel for a
// fixed hour of simulated time plus a stretched latency, so motion reads.
const TRAVEL_BASE = 3600
const TRAVEL_PER_LATENCY_SEC = 20

type Scene = "title" | "quiet" | "batch" | "paid" | "latency" | "outro"
const SCENES: Scene[] = ["title", "quiet", "batch", "paid", "latency", "outro"]
const hourAt = (h: number) => (PLAY_MS * h) / 24
// Where the animation clock stops in each scene; a click moves on.
const STOP: Record<Scene, number> = {
  title: 0,
  quiet: hourAt(13),
  batch: hourAt(14.4),
  paid: T_FALL,
  latency: T_OUTRO,
  outro: T_OUTRO,
}

/** Seeded PRNG (mulberry32), so the video is the same every run. */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Dots = {
  n: number
  lane: Uint8Array
  publish: Float32Array // seconds of day
  travel: Float32Array // simulated seconds to reach "paid"
  bin: Uint8Array // latency histogram bin
  jitter: Float32Array // -1..1
  stack: Uint16Array // position inside its histogram column
}

function buildDots(model: Model): { dots: Dots; binCounts: number[] } {
  const rand = rng(20261105)
  const total = model.chains.reduce(
    (a, c) =>
      a +
      c.snap.buckets.filter((b) => b.day === DAY).reduce((x, b) => x + b.s, 0),
    0,
  )
  const keep = Math.min(1, MAX_DOTS / Math.max(1, total))
  const lane: number[] = []
  const publish: number[] = []
  const travel: number[] = []
  const bin: number[] = []
  model.chains.forEach((c, li) => {
    const lat = c.snap.latency.find((l) => l.day === DAY && l.group === ALL)
    const bins = lat?.bins ?? []
    const binTotal = bins.reduce((a, b) => a + b, 0)
    for (const b of c.snap.buckets) {
      if (b.day !== DAY) continue
      for (let k = 0; k < b.s; k++) {
        if (rand() > keep) continue
        // Latency: pick a bin by weight, then a value inside it.
        let r = rand() * binTotal
        let i = 0
        while (i < bins.length - 1 && r >= (bins[i] ?? 0)) r -= bins[i++] ?? 0
        const lo = i === 0 ? 0 : (LATENCY_BINS[i - 1] ?? 0)
        const hi = Math.min(LATENCY_BINS[i] ?? lo * 2, lo * 2 + 60)
        lane.push(li)
        publish.push(b.b * 600 + rand() * 600)
        travel.push(
          TRAVEL_BASE + (lo + rand() * (hi - lo)) * TRAVEL_PER_LATENCY_SEC,
        )
        bin.push(i)
      }
    }
  })
  const n = lane.length
  const binCounts = LATENCY_BINS.map(() => 0)
  const stack = new Uint16Array(n)
  for (let i = 0; i < n; i++) {
    const b = bin[i] ?? 0
    stack[i] = binCounts[b] ?? 0
    binCounts[b] = (binCounts[b] ?? 0) + 1
  }
  return {
    dots: {
      n,
      lane: Uint8Array.from(lane),
      publish: Float32Array.from(publish),
      travel: Float32Array.from(travel),
      bin: Uint8Array.from(bin),
      jitter: Float32Array.from({ length: n }, () => rand() * 2 - 1),
      stack,
    },
    binCounts,
  }
}

const ease = (k: number) => 1 - (1 - k) ** 3
const clamp01 = (k: number) => Math.min(1, Math.max(0, k))

export default function Intro({
  model,
  onDone,
}: {
  model: Model
  onDone: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const scene = SCENES[step] ?? "outro"
  const sceneRef = useRef<Scene>("title")
  sceneRef.current = scene
  const fadeAt = useRef<number | null>(null)
  const lat = model.chains.flatMap((c) =>
    c.snap.latency.filter((l) => l.day === DAY && l.group === ALL),
  )
  const p50 = fmtRange(
    lat.map((l) => l.p50),
    fmtDuration,
  )
  const p95 = fmtRange(
    lat.map((l) => l.p95),
    fmtDuration,
  )
  const skip = useCallback(() => onDone(), [onDone])
  const last = step === SCENES.length - 1
  // Next scene; after the last one, fade into the dashboard.
  const next = useCallback(() => {
    if (last) fadeAt.current ??= performance.now()
    else setStep((s) => Math.min(s + 1, SCENES.length - 1))
  }, [last])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip()
      else if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [skip, next])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone()
      return
    }
    const { dots, binCounts } = buildDots(model)
    const labels = model.chains.map((c) => CHAIN_LABEL[c.chain])
    const used = binCounts.flatMap((c, i) => (c > 0 ? [i] : []))
    const maxBin = Math.max(1, ...binCounts)

    let w = 0
    let h = 0
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    // The animation clock runs only until the current scene's stop.
    let t = 0
    let prev = performance.now()
    let frame = 0
    const draw = (now: number) => {
      t = Math.min(STOP[sceneRef.current], t + Math.min(50, now - prev))
      prev = now
      const sim = clamp01(t / PLAY_MS) * 86400
      const fall = ease(clamp01((t - T_FALL) / FALL_MS))
      const fade =
        fadeAt.current === null ? 0 : clamp01((now - fadeAt.current) / FADE_MS)
      if (wrap.current) wrap.current.style.opacity = String(1 - fade)

      const sky = ctx.createLinearGradient(0, 0, w * 0.6, h)
      sky.addColorStop(0, "#c3cfdb")
      sky.addColorStop(0.42, "#b7c4d1")
      sky.addColorStop(1, "#93a3b8")
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      const padX = Math.max(48, w * 0.08)
      const left = padX + 130
      const right = w - padX - 20
      const laneTop = h * 0.36
      const laneH = (h * 0.36) / Math.max(1, labels.length)
      const histBase = h * 0.8
      const histH = h * 0.36
      const colW = (right - left) / Math.max(1, used.length)

      // Lanes, edges and their meaning (fade out as the histogram forms).
      ctx.globalAlpha = 1 - fall
      ctx.lineWidth = 1
      ctx.font = "600 15px 'Inter Tight', sans-serif"
      labels.forEach((label, i) => {
        const cy = laneTop + laneH * (i + 0.5)
        ctx.fillStyle = "#fff"
        ctx.fillText(label, padX, cy + 5)
        ctx.strokeStyle = "rgba(255,255,255,0.3)"
        ctx.beginPath()
        ctx.moveTo(left, cy)
        ctx.lineTo(right, cy)
        ctx.stroke()
      })
      ctx.strokeStyle = "rgba(18,18,18,0.25)"
      for (const x of [left, right]) {
        ctx.beginPath()
        ctx.moveTo(x, laneTop - 8)
        ctx.lineTo(x, laneTop + laneH * labels.length + 8)
        ctx.stroke()
      }
      ctx.font = "500 12px 'IBM Plex Mono', monospace"
      ctx.fillStyle = "rgba(18,18,18,0.7)"
      ctx.fillText("statement published", left, laneTop - 16)
      ctx.textAlign = "right"
      ctx.fillText("paid from collateral", right, laneTop - 16)
      ctx.textAlign = "left"

      // The day's clock along the bottom, with the 13:20 batch marked.
      const barY = laneTop + laneH * labels.length + 44
      ctx.fillStyle = "rgba(255,255,255,0.35)"
      ctx.fillRect(left, barY, right - left, 3)
      ctx.fillStyle = "#fff"
      ctx.fillRect(left, barY, ((right - left) * sim) / 86400, 3)
      const mark = left + ((right - left) * (13 * 3600 + 20 * 60)) / 86400
      ctx.fillStyle = "#ff2fb6"
      ctx.fillRect(mark - 1, barY - 6, 2, 15)
      ctx.font = "500 11px 'IBM Plex Mono', monospace"
      ctx.fillStyle = "rgba(18,18,18,0.7)"
      for (const hr of [0, 6, 12, 18, 24]) {
        const x = left + ((right - left) * hr) / 24
        ctx.textAlign = hr === 24 ? "right" : hr === 0 ? "left" : "center"
        ctx.fillText(`${String(hr).padStart(2, "0")}:00`, x, barY + 22)
      }
      ctx.textAlign = "center"
      ctx.fillStyle = "#ff2fb6"
      ctx.fillText("13:20 batch", mark, barY - 12)
      ctx.textAlign = "left"
      ctx.globalAlpha = 1

      for (let i = 0; i < dots.n; i++) {
        const pub = dots.publish[i] ?? 0
        if (sim < pub) continue
        const li = dots.lane[i] ?? 0
        const j = dots.jitter[i] ?? 0
        const p = clamp01((sim - pub) / (dots.travel[i] ?? 1))
        // Paid dots rest in a narrow band before the right edge.
        const lx =
          left +
          ease(p) * (right - left) -
          (p === 1 ? Math.abs(dots.jitter[(i * 7) % dots.n] ?? 0) * 26 : 0)
        const ly = laneTop + laneH * (li + 0.5) + j * laneH * 0.34
        let x = lx
        let y = ly
        if (fall > 0) {
          const col = used.indexOf(dots.bin[i] ?? 0)
          const tx = left + colW * (col + 0.5) + j * colW * 0.3
          const ty = histBase - ((dots.stack[i] ?? 0) / maxBin) * histH
          x = lx + (tx - lx) * fall
          y = ly + (ty - ly) * fall
        }
        ctx.fillStyle =
          p < 1 && fall === 0
            ? "rgba(255,47,182,0.95)"
            : "rgba(255,255,255,0.9)"
        ctx.beginPath()
        ctx.arc(x, y, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }

      // Histogram axis labels once the dots have landed.
      const lab = clamp01((t - T_FALL - FALL_MS * 0.6) / (FALL_MS * 0.4))
      if (lab > 0) {
        ctx.globalAlpha = lab
        ctx.font = "500 12px 'IBM Plex Mono', monospace"
        ctx.fillStyle = "rgba(18,18,18,0.75)"
        ctx.textAlign = "center"
        used.forEach((b, col) => {
          ctx.fillText(
            LATENCY_BIN_LABELS[b] ?? "",
            left + colW * (col + 0.5),
            histBase + 22,
          )
        })
        ctx.textAlign = "left"
        ctx.globalAlpha = 1
      }

      if (fade < 1) frame = requestAnimationFrame(draw)
      else onDone()
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
    }
  }, [model, onDone])

  const captions: Record<
    Scene,
    { kicker: string; text: string; detail?: string }
  > = {
    title: {
      kicker: "Settlement Monitor for Rain",
      text: "Every day, Rain settles its cardholders' spending onchain. Here is one day, 5 November, on three chains.",
    },
    quiet: {
      kicker: "00:00–13:00 UTC",
      text: "Most of the day is quiet. Each dot will be one card statement.",
    },
    batch: {
      kicker: "13:20 UTC · the daily batch",
      text: "Rain's contracts publish thousands of statements at once, on all three chains.",
    },
    paid: {
      kicker: "About a minute later",
      text: "Each statement is paid from the cardholder's collateral. Pink: published, white: paid.",
    },
    latency: {
      kicker: "Time to pay",
      text: "Most statements are paid within a minute.",
      detail: `p50 ${p50} · p95 ${p95} · by chain, 5 Nov`,
    },
    outro: {
      kicker: "What this page does",
      text: "It checks every daily batch from public chain data: did it arrive complete, on time, and paid?",
    },
  }
  const c = captions[scene]

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Space, Enter and → advance from the keyboard
    // biome-ignore lint/a11y/noStaticElementInteractions: a click anywhere advances the intro
    <div className="intro" ref={wrap} onClick={next}>
      <canvas ref={ref} />
      <div className="intro-caption" key={scene}>
        <div className="kicker">{c.kicker}</div>
        <div className="text">{c.text}</div>
        {c.detail && <div className="detail">{c.detail}</div>}
      </div>
      <div className="intro-hint" aria-live="polite">
        <span className="dots" aria-hidden="true">
          {SCENES.map((s, i) => (
            <i key={s} className={i <= step ? "on" : undefined} />
          ))}
        </span>
        {last ? "Click to open the dashboard" : "Click to continue"}
        <span className="muted">
          {" "}
          · {step + 1} / {SCENES.length}
        </span>
      </div>
      <button
        type="button"
        className="intro-skip"
        onClick={(e) => {
          e.stopPropagation()
          skip()
        }}
      >
        Skip intro ›
      </button>
    </div>
  )
}
