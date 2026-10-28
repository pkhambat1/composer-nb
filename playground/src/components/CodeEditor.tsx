// components/CodeEditor.tsx — Code editor with syntax highlighting overlay
import React from "react"
import { highlightMusic } from "composer-nb/highlight"
import { editKey } from "composer-nb/editing"

// Where a cell is in being run, as its button shows it
export type RunState = "idle" | "waiting" | "running"

type Props = {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  onRun?: () => void
  onInterrupt?: () => void
  runState: RunState
  // The lines the last run found mistakes on
  errorLines: Set<number> | null
}

const CodeEditor = React.forwardRef<HTMLTextAreaElement, Props>(function CodeEditor(props, ref) {
  const {
    value,
    onChange,
    onFocus,
    onBlur,
    placeholder,
    onRun,
    onInterrupt,
    runState,
    errorLines,
  } = props
  const localRef = React.useRef<HTMLTextAreaElement | null>(null)
  const setRef = (el: HTMLTextAreaElement | null) => {
    localRef.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }

  // Auto-grow again when the editor's width changes, which moves where its lines wrap
  React.useEffect(() => {
    const ta = localRef.current
    if (!ta) return
    let width = ta.clientWidth
    const observer = new ResizeObserver(() => {
      if (ta.clientWidth === width) return
      width = ta.clientWidth
      ta.style.height = "auto"
      ta.style.height = ta.scrollHeight + 2 + "px"
    })
    observer.observe(ta)
    return () => observer.disconnect()
  }, [])

  // Auto-grow
  React.useEffect(() => {
    const ta = localRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = ta.scrollHeight + 2 + "px"
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (localRef.current) editKey(e, localRef.current, onChange)
  }

  const lines = React.useMemo(() => {
    return highlightMusic(value)
  }, [value])

  return (
    <div className="code-input">
      <pre className="code-hl" aria-hidden="true">
        {lines.map((parts, li) => {
          const painted = parts.map((p, pi) =>
            p.c ? (
              <span key={pi} className={p.c}>
                {p.s}
              </span>
            ) : (
              p.s
            ),
          )
          // A line the last run reported, tinted until the cell runs again
          const wrong = errorLines?.has(li + 1)
          return (
            <React.Fragment key={li}>
              {li > 0 ? "\n" : null}
              {wrong ? <span className="hl-error-line">{painted}</span> : painted}
            </React.Fragment>
          )
        })}
        {"\n"}
      </pre>
      <textarea
        ref={setRef}
        className="code-area"
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
      />
      {runState === "waiting" && onInterrupt && (
        <button
          className="cell-run-btn cell-wait-btn"
          onClick={(e) => {
            e.stopPropagation()
            onInterrupt()
          }}
          title="Waiting its turn — click to cancel"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path
              d="M5 3v2.5l1.5 1"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <span>Waiting</span>
        </button>
      )}
      {runState === "idle" && onRun && (
        <button
          className="cell-run-btn"
          onClick={(e) => {
            e.stopPropagation()
            onRun()
          }}
          title="Play this cell (Shift+Enter)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <polygon points="2,1 9,5 2,9" fill="currentColor" />
          </svg>
          <span>Play</span>
        </button>
      )}
      {runState === "running" && onInterrupt && (
        <button
          className="cell-run-btn cell-wait-btn"
          onClick={(e) => {
            e.stopPropagation()
            onInterrupt()
          }}
          title="Rendering the audio — click to stop"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path
              d="M5 3v2.5l1.5 1"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <span>Rendering</span>
        </button>
      )}
    </div>
  )
})

export default CodeEditor
