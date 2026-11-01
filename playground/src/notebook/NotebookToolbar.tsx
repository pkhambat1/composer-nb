import type { NotebookController } from "../hooks/useNotebookController.ts"
import Toolbar from "../components/Toolbar.tsx"

export function NotebookToolbar({ controller }: { controller: NotebookController }) {
  const { manager, runtime } = controller
  const add = (type: "music" | "text") =>
    manager.insertCell(manager.cells.at(-1)?.id ?? null, "below", type)
  return (
    <Toolbar
      onAddCode={() => add("music")}
      onAddText={() => add("text")}
      onRunAll={runtime.queuedRunAll}
      onStop={() => {
        runtime.playback.stopAll()
        runtime.stopAll()
      }}
      kernelStatus={runtime.kernelStatus}
    />
  )
}
