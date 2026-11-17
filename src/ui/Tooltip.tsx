import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

type Tip = { x: number; y: number; content: ReactNode } | null
type Bind = RefObject<(t: Tip) => void>

const HALF_WIDTH = 140 // keeps the tooltip inside the viewport near edges

/**
 * One tooltip per chart: show(e, content) on mousemove, hide on leave. The
 * state lives in <Tooltip bind={…}/>, so moving the pointer re-renders only
 * the tooltip, never the chart around it.
 */
export function useTooltip() {
  const bind: Bind = useRef<(t: Tip) => void>(() => {})
  const show = useCallback((e: MouseEvent, content: ReactNode) => {
    bind.current({ x: e.clientX, y: e.clientY, content })
  }, [])
  const hide = useCallback(() => bind.current(null), [])
  return { show, hide, bind }
}

export function Tooltip({ bind }: { bind: Bind }) {
  const [tip, setTip] = useState<Tip>(null)
  useLayoutEffect(() => {
    bind.current = setTip
  }, [bind])
  if (!tip) return null
  const x = Math.min(
    Math.max(tip.x, HALF_WIDTH),
    window.innerWidth - HALF_WIDTH,
  )
  return (
    <div className="tooltip" role="tooltip" style={{ left: x, top: tip.y }}>
      {tip.content}
    </div>
  )
}

/** Standard layout: a title line, then label/value rows. */
export function TipBody({
  title,
  rows,
  note,
}: {
  title: ReactNode
  rows?: [ReactNode, ReactNode][]
  note?: ReactNode
}) {
  return (
    <>
      <div className="tip-title">{title}</div>
      {rows?.map(([k, v], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static rows
        <div className="tip-row" key={i}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
      {note && <div className="tip-note">{note}</div>}
    </>
  )
}
