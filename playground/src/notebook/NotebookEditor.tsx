import React from "react"
import type { Host } from "../shared/types.ts"
import { APP_CONSTANTS } from "../shared/constants.ts"
import { useNotebookController } from "../hooks/useNotebookController.ts"
import { NotebookWorkspace } from "./NotebookWorkspace.tsx"
import { NotebookToolbar } from "./NotebookToolbar.tsx"
import NotebookTitle from "../components/NotebookTitle.tsx"
import type { NotebookSnapshot, NotebookSelection } from "./types.ts"

/** A host-owned editor. Storage and MCP SDK calls belong in the adapter, not here.
 * Change the React key when replacing the document; theme changes preserve edits.
 */
export function NotebookEditor({
  host,
  single = false,
  title = "Notebook",
  subtitle = "",
  onSnapshot,
  initialSelectedId = null,
  showChatContext = false,
}: {
  host: Host
  single?: boolean
  title?: string
  subtitle?: string
  onSnapshot?: (snapshot: NotebookSnapshot) => void
  initialSelectedId?: string | null
  showChatContext?: boolean
}) {
  const controller = useNotebookController(host.cells, { host, single, initialSelectedId })
  const [selection, setSelection] = React.useState<NotebookSelection | null>(null)
  const [drumView, setDrumView] = React.useState(APP_CONSTANTS.THEME_DEFAULTS.drumView)
  const [sheetCounts, setSheetCounts] = React.useState(APP_CONSTANTS.THEME_DEFAULTS.sheetCounts)
  const theme = host.theme ?? "light"
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const { cells, selectedId } = controller.manager
  const selectedCell = cells.find((cell) => cell.id === selectedId)
  const validSelection = selection?.cellId === selectedId && (
    selection.kind !== "source" || selection.selectedText === undefined ||
    selectedCell?.source.slice(selection.start, selection.end) === selection.selectedText
  ) ? selection : null
  const lastSnapshot = React.useRef("")
  React.useEffect(() => {
    if (!onSnapshot) return
    const snapshot: NotebookSnapshot = {
      cells: cells.map(({ id, type, source }) => ({ id, type, source })),
      selectedId,
      selection:
        validSelection
          ? validSelection
          : selectedId
            ? { cellId: selectedId, kind: "cell", label: "Cell" }
            : null,
    }
    const signature = JSON.stringify(snapshot)
    if (signature === lastSnapshot.current) return
    lastSnapshot.current = signature
    onSnapshot(snapshot)
  }, [cells, selectedId, validSelection, onSnapshot])
  return (
    <NotebookWorkspace
      controller={controller}
      single={single}
      onSelection={setSelection}
      selection={validSelection}
      header={
        <>
          <NotebookTitle title={title} subtitle={subtitle} menu={null} />
          <NotebookToolbar controller={controller} />
          {showChatContext && (
            <div className="notebook-chat-context" role="status">
              Chat context: notebook{selectedCell ? ` · Cell ${cells.indexOf(selectedCell) + 1}` : ""}
              {validSelection?.selectedText ? ` · Selected text: “${validSelection.selectedText.replace(/\s+/g, " ").slice(0, 100)}${validSelection.selectedText.length > 100 ? "…" : ""}”` : ""}
            </div>
          )}
        </>
      }
      appearance={{
        theme,
        accent: APP_CONSTANTS.THEME_DEFAULTS.accent,
        drumView,
        onSetDrumView: setDrumView,
        sheetCounts,
        onSetSheetCounts: setSheetCounts,
      }}
    />
  )
}
