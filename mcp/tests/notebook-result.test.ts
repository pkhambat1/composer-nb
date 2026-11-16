import { expect, it, vi } from "vitest"
import { notebookFromResult } from "../app/notebook-result.ts"
import { NOTEBOOK_META } from "../src/notebook-document.ts"

const notebook = {
  id: "chosen",
  title: "Chosen notebook",
  revision: 3,
  cells: [{ id: "cell-1", type: "music" as const, source: "play piano: chords 1" }],
}
const summary = {
  content: [],
  structuredContent: {
    notebookId: notebook.id,
    title: notebook.title,
    revision: notebook.revision,
    cellCount: 1,
  },
}

it("uses app metadata without another tool call", async () => {
  const read = vi.fn()
  expect(
    await notebookFromResult({ ...summary, _meta: { [NOTEBOOK_META]: notebook } }, read),
  ).toEqual(notebook)
  expect(read).not.toHaveBeenCalled()
})

it("reads the exact notebook once when the host drops metadata", async () => {
  const read = vi.fn(async () => ({ content: [], structuredContent: { notebook } }))
  expect(await notebookFromResult(summary, read)).toEqual(notebook)
  expect(read.mock.calls).toEqual([[notebook.id]])
})

it("doesn't recursively retry a malformed fallback response", async () => {
  const read = vi.fn(async () => summary)
  await expect(notebookFromResult(summary, read)).rejects.toThrow("invalid notebook")
  expect(read).toHaveBeenCalledTimes(1)
})

it("keeps a permission error visible instead of treating it as a notebook", async () => {
  const read = vi.fn(async () => ({
    content: [{ type: "text" as const, text: "Notebook unavailable" }],
    isError: true,
  }))
  await expect(notebookFromResult(summary, read)).rejects.toThrow("Notebook unavailable")
})

it("leaves a notebook list to the picker without fetching anything", async () => {
  const read = vi.fn()
  expect(
    await notebookFromResult({ content: [], structuredContent: { notebooks: [] } }, read),
  ).toBeNull()
  expect(read).not.toHaveBeenCalled()
})
