import { useEffect, useRef } from "react"

type Drop = { x: number; y: number; len: number; speed: number; alpha: number }

const DENSITY = 1 / 9000 // drops per px² of hero
const SLANT = 0.18 // horizontal drift per unit of fall

/**
 * Light rain behind the hero: thin white streaks, low contrast. A visual nod
 * to the name only, it carries no data. Static with prefers-reduced-motion,
 * paused while the hero is off screen.
 */
export default function RainBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let drops: Drop[] = []
    let w = 0
    let h = 0
    let frame = 0
    let visible = true

    const spawn = (y = Math.random() * h): Drop => ({
      x: Math.random() * (w + h * SLANT) - h * SLANT,
      y,
      len: 10 + Math.random() * 18,
      speed: 3 + Math.random() * 4,
      alpha: 0.18 + Math.random() * 0.32,
    })

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drops = Array.from({ length: Math.round(w * h * DENSITY) }, () => spawn())
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1
      ctx.lineCap = "round"
      for (const d of drops) {
        ctx.strokeStyle = `rgba(255,255,255,${d.alpha})`
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x + d.len * SLANT, d.y + d.len)
        ctx.stroke()
      }
    }

    const tick = () => {
      for (const d of drops) {
        d.y += d.speed
        d.x += d.speed * SLANT
        if (d.y > h) Object.assign(d, spawn(-d.len))
      }
      draw()
      frame = visible ? requestAnimationFrame(tick) : 0
    }

    resize()
    draw()
    const ro = new ResizeObserver(() => {
      resize()
      draw()
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
      if (visible && !still && !frame) frame = requestAnimationFrame(tick)
    })
    io.observe(canvas)
    if (!still) frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      io.disconnect()
    }
  }, [])

  return (
    <div className="rain-backdrop" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  )
}
