import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { parseHTML } from "linkedom"
import { describe, expect, it, vi } from "vitest"
import { parseCell } from "composer-nb/language"
import * as MusicEngine from "composer-nb/engine"
import { describe as describeCell } from "../src/cell.ts"
import { useCellManager } from "../../playground/src/hooks/useCellManager.ts"
import { useNotebookRuntime } from "../../playground/src/hooks/useNotebookRuntime.ts"
import PrintedValues from "../../playground/src/notebook/PrintedValues.tsx"

vi.mock("composer-nb/engine", async () => {
  const language = await import("composer-nb/language")
  return {
    parseSource: language.parseCell,
    initialState: language.initialState,
    renderToBuffer: vi.fn(),
  }
})

describe("printed music in notebook hosts", () => {
  it("shows values and their pitches without rendering or starting audio, including during Play All", async () => {
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>")
    vi.stubGlobal("window", window)
    vi.stubGlobal("document", document)
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    let run: ReturnType<typeof useNotebookRuntime> | undefined
    let manager: ReturnType<typeof useCellManager> | undefined
    function Host() {
      manager = useCellManager([{ id: "inspect", type: "music", source: "print(1, 2, 3)" }])
      run = useNotebookRuntime(manager)
      const output = manager.cells[0].output
      return output?.kind === "printed"
        ? React.createElement(PrintedValues, { prints: output.parsed.prints })
        : null
    }
    const mount = document.getElementById("root")!
    const root = createRoot(mount)
    try {
      await act(async () => {
        root.render(React.createElement(Host))
      })
      await act(async () => {
        run!.runCellNow("inspect")
      })
      await act(async () => {
        run!.queuedRunAll()
      })
      expect(manager!.cells[0].output?.kind).toBe("printed")
      expect(mount.querySelector(".print-row")!.textContent).toBe("notes 1(C3), 2(D3), 3(E3)")
      expect([...mount.querySelectorAll(".print-note")].map((r) => r.textContent)).toEqual([
        "1(C3),",
        "2(D3),",
        "3(E3)",
      ])
      expect(mount.querySelector("audio, button, canvas, table")).toBeNull()
      expect(MusicEngine.renderToBuffer).not.toHaveBeenCalled()
      expect(run!.playback.isPlaying).toBe(false)
    } finally {
      await act(async () => {
        root.unmount()
      })
      vi.unstubAllGlobals()
    }
  })

  it("exposes chord details and print-only results to the MCP text client", () => {
    const source = "print(fifth(1--- 3_ 5|7), chords 1sus2add11#5/4 - _)"
    const parsed = parseCell(source)
    const text = describeCell(parsed, null, source)
    expect(text).toContain(
      [
        "Print (line 1):",
        "  notes 5(G3) 7(B3) 9(D4) 11(F4)",
        "  chords 1sus2add11#5/4(Csus2add11#5/F(C3 D3 G#3 F4/F2))",
      ].join("\n"),
    )
    expect(text).not.toContain("To hear something, add a play")
    const html = renderToStaticMarkup(React.createElement(PrintedValues, { prints: parsed.prints }))
    const { document } = parseHTML(html)
    expect([...document.querySelectorAll(".print-row")].map((r) => r.textContent)).toEqual([
      "notes 5(G3) 7(B3) 9(D4) 11(F4)",
      "chords 1sus2add11#5/4(Csus2add11#5/F(C3 D3 G#3 F4/F2))",
    ])
    expect(html).not.toContain("Playback")
  })
})
