import { isTheme } from "composer-nb/links"
import type { Notebook, SavedCell, Settings, Store } from "./types.ts"

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export function isSavedCell(value: unknown): value is SavedCell {
  return (
    record(value) &&
    (value.type === "music" || value.type === "text") &&
    typeof value.source === "string" &&
    (value.id === undefined || typeof value.id === "string")
  )
}
function isNotebook(value: unknown): value is Notebook {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.updated === "number" &&
    Number.isFinite(value.updated) &&
    (value.starters === undefined || typeof value.starters === "string") &&
    Array.isArray(value.cells) &&
    value.cells.every((cell: unknown) => isSavedCell(cell))
  )
}
export function notebookStore(value: unknown): Store | null {
  return record(value) &&
    (value.current === null || typeof value.current === "string") &&
    Array.isArray(value.list) &&
    value.list.every((notebook: unknown) => isNotebook(notebook))
    ? { current: value.current, list: value.list }
    : null
}
export function themeSettings(value: unknown, defaults: Settings): Settings {
  if (!record(value)) return defaults
  return {
    theme: isTheme(value.theme) ? value.theme : defaults.theme,
    accent: typeof value.accent === "string" ? value.accent : defaults.accent,
    drumView:
      value.drumView === "bricks" || value.drumView === "sheet"
        ? value.drumView
        : defaults.drumView,
    sheetCounts: typeof value.sheetCounts === "boolean" ? value.sheetCounts : defaults.sheetCounts,
  }
}
