// components/NotebookTitle.tsx — The open notebook's name, which opens its menu: rename it,
// duplicate it, move it as a file, delete it
import React from "react"

// What the menu does to the open notebook
export type NotebookMenu = {
  rename: (title: string) => void
  duplicate: () => void
  exportFile: () => void
  importFile: (file: File) => Promise<void>
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
  const [problem, setProblem] = React.useState<string | null>(null)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

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

  // A problem with a file shows for a moment where the subtitle is
  React.useEffect(() => {
    if (!problem) return
    const t = setTimeout(() => setProblem(null), 4000)
    return () => clearTimeout(t)
  }, [problem])

  const finishRename = () => {
    if (renaming != null) menu?.rename(renaming)
    setRenaming(null)
  }
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      await menu?.importFile(file)
      setProblem(null)
    } catch (err) {
      setProblem((err as Error).message)
    }
  }
  const item = (label: string, fn: () => void, cls = "") => (
    <button
      type="button"
      className={"cell-menu-item " + cls}
      onClick={() => {
        setOpen(false)
        fn()
      }}
    >
      {label}
    </button>
  )

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
          <button
            type="button"
            className={"nb-title-btn" + (open ? " nb-title-btn-open" : "")}
            onClick={() => setOpen((v) => !v)}
            title="Rename, duplicate, export or delete this notebook"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <h1 className="panel-title">{title}</h1>
            <svg className="nb-title-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3.5l3 3 3-3" />
            </svg>
          </button>
        ) : (
          <h1 className="panel-title">{title}</h1>
        )}
        {open && menu && (
          <div className="nb-title-menu" role="menu">
            {item("Rename", () => setRenaming(title))}
            {item("Duplicate", menu.duplicate)}
            {item("Export as a file", menu.exportFile)}
            {item("Import a file", () => fileRef.current?.click())}
            <div className="nb-title-menu-rule" />
            {item("Delete", menu.remove, "cell-menu-item-danger")}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={pick}
        />
      </div>
      <p className={"panel-subtitle" + (problem ? " panel-subtitle-problem" : "")}>
        {problem || subtitle}
      </p>
    </div>
  )
}
