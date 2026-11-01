import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { parseHTML } from "linkedom"
import { describe, expect, it, vi } from "vitest"
import { NotebookEditor } from "../../playground/src/notebook/NotebookEditor.tsx"
import type { NotebookWorkspace } from "../../playground/src/notebook/NotebookWorkspace.tsx"
import type { NotebookSnapshot } from "../../playground/src/notebook/types.ts"

let workspace: Parameters<typeof NotebookWorkspace>[0] | null = null
vi.mock("../../playground/src/notebook/NotebookWorkspace.tsx", () => ({
  NotebookWorkspace: (props: Parameters<typeof NotebookWorkspace>[0]) => {
    workspace = props
    return null
  },
}))
vi.mock("../../playground/src/hooks/useNotebookRuntime.ts", () => ({
  useNotebookRuntime: () => ({ kernelStatus: "idle", runCellNow: () => {} }),
}))
vi.mock("../../playground/src/hooks/useKeyboard.ts", () => ({ useKeyboard: () => {} }))
function editor() {
  if (!workspace) throw new Error("Editor did not mount")
  return workspace.controller.manager
}
describe("host selection handoff", () => {
  it("does not feed snapshots back into initialization or reset a live selection", async () => {
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>")
    vi.stubGlobal("window", window)
    vi.stubGlobal("document", document)
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    const mount = document.getElementById("root")
    if (!mount) throw new Error("Missing test mount")
    const root = createRoot(mount)
    let reports = 0
    function Host() {
      const [selected, setSelected] = React.useState<string | null>(null)
      const onSnapshot = (snapshot: NotebookSnapshot) => {
        if (++reports > 10) throw new Error("Selection is feeding back into initialization")
        setSelected(snapshot.selectedId)
      }
      return React.createElement(NotebookEditor, {
        host: {
          cells: [
            { id: "settings", type: "music", source: "" },
            { id: "beat", type: "music", source: "" },
          ],
        },
        initialSelectedId: selected,
        onSnapshot,
      })
    }
    try {
      await act(async () => {
        root.render(React.createElement(Host))
      })
      expect(editor().selectedId).toBeNull()
      await act(async () => {
        editor().setSelectedId("beat")
      })
      expect(editor().selectedId).toBe("beat")
      await act(async () => {
        editor().updateCell("beat", { source: "play { kick: 1 }" })
      })
      expect(editor().selectedId).toBe("beat")
      expect(reports).toBe(3)
    } finally {
      await act(async () => {
        root.unmount()
      })
      vi.unstubAllGlobals()
      workspace = null
    }
  })
})
