import React from "react"
import type { App } from "@modelcontextprotocol/ext-apps"
import type { Theme } from "../../playground/src/notebook/index.ts"
import {
  notebookListSchema,
  notebookSchema,
  type NotebookDocument,
  type NotebookList,
} from "../src/notebook-document.ts"
import { NotebookApp } from "./NotebookApp.tsx"

export type NotebookView = NotebookDocument | NotebookList
export function NotebookBrowser({
  app,
  initial,
  theme,
}: {
  app: App
  initial: NotebookView
  theme: Theme
}) {
  const [view, setView] = React.useState(initial)
  const [title, setTitle] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    if ("notebooks" in view && app.getHostCapabilities()?.updateModelContext)
      void app
        .updateModelContext({
          content: [
            {
              type: "text",
              text: "The composer-nb notebook picker is open. No notebook or cell is selected. Use list_notebooks to select a notebook by ID before editing.",
            },
          ],
        })
        .catch(() => {})
  }, [app, view])
  React.useEffect(() => {
    setView(initial)
  }, [initial])
  async function request(name: string, args: Record<string, unknown>, append = false) {
    setBusy(true)
    setError("")
    try {
      const result = await app.callServerTool({ name, arguments: args })
      if (result.isError)
        throw new Error(
          result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n"),
        )
      const doc = notebookSchema.safeParse(result.structuredContent?.notebook)
      if (doc.success) setView(doc.data)
      else {
        const list = notebookListSchema.parse(result.structuredContent)
        setView((old) =>
          append && "notebooks" in old
            ? { ...list, notebooks: [...old.notebooks, ...list.notebooks] }
            : list,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load notebooks")
    } finally {
      setBusy(false)
    }
  }
  if ("cells" in view)
    return (
      <NotebookApp
        key={view.id}
        app={app}
        initial={view}
        theme={theme}
        onBack={() => void request("list_notebooks", {})}
      />
    )
  return (
    <main className="notebook-browser" data-theme={theme}>
      <h1>Your notebooks</h1>
      <p>Open a notebook, then select a cell and ask your assistant to work on it.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim()) void request("create_notebook", { title: title.trim() })
        }}
        className="notebook-create"
      >
        <label htmlFor="notebook-title">New notebook</label>
        <input
          id="notebook-title"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Notebook title"
          required
        />
        <button className="btn btn-primary" disabled={busy || !title.trim()}>
          Create
        </button>
      </form>
      {view.notebooks.length === 0 && (
        <p>You don’t have any notebooks yet. Create one to start writing music.</p>
      )}
      <ul className="notebook-list">
        {view.notebooks.map((notebook) => (
          <li key={notebook.id}>
            <button
              disabled={busy}
              onClick={() => void request("open_notebook", { notebookId: notebook.id })}
            >
              {notebook.title}
              <span>Open →</span>
            </button>
          </li>
        ))}
      </ul>
      {view.nextOffset !== undefined && (
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void request("list_notebooks", { offset: view.nextOffset }, true)}
        >
          More notebooks
        </button>
      )}
      {busy && <p role="status">Loading…</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
