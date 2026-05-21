// components/Cell.jsx — Single cell (music or text)

function CellMenu({ onDelete }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  return (
    <div className="cell-menu-wrap" ref={menuRef}>
      <button
        className="cell-menu-btn"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onMouseDown={(e) => e.preventDefault()}
        title="Cell options"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="7" cy="3" r="1.3" />
          <circle cx="7" cy="7" r="1.3" />
          <circle cx="7" cy="11" r="1.3" />
        </svg>
      </button>
      {open && (
        <div className="cell-menu-dropdown">
          <button
            className="cell-menu-item cell-menu-item-danger"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onDelete()
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            >
              <path d="M2 3h8M4.5 3V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M3 3l.5 7.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5L9 3" />
              <path d="M5 5.5v3M7 5.5v3" />
            </svg>
            Delete cell
          </button>
        </div>
      )}
    </div>
  )
}

function Cell({
  cell,
  index,
  selected,
  editing,
  onSelect,
  onEnterEdit,
  onLeaveEdit,
  onChange,
  onRun,
  onDelete,
  onSetPreview,
  theme,
  accent,
  focusedCellId,
  isPlaying,
  onTogglePlayback,
  onPlaybackFinished,
  registerPlayer,
  unregisterPlayer,
  armAudio,
}) {
  const taRef = useRef(null)

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus()
      const v = taRef.current.value
      taRef.current.setSelectionRange(v.length, v.length)
    }
  }, [editing])

  const promptText =
    cell.type === "music" ? (cell.runCount != null ? `In [${cell.runCount}]:` : "In [ ]:") : ""
  const isRunning = cell.status === "running"

  return (
    <div
      className={
        "cell cell-" +
        cell.type +
        (selected ? " cell-selected" : "") +
        (editing ? " cell-editing" : "") +
        (isRunning ? " cell-running" : "")
      }
      onClick={onSelect}
      data-screen-label={`Cell ${index + 1} (${cell.type})`}
    >
      <div className="cell-prompt">
        {cell.type === "music" ? (
          <>
            <span className={"prompt-text" + (isRunning ? " prompt-running" : "")}>
              {isRunning ? "In [*]:" : promptText}
            </span>
            <button
              className="cell-run-btn"
              onClick={(e) => {
                e.stopPropagation()
                onRun()
              }}
              title="Run cell (Shift+Enter)"
              disabled={isRunning}
            >
              {isRunning ? (
                <svg width="11" height="11" viewBox="0 0 11 11">
                  <circle
                    cx="5.5"
                    cy="5.5"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    fill="none"
                    strokeDasharray="3 3"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 5.5 5.5"
                      to="360 5.5 5.5"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <polygon points="2,1 9,5 2,9" fill="currentColor" />
                </svg>
              )}
            </button>
          </>
        ) : null}
      </div>
      <div className="cell-body">
        <CellMenu onDelete={onDelete} />
        {cell.type === "music" ? (
          <>
            <CodeEditor
              ref={taRef}
              value={cell.source}
              onChange={(v) => onChange(v)}
              onFocus={onEnterEdit}
              onBlur={onLeaveEdit}
            />
            <MusicOutput
              cell={cell}
              focusedCellId={focusedCellId}
              isPlaying={isPlaying}
              onTogglePlayback={onTogglePlayback}
              onPlaybackFinished={onPlaybackFinished}
              registerPlayer={registerPlayer}
              unregisterPlayer={unregisterPlayer}
              armAudio={armAudio}
              theme={theme}
              accent={accent}
              runCount={cell.runCount}
            />
          </>
        ) : editing ? (
          cell.previewMode ? (
            <div className="text-split">
              <textarea
                ref={taRef}
                className="text-area text-area-split"
                value={cell.source}
                onFocus={onEnterEdit}
                onBlur={onLeaveEdit}
                onChange={(e) => onChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Markdown — # heading, **bold**, *italic*, `code`, - lists, [link](url)"
              />
              <div
                className="text-rendered text-rendered-split markdown"
                onClick={(e) => e.stopPropagation()}
              >
                <MarkdownContent source={cell.source} />
              </div>
              <button
                className="md-preview-toggle md-preview-toggle-on"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  onSetPreview(false)
                }}
                title="Hide preview"
              >
                preview
              </button>
            </div>
          ) : (
            <>
              <textarea
                ref={taRef}
                className="text-area"
                value={cell.source}
                onFocus={onEnterEdit}
                onBlur={onLeaveEdit}
                onChange={(e) => onChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Markdown — # heading, **bold**, *italic*, `code`, - lists, [link](url)"
              />
              <button
                className="md-preview-toggle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  onSetPreview(true)
                }}
                title="Show preview alongside"
              >
                preview
              </button>
            </>
          )
        ) : (
          <div className="text-rendered markdown" onDoubleClick={onEnterEdit}>
            <MarkdownContent source={cell.source} />
          </div>
        )}
      </div>
    </div>
  )
}
