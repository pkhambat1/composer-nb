// components/CodeEditor.jsx — Code editor with syntax highlighting overlay

const CodeEditor = React.forwardRef(function CodeEditor(props, ref) {
  const { value, onChange, onFocus, onBlur, placeholder } = props
  const localRef = useRef(null)
  const setRef = (el) => {
    localRef.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }

  // Auto-grow
  useEffect(() => {
    const ta = localRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = ta.scrollHeight + 2 + "px"
  }, [value])

  const lines = useMemo(() => {
    const fn = window.highlightMusic
    if (fn) return fn(value)
    return value.split("\n").map((line) => [{ c: null, s: line }])
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
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
})
