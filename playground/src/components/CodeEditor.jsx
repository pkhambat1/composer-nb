// components/CodeEditor.jsx — Code editor with syntax highlighting overlay
import React from "react"
import { highlightMusic } from "composer-nb/highlight"
import { editKey } from "composer-nb/editing"

const CodeEditor = React.forwardRef(function CodeEditor(props, ref) {
  const { value, onChange, onFocus, onBlur, placeholder, onRun, onInterrupt, runState } = props
  const localRef = React.useRef(null)
  const setRef = (el) => {
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

  const handleKeyDown = (e) => {
    if (localRef.current) editKey(e, localRef.current, onChange)
  }

  const lines = React.useMemo(() => {
    return highlightMusic(value)
  }, [value])

  return (
    <div className="code-input">
      <pre className="code-hl" aria-hidden="true">
        {lines.map((parts, li) => (
          <React.Fragment key={li}>
            {li > 0 ? "\n" : null}
            {parts.map((p, pi) =>
              p.c ? (
                <span key={pi} className={p.c}>
                  {p.s}
                </span>
              ) : (
                p.s
              ),
            )}
          </React.Fragment>
        ))}
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
          title="Cancel — click to interrupt"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
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
          title="Run cell (Shift+Enter)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <polygon points="2,1 9,5 2,9" fill="currentColor" />
          </svg>
          <span>Run</span>
        </button>
      )}
      {runState === "running" && onInterrupt && (
        <button
          className="cell-run-btn cell-wait-btn"
          onClick={(e) => {
            e.stopPropagation()
            onInterrupt()
          }}
          title="Running — click to interrupt"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
          <span>Running</span>
        </button>
      )}
    </div>
  )
})

export default CodeEditor
