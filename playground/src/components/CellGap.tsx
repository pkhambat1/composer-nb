// components/CellGap.tsx — The space between two cells, where a + shows on hover. It adds a
// music or a text cell right there, as the toolbar's + adds one at the end.
import React from "react"
import type { CellType } from "../shared/types.ts"

export default function CellGap({ onAdd }: { onAdd: (type: CellType) => void }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const add = (type: CellType) => {
    setOpen(false)
    onAdd(type)
  }

  return (
    <div className={"cell-gap" + (open ? " cell-gap-open" : "")} ref={ref}>
      <button
        type="button"
        className="cell-gap-btn"
        title="Add a cell here"
        aria-label="Add a cell here"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M5 1.5v7M1.5 5h7" />
        </svg>
      </button>
      {open && (
        <div className="tb-dropdown cell-gap-menu" role="menu">
          <button type="button" className="tb-dropdown-item" onClick={() => add("music")}>
            Music cell
          </button>
          <button type="button" className="tb-dropdown-item" onClick={() => add("text")}>
            Text cell
          </button>
        </div>
      )}
    </div>
  )
}
