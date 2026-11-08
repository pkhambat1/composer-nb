import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { parseHTML } from "linkedom"
import { expect, it, vi } from "vitest"
import { parseCell } from "composer-nb/language"
import DrumGrid from "../src/components/DrumGrid.tsx"
import { notebookSelection } from "../src/notebook/selection.ts"

it("hands the host the musical position of a compressed grid step", () => {
  const parsed = parseCell("pattern groove = { kick: x---\n hat: x- }\nplay groove for 2 bars")
  const html = renderToStaticMarkup(
    React.createElement(DrumGrid, { blocks: parsed.blocks, getTime: () => 0, playing: false }),
  )
  const { window, document } = parseHTML(`<div data-cell-id="groove">${html}</div>`)
  vi.stubGlobal("Element", window.Element)
  vi.stubGlobal("HTMLTextAreaElement", window.HTMLTextAreaElement)
  try {
    const target = document.querySelector('[aria-label^="kick, block 1, bar 2, step 8 of 8,"]')
    expect(target).not.toBeNull()
    const selection = notebookSelection(target)
    expect(selection?.cellId).toBe("groove")
    expect(selection?.kind).toBe("brick")
    // The eighth visible cell is 4&, not the eighth sixteenth-note source step (2a).
    expect(selection?.label).toContain("2 steps per quarter note, offset 336 ticks within bar")
    expect(selection?.label).toContain("96 ticks per quarter note")
  } finally {
    vi.unstubAllGlobals()
  }
})

it("hands the host the lines the code editor's selection is on", () => {
  const { window, document } = parseHTML(
    `<div data-cell-id="groove"><div data-source-lines="" data-from-line="2" data-to-line="4"><span class="tk-inst">kick</span></div></div>`,
  )
  vi.stubGlobal("Element", window.Element)
  try {
    const selection = notebookSelection(document.querySelector(".tk-inst"))
    expect(selection).toMatchObject({ cellId: "groove", kind: "source", fromLine: 2, toLine: 4, label: "Lines 2–4" })
  } finally {
    vi.unstubAllGlobals()
  }
})
