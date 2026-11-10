import type { NotebookSelection } from "./types.ts"

/** Resolve semantic renderer targets without teaching renderers about a host SDK. */
export function notebookSelection(target: EventTarget | null): NotebookSelection | null {
  if (!(target instanceof Element)) return null
  const cellId = target.closest<HTMLElement>("[data-cell-id]")?.dataset.cellId
  if (!cellId) return null
  // The code editor keeps where its caret or selection is (CodeEditor.tsx)
  const source = target.closest<HTMLElement>("[data-source-lines]")
  if (source?.dataset.fromLine) {
    const d = source.dataset
    const fromLine = Number(d.fromLine)
    const toLine = Number(d.toLine)
    const start = Number(d.start)
    const end = Number(d.end)
    return {
      cellId,
      kind: "source",
      fromLine,
      toLine,
      ...(end > start ? { start, end, selectedText: d.selectedText ?? "" } : {}),
      label: fromLine === toLine ? `Line ${fromLine}` : `Lines ${fromLine}–${toLine}`,
    }
  }
  if (target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart
    const end = target.selectionEnd
    const fromLine = target.value.slice(0, start).split("\n").length
    const toLine = target.value.slice(0, end > start && target.value[end - 1] === "\n" ? end - 1 : end).split("\n").length
    return {
      cellId,
      kind: "source",
      fromLine,
      toLine,
      ...(end > start ? { start, end, selectedText: target.value.slice(start, end) } : {}),
      label: fromLine === toLine ? `Line ${fromLine}` : `Lines ${fromLine}–${toLine}`,
    }
  }
  const textSelection = window.getSelection()
  if (textSelection && !textSelection.isCollapsed && target.closest(".text-rendered")) {
    const anchor = textSelection.anchorNode?.parentElement?.closest("[data-cell-id]")
    const focus = textSelection.focusNode?.parentElement?.closest("[data-cell-id]")
    if (anchor === focus && anchor?.getAttribute("data-cell-id") === cellId)
      return { cellId, kind: "text", label: "Selected text", selectedText: textSelection.toString() }
  }
  if (target.closest(".drum-grid, .sheet-print, .chord-strip")) return null
  if (target.closest("button, input, select, a, [role=button]")) return null
  return { cellId, kind: "cell", label: "Cell" }
}
