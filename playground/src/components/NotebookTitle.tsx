// components/NotebookTitle.tsx — The open notebook's name, which opens its menu: rename it,
// duplicate it, delete it
import React from "react"

// What the menu does to the open notebook
export type NotebookMenu = {
  rename: (title: string) => void
  duplicate: () => void
  remove: () => void
}

export default function NotebookTitle({
  title,
  subtitle,
  menu, // null when no notebook is open
}: {
  title: string
  subtitle: string
  menu: NotebookMenu | null
}) {
  const [open, setOpen] = React.useState(false)
  const [renaming, setRenaming] = React.useState<string | null>(null) // the name as it's typed
  const wrapRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const finishRename = () => {
    if (renaming != null) menu?.rename(renaming)
    setRenaming(null)
  }
  const item = (label: string, fn: () => void, cls = "") => (
    <button
      type="button"
      className={"menu-item nb-title-menu-item " + cls}
      onClick={() => {
        setOpen(false)
        fn()
      }}
    >
      <span className="nb-title-menu-icon" aria-hidden="true">
        {label === "Rename" ? "✎" : label === "Duplicate" ? "⧉" : "×"}
      </span>
      {label}
    </button>
  )
  const saveState = subtitle === "Saved to Supabase" ? "saved" : subtitle === "Saving…" ? "saving" : subtitle === "Unsaved changes" ? "unsaved" : subtitle.startsWith("Loading") ? "loading" : "error"
  const saveLabel = saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : subtitle

  return (
    <div className="nb-title-bar">
      <div className="nb-title-row" ref={wrapRef}>
        {renaming != null ? (
          <input
            className="nb-title-input"
            value={renaming}
            autoFocus
            onFocus={(e) => e.target.select()}
            aria-label="Notebook name"
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishRename()
              if (e.key === "Escape") setRenaming(null)
            }}
          />
        ) : menu ? (
          <>
            <h1
              className="panel-title nb-title-name"
              title="Double-click to rename"
              onDoubleClick={() => setRenaming(title)}
            >
              {title}
            </h1>
            <button
              type="button"
              className={"btn btn-ghost btn-icon nb-title-actions" + (open ? " btn-open" : "")}
              onClick={() => setOpen((value) => !value)}
              title="Notebook actions"
              aria-label="Notebook actions"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <circle cx="3" cy="7" r="1.2" />
                <circle cx="7" cy="7" r="1.2" />
                <circle cx="11" cy="7" r="1.2" />
              </svg>
            </button>
          </>
        ) : (
          <h1 className="panel-title">{title}</h1>
        )}
        {open && menu && (
          <div className="nb-title-menu" role="menu">
            {item("Rename", () => setRenaming(title))}
            {item("Duplicate", menu.duplicate)}
            {item("Delete", menu.remove, "menu-item-danger")}
          </div>
        )}
        <div className={`save-indicator save-indicator-${saveState}`} role="status" title={saveState === "error" ? subtitle : saveLabel}>
          <span className="save-indicator-icon" aria-hidden="true">
            {saveState === "saved" ? "✓" : saveState === "error" ? "!" : ""}
          </span>
          <span>{saveLabel}</span>
        </div>
      </div>
    </div>
  )
}
