// components/CodeEditor.jsx — Code editor with syntax highlighting overlay
import React from "react"
import { highlightMusic } from "../lib/highlight.js"

const CodeEditor = React.forwardRef(function CodeEditor(props, ref) {
  const { value, onChange, onFocus, onBlur, placeholder, onRun, onInterrupt, runState } = props
  const localRef = React.useRef(null)
  const setRef = (el) => {
    localRef.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }

  // Auto-grow
  React.useEffect(() => {
    const ta = localRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = ta.scrollHeight + 2 + "px"
  }, [value])

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault()
      const ta = localRef.current
      if (!ta) return

      const start = ta.selectionStart
      const end = ta.selectionEnd
      const text = ta.value
      const lineStart = text.lastIndexOf("\n", start - 1) + 1
      const lineEnd = text.indexOf("\n", end)
      const block = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd)
      const lines = block.split("\n")
      const allCommented = lines.every((l) => /^\s*-- /.test(l) || l.trim() === "")
      const toggled = lines
        .map((l) => {
          if (l.trim() === "") return l
          if (allCommented) return l.replace(/^(\s*)-- /, "$1")
          return "-- " + l
        })
        .join("\n")

      const before = text.slice(0, lineStart)
      const after = text.slice(lineEnd < 0 ? text.length : lineEnd)
      const next = before + toggled + after
      onChange(next)

      const delta = toggled.length - block.length
      requestAnimationFrame(() => {
        ta.selectionStart = start + (allCommented ? -3 : 3)
        ta.selectionEnd = end + delta
      })
    }
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
