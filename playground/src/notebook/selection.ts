import type { NotebookSelection } from "./types.ts"

/** Resolve semantic renderer targets without teaching renderers about a host SDK. */
export function notebookSelection(target: EventTarget | null): NotebookSelection | null {
  if (!(target instanceof Element)) return null
  const cellId = target.closest<HTMLElement>("[data-cell-id]")?.dataset.cellId
  if (!cellId) return null
  if (target instanceof HTMLTextAreaElement) {
    const fromLine = target.value.slice(0, target.selectionStart).split("\n").length
    const toLine = target.value.slice(0, target.selectionEnd).split("\n").length
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
