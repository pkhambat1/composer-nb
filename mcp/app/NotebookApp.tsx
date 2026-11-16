/* One saved notebook in a host: the shared editor, kept in step with the server.
   - The user's edits are saved whole, 600 ms after the last one, against the revision
     the app last saw; the server answers with the new revision alone.
   - Every 5 s the app asks for the revision alone, and reads the notebook only when it
     moved (the assistant, or the website, changed it). A check that fails backs off and
     is reported apart from the save status, which stays what it was.
   - A save the server refuses because the notebook moved is merged with what is saved
     now (merge.ts) and sent again, so nothing the user typed is lost or left unsaved. */
import React from "react"
import type { App } from "@modelcontextprotocol/ext-apps"
import {
  NotebookEditor,
  type NotebookSnapshot,
  type Theme,
} from "../../playground/src/notebook/index.ts"
import {
  CONFLICT_META,
  notebookOf,
  notebookRevisionSchema,
  type DocumentCell,
  type NotebookDocument,
} from "../src/notebook-document.ts"
import { contextText } from "./context.ts"
import { mergeCells } from "./merge.ts"

const SAVE_AFTER_MS = 600
const CONTEXT_AFTER_MS = 500
const POLL_MS = 5000
const POLL_MAX_MS = 30000

class Conflict extends Error {}
const sameCells = (a: DocumentCell[], b: DocumentCell[]) =>
  a.length === b.length &&
  a.every((c, i) => c.id === b[i].id && c.type === b[i].type && c.source === b[i].source)
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function NotebookApp({
  app,
  initial,
  theme,
  leave,
}: {
  app: App
  initial: NotebookDocument
  theme: Theme
  /** Filled with how to leave this notebook: saves, and says whether everything is saved */
  leave?: React.MutableRefObject<(() => Promise<boolean>) | null>
}) {
  // What the editor was last mounted with. It changes, and the editor mounts again, only
  // when cells arrive from elsewhere.
  const [mounted, setMounted] = React.useState({ document: initial, epoch: 0 })
  // The save status, in the words NotebookTitle knows, and apart from it a failed check
  const [message, setMessage] = React.useState("Saved")
  const [syncError, setSyncError] = React.useState<string | null>(null)
  const synced = React.useRef(initial) // the notebook as the server last had it
  const pending = React.useRef<DocumentCell[] | null>(null) // the user's cells, not yet saved
  const inFlight = React.useRef<Promise<void> | null>(null)
  const selectedId = React.useRef<string | null>(null)
  const alive = React.useRef(true)
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const contextTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const call = React.useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const response = await app.callServerTool({ name, arguments: args })
      if (!response.isError) return response
      const text = response.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n")
      throw response._meta?.[CONFLICT_META] ? new Conflict(text) : new Error(text)
    },
    [app],
  )
  const read = React.useCallback(async () => {
    const remote = notebookOf(await call("get_notebook", { notebookId: synced.current.id }))
    if (!remote) throw new Error("The server returned an invalid notebook.")
    return remote
  }, [call])
  // Cells from elsewhere, shown: the editor mounts again with them.
  const show = React.useCallback((document: NotebookDocument, note: string) => {
    if (!alive.current) return
    setMounted((was) => ({ document, epoch: was.epoch + 1 }))
    setMessage(note)
  }, [])

  // Saves until nothing is pending. One runs at a time; a call while one runs joins it.
  const flush = React.useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    const work = (async () => {
      try {
        while (pending.current) {
          const cells = pending.current
          try {
            const saved = notebookRevisionSchema.parse(
              (
                await call("save_notebook", {
                  notebookId: synced.current.id,
                  cells,
                  expectedRevision: synced.current.revision,
                })
              ).structuredContent,
            )
            synced.current = { ...synced.current, revision: saved.revision, cells }
            if (pending.current === cells) pending.current = null
          } catch (error) {
            if (!(error instanceof Conflict)) throw error
            const remote = await read()
            // The user may have typed on while the notebook was read
            const merged = mergeCells(synced.current.cells, pending.current ?? cells, remote.cells)
            synced.current = remote
            pending.current = sameCells(merged, remote.cells) ? null : merged
            show({ ...remote, cells: merged }, "Latest saved changes loaded")
          }
        }
        if (alive.current) setMessage("Saved")
      } catch (error) {
        // Still pending: the next edit or the poll tries again
        if (alive.current) setMessage(`Unsaved: ${messageOf(error)}`)
      } finally {
        inFlight.current = null
      }
    })()
    inFlight.current = work
    return work
  }, [call, read, show])

  const onSnapshot = React.useCallback(
    (next: NotebookSnapshot) => {
      selectedId.current = next.selectedId
      if (!sameCells(next.cells, pending.current ?? synced.current.cells)) {
        pending.current = next.cells
        setMessage("Saving…")
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null
          void flush()
        }, SAVE_AFTER_MS)
      }
      if (!app.getHostCapabilities()?.updateModelContext) return
      // Each update replaces the last, so only the latest is worth sending
      if (contextTimer.current) clearTimeout(contextTimer.current)
      contextTimer.current = setTimeout(() => {
        const text = contextText(synced.current, next)
        app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => {})
      }, CONTEXT_AFTER_MS)
    },
    [app, flush],
  )

  React.useEffect(() => {
    alive.current = true
    let stopped = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      if (!stopped) timer = setTimeout(poll, Math.min(POLL_MS * 2 ** failures, POLL_MAX_MS))
    }
    const poll = async () => {
      try {
        if (inFlight.current || window.document.visibilityState === "hidden") return
        if (pending.current) {
          if (!saveTimer.current) void flush() // a save that failed, tried again
          return
        }
        const { revision } = notebookRevisionSchema.parse(
          (await call("notebook_revision", { notebookId: synced.current.id })).structuredContent,
        )
        if (stopped) return
        failures = 0
        setSyncError(null)
        if (revision === synced.current.revision) return
        const remote = await read()
        // An edit made meanwhile saves against the old revision, and is merged there
        if (stopped || pending.current || inFlight.current) return
        synced.current = remote
        show(remote, "Latest saved changes loaded")
      } catch (error) {
        failures = Math.min(failures + 1, 3)
        if (!stopped) setSyncError(messageOf(error))
      } finally {
        schedule()
      }
    }
    schedule()
    return () => {
      stopped = true
      alive.current = false
      clearTimeout(timer)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (contextTimer.current) clearTimeout(contextTimer.current)
      void flush() // what was typed in the last moments is saved, not dropped
    }
  }, [call, read, show, flush])

  // The host sent this notebook again, newer: the assistant changed it in the conversation
  React.useEffect(() => {
    if (
      initial.id !== synced.current.id ||
      initial.revision <= synced.current.revision ||
      pending.current ||
      inFlight.current
    )
      return
    synced.current = initial
    show(initial, "Latest saved changes loaded")
  }, [initial, show])

  React.useEffect(() => {
    if (!leave) return
    leave.current = async () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
      await flush()
      return !pending.current
    }
    return () => {
      leave.current = null
    }
  }, [leave, flush])

  // Renamed in the sidebar: the title alone changes, and the editor stays as it is
  React.useEffect(() => {
    if (initial.id !== synced.current.id || initial.title === synced.current.title) return
    synced.current = { ...synced.current, title: initial.title }
    setMounted((was) => ({ ...was, document: { ...was.document, title: initial.title } }))
  }, [initial])

  const { document, epoch } = mounted
  return (
    <>
      {syncError && (
        <p className="notebook-sync-notice" role="status" title={syncError}>
          Couldn’t check for updates. Retrying…
        </p>
      )}
      <NotebookEditor
        key={epoch}
        host={{ cells: document.cells, theme }}
        title={document.title}
        subtitle={message}
        initialSelectedId={selectedId.current}
        showChatContext
        onSnapshot={onSnapshot}
      />
    </>
  )
}
