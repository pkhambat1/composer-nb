/* Website shell around the shared notebook editor and music renderers. */
import React from "react"
import { APP_CONSTANTS } from "./shared/constants.ts"
import { EMBED, embedCell, embedTheme, listenForTheme, reportHeight } from "./shared/embed.ts"
import type { Theme } from "./shared/types.ts"
import { useNotebookController } from "./hooks/useNotebookController.ts"
import { NotebookEditor, NotebookWorkspace, NotebookToolbar } from "./notebook/index.ts"
import { openingNotebook, useNotebooks } from "./hooks/useNotebooks.ts"
import NotebookTitle, { type NotebookMenu } from "./components/NotebookTitle.tsx"
import { useTheme } from "./components/theme-panel.tsx"
import Sidebar from "./components/Sidebar.tsx"
import StatusBar from "./components/StatusBar.tsx"

// ============================================================================
// App
// ============================================================================

export default function App() {
  return EMBED ? <EmbeddedNotebook /> : <WebsiteNotebook />
}

// The docs iframe adapter owns messaging and sizing, but uses the same editor as MCP.
function EmbeddedNotebook() {
  const [theme, setTheme] = React.useState<Theme>(embedTheme)
  const [cells] = React.useState(() => [embedCell()])
  const frame = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const stopTheme = listenForTheme(setTheme)
    const stopHeight = frame.current ? reportHeight(frame.current) : () => {}
    return () => {
      stopTheme()
      stopHeight()
    }
  }, [])
  return (
    <div ref={frame}>
      <NotebookEditor host={{ cells, theme }} single />
    </div>
  )
}

// Website-only persistence, navigation and chrome never enter the MCP adapter.
function WebsiteNotebook() {
  const [opening] = React.useState(() => openingNotebook(APP_CONSTANTS.STARTER_CELLS))
  const controller = useNotebookController(opening.cells)
  const { manager: cm, runtime } = controller
  const { kernelStatus, playback, stopAll } = runtime
  const { cells, setSelectedId, editingId } = cm

  const notebooks = useNotebooks({
    store: opening?.store || { current: null, list: [] },
    cells,
    setCells: cm.setCells,
    setSelectedId,
  })

  const [settings, setSetting] = useTheme(APP_CONSTANTS.THEME_DEFAULTS)
  const theme = settings.theme || "light"
  const accent = APP_CONSTANTS.THEME_DEFAULTS.accent
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Another notebook: whatever plays stops, and the page shows the one asked for
  const quiet = React.useCallback(() => {
    playback.stopAll()
    stopAll()
  }, [playback, stopAll])
  const openNotebook = React.useCallback(
    (id: string) => {
      if (notebooks.current?.id === id) return
      quiet()
      notebooks.open(id)
    },
    [notebooks, quiet],
  )
  const newNotebook = React.useCallback(() => {
    quiet()
    notebooks.create()
  }, [notebooks, quiet])
  // The title's menu, for the open notebook
  const current = notebooks.current
  const notebookMenu = React.useMemo<NotebookMenu | null>(
    () =>
      current
        ? {
            rename: (title) => notebooks.rename(current.id, title),
            duplicate: () => {
              quiet()
              notebooks.duplicate(current.id)
            },
            remove: () => {
              if (!window.confirm(`Delete "${current.title}"? This can't be undone.`)) return
              quiet()
              notebooks.remove(current.id)
            },
          }
        : null,
    [current, notebooks, quiet],
  )

  return (
    <div className="app-shell">
      <Sidebar
        notebooks={notebooks}
        onOpenNotebook={openNotebook}
        onNewNotebook={newNotebook}
        theme={theme}
        onSetTheme={(v) => setSetting("theme", v)}
      />

      <div className="app-main">
        <NotebookWorkspace
          controller={controller}
          appearance={{
            theme,
            accent,
            drumView: settings.drumView,
            sheetCounts: settings.sheetCounts,
            onSetDrumView: (view) => setSetting("drumView", view),
            onSetSheetCounts: (counts) => setSetting("sheetCounts", counts),
          }}
          header={
            <>
              <NotebookTitle
                title={notebooks.current?.title || "Notebook"}
                subtitle="Kept on this device as you write"
                menu={notebookMenu}
              />
              <NotebookToolbar controller={controller} />
            </>
          }
          footer={<StatusBar editingId={editingId} kernelStatus={kernelStatus} />}
        />
      </div>
    </div>
  )
}
