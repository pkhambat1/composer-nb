// Source editor: Monaco, the editor VS Code uses, with composer-nb's highlighter painting
// the tokens. Monaco loads on demand; until it's in, the source shows highlighted as text.
import React from "react"
import { highlightMusic } from "composer-nb/highlight"

// Where a cell is in being run, as its button shows it
export type RunState = "idle" | "waiting" | "running"

// What a cell can do with its editor
export type CodeEditorHandle = {
  // Takes the caret, at the end of the source
  focusAtEnd: (preventScroll: boolean) => void
  hasFocus: () => boolean
}

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

type Monaco = typeof import("./monaco.ts")
let loading: Promise<Monaco> | null = null
const loadMonaco = () => (loading ??= import("./monaco.ts"))

const CodeEditor = React.forwardRef<CodeEditorHandle, Props>(function CodeEditor(props, ref) {
  // onChange, onFocus, onBlur and placeholder reach Monaco through `latest`
  const { value, onRun, onInterrupt, runState, errorLines } = props
  const hostRef = React.useRef<HTMLDivElement>(null)
  const editorRef = React.useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null)
  const errorsRef = React.useRef<import("monaco-editor").editor.IEditorDecorationsCollection | null>(null)
  const [ready, setReady] = React.useState(false)
  // A focus asked for before Monaco was in
  const pendingFocus = React.useRef<boolean | null>(null)
  // The latest props, for Monaco's listeners
  const latest = React.useRef(props)
  latest.current = props

  React.useImperativeHandle(ref, () => ({
    focusAtEnd(preventScroll) {
      const editor = editorRef.current
      if (!editor) {
        pendingFocus.current = preventScroll
        return
      }
      const model = editor.getModel()!
      const end = model.getFullModelRange().getEndPosition()
      editor.setPosition(end)
      if (preventScroll) {
        const x = window.scrollX
        const y = window.scrollY
        editor.focus()
        window.scrollTo(x, y)
      } else {
        editor.focus()
        editor.revealPosition(end)
      }
    },
    hasFocus: () => editorRef.current?.hasTextFocus() ?? false,
  }))

  React.useEffect(() => {
    let disposed = false
    let dispose = () => {}
    loadMonaco().then(({ monaco, OPTIONS, themeName, tokenDecorations }) => {
      const host = hostRef.current
      if (disposed || !host) return
      const editor = monaco.editor.create(host, {
        ...OPTIONS,
        value: latest.current.value,
        theme: themeName(),
        placeholder: latest.current.placeholder,
      })
      const model = editor.getModel()!
      const tokens = editor.createDecorationsCollection(tokenDecorations(model))
      errorsRef.current = editor.createDecorationsCollection()

      // The lines the caret or selection is on, for the notebook's selection (selection.ts)
      const markLines = () => {
        const s = editor.getSelection()
        if (!s) return
        host.dataset.fromLine = String(s.startLineNumber)
        host.dataset.toLine = String(s.endLineNumber)
      }
      // Grow with the source, as the cell does
      const fit = () => {
        host.style.height = editor.getContentHeight() + "px"
        editor.layout()
      }
      const subscriptions = [
        model.onDidChangeContent(() => {
          tokens.set(tokenDecorations(model))
          const text = model.getValue()
          if (text !== latest.current.value) latest.current.onChange(text)
        }),
        editor.onDidContentSizeChange(fit),
        editor.onDidChangeCursorSelection(markLines),
        editor.onDidFocusEditorText(() => latest.current.onFocus?.()),
        editor.onDidBlurEditorText(() => latest.current.onBlur?.()),
      ]
      markLines()
      fit()
      editorRef.current = editor
      setReady(true)
      if (pendingFocus.current !== null) {
        const preventScroll = pendingFocus.current
        pendingFocus.current = null
        requestAnimationFrame(() => {
          const end = model.getFullModelRange().getEndPosition()
          editor.setPosition(end)
          const x = window.scrollX
          const y = window.scrollY
          editor.focus()
          if (preventScroll) window.scrollTo(x, y)
        })
      }
      dispose = () => {
        subscriptions.forEach((s) => s.dispose())
        editor.dispose()
        model.dispose()
        editorRef.current = null
        errorsRef.current = null
      }
    })
    return () => {
      disposed = true
      dispose()
    }
  }, [])

  // A source changed from outside the editor: another notebook, an undone delete
  React.useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model && model.getValue() !== value) model.setValue(value)
  }, [value, ready])

  React.useEffect(() => {
    if (!ready) return
    loadMonaco().then(({ errorDecorations }) => errorsRef.current?.set(errorDecorations(errorLines ?? [])))
  }, [errorLines, ready])

  const diagnosticLines = [...(errorLines ?? [])].sort((a, b) => a - b)
  const lines = React.useMemo(() => (ready ? [] : highlightMusic(value)), [value, ready])

  return (
    <div className="code-input" aria-invalid={diagnosticLines.length > 0}>
      <div
        ref={hostRef}
        className="code-editor"
        data-source-lines=""
        onClick={(e) => e.stopPropagation()}
      >
        {!ready && (
          <pre className="code-hl code-hl-loading" aria-hidden="true">
            {lines.map((parts, i) => (
              <React.Fragment key={i}>
                {i > 0 ? "\n" : null}
                {parts.map((part, j) =>
                  part.c ? (
                    <span key={j} className={part.c}>
                      {part.s}
                    </span>
                  ) : (
                    part.s
                  ),
                )}
              </React.Fragment>
            ))}
            {"\n"}
          </pre>
        )}
      </div>
      {diagnosticLines.length > 0 && (
        <div className="code-diagnostics" role="status">
          Check {diagnosticLines.length === 1 ? "line" : "lines"} {diagnosticLines.join(", ")}
        </div>
      )}
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
          title="Run this cell (Shift+Enter)"
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
