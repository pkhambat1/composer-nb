import React from "react"
import type { App } from "@modelcontextprotocol/ext-apps"
import {
  NotebookEditor,
  type NotebookSnapshot,
  type Theme,
} from "../../playground/src/notebook/index.ts"
import { notebookSchema, type NotebookDocument } from "../src/notebook-document.ts"

export function NotebookApp({
  app,
  initial,
  theme,
}: {
  app: App
  initial: NotebookDocument
  theme: Theme
}) {
  const [document, setDocument] = React.useState(initial)
  const [epoch, setEpoch] = React.useState(0)
  const [snapshot, setSnapshot] = React.useState<NotebookSnapshot | null>(null)
  const [message, setMessage] = React.useState("Saved")
  const current = React.useRef(initial)
  const pending = React.useRef<NotebookSnapshot | null>(null)
  const saving = React.useRef(false)
  const inFlight = React.useRef<Promise<void> | null>(null)
  const debounce = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = React.useRef(true)
  const request = React.useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const response = await app.callServerTool({ name, arguments: args })
      if (response.isError)
        throw new Error(
          response.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n"),
        )
      const parsed = notebookSchema.safeParse(response.structuredContent?.notebook)
      if (!parsed.success) throw new Error("The server returned an invalid notebook.")
      return parsed.data
    },
    [app],
  )
  const flush = React.useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    if (!pending.current) return Promise.resolve()
    saving.current = true
    const work = (async () => {
      try {
        while (pending.current && alive.current) {
          const changes = pending.current
          const saved = await request("save_notebook", {
            cells: changes.cells,
            expectedRevision: current.current.revision,
          })
          current.current = saved
          if (pending.current === changes) pending.current = null
          if (alive.current) {
            setDocument(saved)
            setMessage("Saved")
          }
        }
      } catch (error) {
        if (alive.current)
          setMessage(`Unsaved: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        saving.current = false
        inFlight.current = null
      }
    })()
    inFlight.current = work
    return work
  }, [request])
  const onSnapshot = React.useCallback(
    (next: NotebookSnapshot) => {
      setSnapshot(next)
      if (JSON.stringify(next.cells) !== JSON.stringify(current.current.cells)) {
        pending.current = next
        setMessage("Saving…")
        if (debounce.current) clearTimeout(debounce.current)
        debounce.current = setTimeout(() => {
          void flush()
        }, 600)
      }
      if (app.getHostCapabilities()?.updateModelContext) {
        void app
          .updateModelContext({
            content: [
              {
                type: "text",
                text: `Composer notebook selection and current editor source (use get_notebook before saving):\n${JSON.stringify(next)}`,
              },
            ],
          })
          .catch(() => {})
      }
    },
    [app, flush],
  )
  React.useEffect(() => {
    alive.current = true
    let reading = false
    const poll = setInterval(async () => {
      if (
        reading ||
        saving.current ||
        pending.current ||
        window.document.visibilityState === "hidden"
      )
        return
      reading = true
      try {
        const remote = await request("get_notebook", {})
        if (
          alive.current &&
          !pending.current &&
          !saving.current &&
          remote.revision !== current.current.revision
        ) {
          current.current = remote
          setDocument(remote)
          setEpoch((value) => value + 1)
          setMessage("Updated by the assistant")
        }
      } catch (error) {
        if (alive.current) setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        reading = false
      }
    }, 2000)
    return () => {
      alive.current = false
      clearInterval(poll)
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [request])
  return (
    <>
      <NotebookEditor
        key={epoch}
        host={{ cells: document.cells, theme }}
        title={document.title}
        initialSelectedId={snapshot?.selectedId}
        onSnapshot={onSnapshot}
      />
      <div className="notebook-sync-status" role="status">
        {message}
      </div>
    </>
  )
}
