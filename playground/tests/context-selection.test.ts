import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { parseHTML } from "linkedom"
import { expect, it, vi } from "vitest"
import { parseCell } from "composer-nb/language"
import DrumGrid from "../src/components/DrumGrid.tsx"
import { notebookSelection } from "../src/notebook/selection.ts"

it("keeps the exact selected source and correct line range", () => {
  const { window, document } = parseHTML('<div data-cell-id="a"><textarea></textarea></div>')
  vi.stubGlobal("Element", window.Element)
  vi.stubGlobal("HTMLTextAreaElement", window.HTMLTextAreaElement)
  const area = document.querySelector("textarea")!
  Object.assign(area, { value: "first\nsecond\nthird", selectionStart: 2, selectionEnd: 13 })
  expect(notebookSelection(area)).toMatchObject({ cellId: "a", kind: "source", fromLine: 1, toLine: 2, selectedText: "rst\nsecond\n", start: 2, end: 13 })
  vi.unstubAllGlobals()
})

it("does not turn rendered bricks into interactive selection targets", () => {
  const parsed = parseCell("play block { kick: x 7*- x 7*- }")
  const html = renderToStaticMarkup(React.createElement(DrumGrid, { blocks: parsed.blocks, getTime: () => 0, playing: false }))
  const { document } = parseHTML(html)
  expect(document.querySelectorAll("button.dg-cell")).toHaveLength(0)
  expect(document.querySelector(".dg-cell")).not.toBeNull()
})
