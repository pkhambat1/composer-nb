/* Composes the same editing, execution and keyboard behavior for every notebook host. */
import { useCellManager } from "./useCellManager.ts"
import { useNotebookRuntime } from "./useNotebookRuntime.ts"
import { useKeyboard } from "./useKeyboard.ts"
import type { Host, SavedCell } from "../shared/types.ts"

export function useNotebookController(
  cells: SavedCell[],
  options: { host?: Host | null; single?: boolean; initialSelectedId?: string | null } = {},
) {
  const manager = useCellManager(cells, options.initialSelectedId)
  const runtime = useNotebookRuntime(manager, options.host)
  useKeyboard({ ...manager, runCell: runtime.runCellNow, single: options.single })
  return { manager, runtime }
}
export type NotebookController = ReturnType<typeof useNotebookController>
