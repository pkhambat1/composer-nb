// components/Cell.jsx — Single cell (music or text)
import React from "react"
import CodeEditor from "./CodeEditor.jsx"
import MusicOutput from "./MusicOutput.jsx"
import MarkdownContent from "./MarkdownCell.jsx"

function CellMenu({ onDelete }) {
  const [open, setOpen] = React.useState(false)
  const menuRef = React.useRef(null)

  React.useEffect(() => {
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
  isActive,
  onSelect,
  onEnterEdit,
  onLeaveEdit,
  onChange,
  onRun,
  onInterrupt,
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
  const taRef = React.useRef(null)

  React.useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus()
      const v = taRef.current.value
      taRef.current.setSelectionRange(v.length, v.length)
    }
  }, [editing])

  // Auto-grow text cell textarea
  React.useEffect(() => {
    if (cell.type !== "text" || !editing) return
    const ta = taRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = ta.scrollHeight + 2 + "px"
  }, [cell.type, cell.source, editing])

  const promptText =
    cell.type === "music" ? (cell.runCount != null ? `In [${cell.runCount}]:` : "In [ ]:") : ""
  const runState =
    cell.status === "running" || cell.status === "rendering"
      ? "running"
      : cell.status === "waiting"
        ? "waiting"
        : "idle"

  return (
    <div
      className={
        "cell cell-" +
        cell.type +
        (selected ? " cell-selected" : "") +
        (editing ? " cell-editing" : "") +
        (isActive ? " cell-running" : "")
      }
      onClick={onSelect}
      data-screen-label={`Cell ${index + 1} (${cell.type})`}
    >
      <div className="cell-prompt">
        {cell.type === "music" ? (
          <span className={"prompt-text" + (runState === "running" ? " prompt-running" : "") + (runState === "waiting" ? " prompt-waiting" : "")}>
            {runState === "waiting" ? "In [\u2026]:" : runState === "running" ? "In [*]:" : promptText}
          </span>
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
              onFocus={() => { onSelect(); onEnterEdit() }}
              onBlur={onLeaveEdit}
              onRun={onRun}
              onInterrupt={onInterrupt}
              runState={runState}
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
              <div className="text-input">
                <textarea
                  ref={taRef}
                  className="text-area text-area-split"
                  value={cell.source}
                  onFocus={() => { onSelect(); onEnterEdit() }}
                  onBlur={onLeaveEdit}
                  onChange={(e) => onChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Markdown — # heading, **bold**, *italic*, `code`, - lists, [link](url)"
                />
                <button
                  className="cell-run-btn"
                  onClick={(e) => { e.stopPropagation(); onRun() }}
                  title="Run cell (Shift+Enter)"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <polygon points="2,1 9,5 2,9" fill="currentColor" />
                  </svg>
                  <span>Run</span>
                </button>
              </div>
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
            <div className="text-input">
              <textarea
                ref={taRef}
                className="text-area"
                value={cell.source}
                onFocus={() => { onSelect(); onEnterEdit() }}
                onBlur={onLeaveEdit}
                onChange={(e) => onChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Markdown — # heading, **bold**, *italic*, `code`, - lists, [link](url)"
              />
              <button
                className="cell-run-btn"
                onClick={(e) => { e.stopPropagation(); onRun() }}
                title="Run cell (Shift+Enter)"
              >
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <polygon points="2,1 9,5 2,9" fill="currentColor" />
                </svg>
                <span>Run</span>
              </button>
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
            </div>
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

export default React.memo(Cell, (prev, next) =>
  prev.cell === next.cell &&
  prev.index === next.index &&
  prev.selected === next.selected &&
  prev.editing === next.editing &&
  prev.isActive === next.isActive &&
  prev.theme === next.theme &&
  prev.accent === next.accent &&
  prev.focusedCellId === next.focusedCellId &&
  prev.isPlaying === next.isPlaying,
)
