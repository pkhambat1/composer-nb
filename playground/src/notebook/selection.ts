import type { NotebookSelection } from "./types.ts"

/** Resolve semantic renderer targets without teaching renderers about a host SDK. */
export function notebookSelection(target: EventTarget | null): NotebookSelection | null {
  if (!(target instanceof Element)) return null
  const cellId = target.closest<HTMLElement>("[data-cell-id]")?.dataset.cellId
  if (!cellId) return null
  // The code editor keeps the lines its caret or selection is on (CodeEditor.tsx)
  const source = target.closest<HTMLElement>("[data-source-lines]")
  if (source?.dataset.fromLine) {
    const fromLine = Number(source.dataset.fromLine)
    const toLine = Number(source.dataset.toLine)
    return {
      cellId,
      kind: "source",
      fromLine,
      toLine,
      label: fromLine === toLine ? `Line ${fromLine}` : `Lines ${fromLine}–${toLine}`,
    }
  }
  const component = target.closest<HTMLElement>("[data-notebook-target]")
  const kind = component?.dataset.notebookTarget
  if (kind === "brick" || kind === "sheet" || kind === "chord") {
    return { cellId, kind, label: component?.getAttribute("aria-label") ?? kind }
  }
  return { cellId, kind: "cell", label: "Cell" }
}
