/* The notebooks in a host, laid out as the website lays them out: the website's own
   sidebar on the left, the open notebook beside it. The host owns the account and the
   theme, so the sidebar has no account menu here. */
import React from "react"
import type { App } from "@modelcontextprotocol/ext-apps"
import Sidebar from "../../playground/src/components/Sidebar.tsx"
import type { Theme } from "../../playground/src/notebook/index.ts"
// The website's mark at the size the sidebar draws it, small enough to travel in the bundle
import logo from "./composer-mark.png"
import {
  notebookListSchema,
  notebookOf,
  notebookSummarySchema,
  type NotebookDocument,
  type NotebookList,
} from "../src/notebook-document.ts"
import { NotebookApp } from "./NotebookApp.tsx"

export type NotebookView = NotebookDocument | NotebookList
// A notebook that isn't on the list's first page is still shown in it while it is open
const listed = (list: NotebookList, open: NotebookDocument | null): NotebookList["notebooks"] =>
  !open || list.notebooks.some((n) => n.id === open.id)
    ? list.notebooks
    : [{ id: open.id, title: open.title, revision: open.revision }, ...list.notebooks]

export function NotebookBrowser({
  app,
  initial,
  theme,
}: {
  app: App
  initial: NotebookView
  theme: Theme
}) {
  const [open, setOpen] = React.useState<NotebookDocument | null>(null)
  const [list, setList] = React.useState<NotebookList>({ notebooks: [] })
  const [error, setError] = React.useState("")
  // Leaving a notebook saves it first; NotebookApp hands over how
  const leave = React.useRef<(() => Promise<boolean>) | null>(null)

  const call = React.useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const result = await app.callServerTool({ name, arguments: args })
      if (result.isError)
        throw new Error(
          result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n"),
        )
      return result
    },
    [app],
  )
  const run = React.useCallback((work: () => Promise<void>) => {
    setError("")
    work().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  const loadList = React.useCallback(
    async (offset = 0) => {
      const page = notebookListSchema.parse(
        (await call("list_notebooks", { offset })).structuredContent,
      )
      setList((old) =>
        offset ? { ...page, notebooks: [...old.notebooks, ...page.notebooks] } : page,
      )
    },
    [call],
  )
  const show = React.useCallback(
    async (name: string, args: Record<string, unknown>) => {
      if (leave.current && !(await leave.current())) return // unsaved, and it says so
      const notebook = notebookOf(await call(name, args))
      if (!notebook) throw new Error("The server returned an invalid notebook.")
      setOpen(notebook)
    },
    [call],
  )

  // What the host sent: a notebook to open, or the list
  React.useEffect(() => {
    if ("cells" in initial) {
      setOpen(initial)
      run(loadList)
    } else setList(initial)
  }, [initial, loadList, run])
  React.useEffect(() => {
    if (open || !app.getHostCapabilities()?.updateModelContext) return
    void app
      .updateModelContext({
        content: [
          {
            type: "text",
            text: "The composer-nb notebooks are open. No notebook or cell is selected. Use list_notebooks to select a notebook by ID before editing.",
          },
        ],
      })
      .catch(() => {})
  }, [app, open])

  return (
    <div className="app-shell" data-theme={theme}>
      <Sidebar
        logo={logo}
        notebooks={{ list: listed(list, open), current: open }}
        onOpenNotebook={(id) => {
          if (id !== open?.id) run(() => show("open_notebook", { notebookId: id }))
        }}
        onNewNotebook={() =>
          run(async () => {
            await show("create_notebook", { title: "Untitled" })
            await loadList()
          })
        }
        onRenameNotebook={(id, title) =>
          run(async () => {
            const renamed = notebookSummarySchema.parse(
              (await call("rename_notebook", { notebookId: id, title })).structuredContent,
            )
            const retitle = <T extends { id: string; title: string }>(n: T): T =>
              n.id === renamed.id ? { ...n, title: renamed.title } : n
            setList((old) => ({ ...old, notebooks: old.notebooks.map(retitle) }))
            setOpen((old) => old && retitle(old))
          })
        }
        onMoreNotebooks={
          list.nextOffset === undefined ? undefined : () => run(() => loadList(list.nextOffset))
        }
      />
      <div className="app-main">
        {error && (
          <p className="notebook-notice" role="alert">
            {error}
          </p>
        )}
        {open ? (
          <NotebookApp key={open.id} app={app} initial={open} theme={theme} leave={leave} />
        ) : (
          <p className="notebook-notice">
            {list.notebooks.length
              ? "Open a notebook from the list, or ask your assistant to write something."
              : "No notebooks yet. Add one with +, or ask your assistant to write something."}
          </p>
        )}
      </div>
    </div>
  )
}
