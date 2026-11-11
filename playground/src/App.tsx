/* Website shell around the shared notebook editor and music renderers. */
import React from "react"
import { APP_CONSTANTS } from "./shared/constants.ts"
import { useNotebookController } from "./hooks/useNotebookController.ts"
import { NotebookWorkspace, NotebookToolbar } from "./notebook/index.ts"
import { useNotebooks } from "./hooks/useNotebooks.ts"
import NotebookTitle, { type NotebookMenu } from "./components/NotebookTitle.tsx"
import { useTheme } from "./components/theme-panel.tsx"
import Sidebar from "./components/Sidebar.tsx"
import type { Account } from "./components/AccountMenu.tsx"
import AuthGate from "./components/AuthGate.tsx"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./lib/supabase.ts"

// ============================================================================
// App
// ============================================================================

export default function App() {
  return <AuthGate>{(session) => <WebsiteNotebook session={session} />}</AuthGate>
}

// Website-only persistence, navigation and chrome never enter the MCP adapter.
// Who's signed in, for the sidebar: Google sign-in carries a name and picture in the
// user's metadata, email sign-in only the address
function accountOf(session: Session): Account {
  const meta = session.user.user_metadata ?? {}
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  return {
    email: session.user.email || "Signed in",
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
  }
}

function WebsiteNotebook({ session }: { session: Session }) {
  const controller = useNotebookController(APP_CONSTANTS.STARTER_CELLS)
  const { manager: cm, runtime } = controller
  const { playback, stopAll } = runtime
  const { cells, setSelectedId } = cm

  const notebooks = useNotebooks({
    starters: APP_CONSTANTS.STARTER_CELLS,
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
        onRenameNotebook={notebooks.rename}
        theme={theme}
        onSetTheme={(v) => setSetting("theme", v)}
        account={accountOf(session)}
        onSignOut={() => void supabase?.auth.signOut()}
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
                subtitle={notebooks.status}
                menu={notebookMenu}
              />
              <NotebookToolbar controller={controller} />
            </>
          }
        />
      </div>
    </div>
  )
}
