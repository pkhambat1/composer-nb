/* The notebooks in a host, laid out as the website lays them out: the website's own
   sidebar on the left, the open notebook beside it. The host owns the account and the
   theme, so the sidebar has no account menu here. */
import React from "react"
import type { App } from "@modelcontextprotocol/ext-apps"
import Sidebar from "../../playground/src/components/Sidebar.tsx"
import NotebookTitle from "../../playground/src/notebook/NotebookTitle.tsx"
import type { Theme } from "../../playground/src/notebook/index.ts"
import logo from "./composer-mark.png"
import {
  notebookListSchema,
  notebookSummarySchema,
  type NotebookDocument,
  type NotebookList,
} from "../src/notebook-document.ts"
import { NotebookApp } from "./NotebookApp.tsx"
import { notebookFromResult } from "./notebook-result.ts"

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
  const [busy, setBusy] = React.useState(false)
  const working = React.useRef(false)
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
    if (working.current) return
    working.current = true
    setBusy(true)
    setError("")
    void work()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        working.current = false
        setBusy(false)
      })
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
      const notebook = await notebookFromResult(await call(name, args), (notebookId) =>
        call("get_notebook", { notebookId }),
      )
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

  const createNotebook = () =>
    run(async () => {
      await show("create_notebook", { title: "Untitled" })
      await loadList()
    })
  const openNotebook = (id: string) => {
    if (id !== open?.id) run(() => show("open_notebook", { notebookId: id }))
  }
  const moreNotebooks =
    list.nextOffset === undefined ? undefined : () => run(() => loadList(list.nextOffset))

  return (
    <div
      className={`app-shell notebook-browser${open ? "" : " notebook-browser-library"}`}
      data-theme={theme}
    >
      <Sidebar
        logo={logo}
        notebooks={{ list: listed(list, open), current: open }}
        onOpenNotebook={openNotebook}
        onNewNotebook={createNotebook}
        onHome={() =>
          run(async () => {
            if (leave.current && !(await leave.current())) return
            setOpen(null)
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
        onMoreNotebooks={moreNotebooks}
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
          <div className="notebook-root notebook-library" aria-busy={busy}>
            <div className="nb-sticky-header">
              <NotebookTitle title="Your notebooks" subtitle="" menu={null} />
              <div className="panel-header toolbar">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={createNotebook}
                  disabled={busy}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 1.5v9M1.5 6h9" />
                  </svg>
                  New notebook
                </button>
                <span className="notebook-library-count" role="status">
                  {busy
                    ? "Loading…"
                    : `${list.notebooks.length}${list.nextOffset === undefined ? "" : "+"} notebook${list.notebooks.length === 1 ? "" : "s"}`}
                </span>
              </div>
            </div>
            <main className="notebook-library-main">
              {list.notebooks.length ? (
                <>
                  <p className="notebook-library-intro">Pick up an idea, or start something new.</p>
                  <ul className="notebook-library-list" aria-label="Your notebooks">
                    {list.notebooks.map((notebook) => (
                      <li key={notebook.id}>
                        <button
                          type="button"
                          className="notebook-library-item"
                          onClick={() => openNotebook(notebook.id)}
                          disabled={busy}
                        >
                          <span className="notebook-library-icon">
                            <NotebookIcon />
                          </span>
                          <span className="notebook-library-name">{notebook.title}</span>
                          <svg
                            className="notebook-library-arrow"
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.25"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 8h10M9 4l4 4-4 4" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {moreNotebooks && (
                    <button
                      type="button"
                      className="btn btn-secondary notebook-library-more"
                      onClick={moreNotebooks}
                      disabled={busy}
                    >
                      More notebooks
                    </button>
                  )}
                  <p className="notebook-library-hint">
                    Open a notebook, select a cell, and make music with your assistant.
                  </p>
                </>
              ) : (
                <div className="notebook-library-empty">
                  <span className="notebook-library-icon">
                    <NotebookIcon />
                  </span>
                  <h2>A little space for your next idea.</h2>
                  <p>
                    Grooves, melodies, and chord progressions.
                    <br />
                    Start a notebook and make something you can hear.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={createNotebook}
                    disabled={busy}
                  >
                    Create your first notebook
                  </button>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  )
}

function NotebookIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="2.5" width="11" height="13" rx="1.5" />
      <path d="M6.5 2.5v13M9 6h3M9 9h3" />
    </svg>
  )
}
