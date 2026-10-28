/* A cell's outputs as things to look at and keep: the sheet music as an SVG or a PNG, and a
   MIDI file. The sheet is the library's ABC (composer-nb/sheet) drawn by abcjs, which needs
   a document, so one is made with linkedom; the PNG is resvg's, with DejaVu for the text
   since a server has no fonts of its own. */
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { parseHTML } from "linkedom"
import type { GridBlock, Output, Parsed } from "composer-nb/language"
import { midiFile } from "composer-nb/midi"
import { sheetAbc } from "composer-nb/sheet"

const require = createRequire(import.meta.url)

export const STAFF_WIDTH = 760
const PAD = 10

// Sheet music to look at: its ABC, and the SVG abcjs draws of it with its size
export type Sheet = { abc: string; svg: string; width: number; height: number }
type Abcjs = typeof import("abcjs")

let abcjsLoading: Promise<Abcjs> | null = null
// abcjs reads `window` and `document` when it loads, so they exist before it does.
function abcjs(): Promise<Abcjs> {
  if (!abcjsLoading) {
    if (typeof globalThis.document === "undefined") {
      const { window } = parseHTML("<!doctype html><html><head></head><body></body></html>")
      // abcjs measures text by drawing it and asking for its box, which the shim can't do:
      // an estimate from the font size keeps staff names, chord symbols and counts spaced
      const svg = window.SVGElement?.prototype as unknown as SVGGraphicsElement | undefined
      if (svg && !svg.getBBox) {
        svg.getBBox = function (this: SVGGraphicsElement) {
          const size = parseFloat(this.getAttribute("font-size") || "") || 16
          const text = this.textContent || ""
          return { x: 0, y: 0, width: text.length * size * 0.56, height: size * 1.15 } as DOMRect
        }
      }
      globalThis.window = window as unknown as Window & typeof globalThis
      globalThis.document = window.document as unknown as Document
    }
    abcjsLoading = import("abcjs").then((m) => ((m as { default?: Abcjs }).default ?? m) as Abcjs)
  }
  return abcjsLoading
}

// One block of a play as sheet music: its ABC and the SVG abcjs draws of it.
export async function sheetSvg(
  block: GridBlock,
  { counts = false, width = STAFF_WIDTH } = {},
): Promise<Sheet | null> {
  const { abc, tablature } = sheetAbc(block, { counts })
  if (!abc) return null
  const lib = await abcjs()
  const { document } = globalThis
  const el = document.createElement("div")
  document.body.append(el)
  try {
    lib.renderAbc(el, abc, {
      staffwidth: width - 2 * PAD,
      paddingtop: PAD,
      paddingbottom: PAD,
      paddingleft: PAD,
      paddingright: PAD,
      foregroundColor: "#000000",
      format: { tablabelfont: "Helvetica 11" },
      ...(tablature.some((t) => t.instrument) && { tablature }),
    })
    const svg = el.querySelector("svg")
    if (!svg) return null
    const box = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number)
    const w = box.length === 4 ? box[2] : Number(svg.getAttribute("width"))
    const h = box.length === 4 ? box[3] : Number(svg.getAttribute("height"))
    const xml = svg.outerHTML
      .replace(/^<svg\b[^>]*>/, (tag) =>
        tag
          .replace(/\s(width|height|viewBox|style)="[^"]*"/g, "")
          .replace(
            /^<svg/,
            `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"`,
          ),
      )
      .replace(/<style>[\s\S]*?<\/style>/, "")
      .replace(/currentColor/g, "#000000")
    return { abc, svg: xml, width: w, height: h }
  } finally {
    el.remove()
  }
}

// A whole play as one sheet: its blocks stacked, each a system of its own.
export async function sheetOf(
  output: Output,
  options: { counts?: boolean } = {},
): Promise<Sheet | null> {
  const parts: Sheet[] = []
  for (const block of output.blocks) {
    const part = await sheetSvg(block, options)
    if (part) parts.push(part)
  }
  if (!parts.length) return null
  if (parts.length === 1) return parts[0]
  const width = Math.max(...parts.map((p) => p.width))
  let y = 0
  const inner = parts.map((p) => {
    const at = y
    y += p.height + PAD
    return p.svg.replace(/^<svg /, `<svg y="${at}" `)
  })
  const height = y - PAD
  return {
    abc: parts.map((p) => p.abc).join("\n\n"),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${inner.join("")}</svg>`,
    width,
    height,
  }
}

type Resvg = typeof import("@resvg/resvg-wasm").Resvg
let resvgLoading: Promise<{ Resvg: Resvg; fonts: Buffer[] }> | null = null
// The fonts are in fonts/, one folder up from both src/ and lib/
function resvg() {
  if (!resvgLoading) {
    resvgLoading = import("@resvg/resvg-wasm").then(async (m) => {
      await m.initWasm(await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")))
      const fonts = await Promise.all(
        ["DejaVuSerif.ttf", "DejaVuSerif-Bold.ttf", "DejaVuSans.ttf"].map((f) =>
          readFile(new URL(`../fonts/${f}`, import.meta.url)),
        ),
      )
      return { Resvg: m.Resvg, fonts }
    })
  }
  return resvgLoading
}

// An SVG as a PNG, `scale` times its size, on white.
export async function pngOf(
  svg: string,
  { width, scale = 2 }: { width?: number; scale?: number } = {},
): Promise<Buffer> {
  const { Resvg, fonts } = await resvg()
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: Math.round((width || STAFF_WIDTH) * scale) },
    background: "#ffffff",
    font: {
      fontBuffers: fonts,
      defaultFontFamily: "DejaVu Serif",
      serifFamily: "DejaVu Serif",
      sansSerifFamily: "DejaVu Sans",
      loadSystemFonts: false,
    },
  })
  const image = r.render()
  const png = image.asPng()
  image.free()
  r.free()
  return Buffer.from(png)
}

// A parsed cell's plays as a MIDI file, one after another.
export function midiOf(parsed: Parsed): Buffer {
  return Buffer.from(midiFile(parsed.outputs))
}
