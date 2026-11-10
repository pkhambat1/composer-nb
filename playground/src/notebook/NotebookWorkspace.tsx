import type { ReactNode } from "react"
import type { NotebookController } from "../hooks/useNotebookController.ts"
import NotebookCells, { type Appearance } from "./NotebookCells.tsx"
import { SelectionContext } from "./SelectionContext.tsx"
import { notebookSelection } from "./selection.ts"
import type { NotebookSelection } from "./types.ts"

/** The notebook surface, independent of persistence and the embedding host. */
export function NotebookWorkspace({
  controller,
  appearance,
  single = false,
  header,
  onSelection,
  selection = null,
}: {
  controller: NotebookController
  appearance: Appearance
  single?: boolean
  header?: ReactNode
  onSelection?: (selection: NotebookSelection | null) => void
  selection?: NotebookSelection | null
}) {
  const cells = (
    <SelectionContext.Provider value={selection}>
      <div
        onClickCapture={(event) => { const next = notebookSelection(event.target); if (next) onSelection?.(next) }}
        onSelectCapture={(event) => { const next = notebookSelection(event.target); if (next) onSelection?.(next) }}
        onMouseUpCapture={(event) => { const next = notebookSelection(event.target); if (next) onSelection?.(next) }}
        onKeyUpCapture={(event) => { const next = notebookSelection(event.target); if (next) onSelection?.(next) }}
      >
        <NotebookCells {...controller} appearance={appearance} single={single} />
      </div>
    </SelectionContext.Provider>
  )
  if (single) return <div className="embed-root">{cells}</div>
  return (
    <div className="notebook-root">
      {header && <div className="nb-sticky-header">{header}</div>}
      <main
        className="nb-main"
        onClick={(event) => {
          if (
            event.target === event.currentTarget ||
            (event.target instanceof HTMLElement && event.target.classList.contains("cells"))
          ) {
            controller.manager.setSelectedId(null)
          }
        }}
      >
        {cells}
      </main>
    </div>
  )
}
