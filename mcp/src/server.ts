/* The composer-nb MCP server: the language for any assistant that speaks MCP. Five tools
   wrap what the library does already (parse, render, link, library, reference), and the
   reference pages and the grooves are resources too, for clients that read those. One
   server is one McpServer; the transports are in bin.ts (stdio) and http.ts. */
import { createRequire } from "node:module"
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { GROOVES, grooveText, plain, searchGrooves, slugOf, type Groove } from "composer-nb/grooves"
import type { Output, Parsed } from "composer-nb/language"
import { SITE, notebookUrl, openUrl } from "composer-nb/links"
import { CELL_UI, registerCellApp } from "./app.ts"
import { describe, parse, playersOf } from "./cell.ts"
import { INSTRUCTIONS } from "./instructions.ts"
import { REFERENCE } from "./reference.ts"
import { midiOf, pngOf, sheetOf } from "./render.ts"

// The package's own file, one folder up from both src/ and lib/
const { version: VERSION } = createRequire(import.meta.url)("../package.json") as {
  version: string
}

// What a server is made with: the playground its links open
export type Options = { site?: string }

const text = (t: string) => ({ type: "text" as const, text: t })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const fence = (code: string) => "```composer-nb\n" + code + "\n```"

const SOURCE = z.string().describe("The cell: composer-nb source, a line per statement")
// What parse says of an empty cell, which is one for the user to write in.
const EMPTY =
  "An empty cell, for the user to write in. Where the client renders MCP Apps, it is drawn under your reply: the user types the code there and plays it with Play or Shift+Enter, and what they play comes back with their next message. Don't fill it in unless they ask."

const AFTER = z
  .string()
  .optional()
  .describe(
    "The source of the cells this one continues from, for their settings and names (as the cells above it in a notebook)",
  )

// The errors of a cell that can't be rendered, as a tool result.
function failed(parsed: Parsed, earlier: Parsed | null, source: string): CallToolResult {
  return { isError: true, content: [text(describe(parsed, earlier, source))] }
}

// What a play is, in a line: "Play 1 (line 9): play groove · 2 bars · 4.7 s · kick, snare".
function playLine(o: Output, i: number): string {
  const bars = o.blocks.reduce((a, b) => a + b.bars, 0)
  const who = playersOf(o)
  return (
    `Play ${i + 1} (line ${o.line}): ${o.label} · ${plural(bars, "bar")} · ${Math.round(o.durSec * 10) / 10} s` +
    (who.length ? ` · ${who.join(", ")}` : "")
  )
}

export function createServer({ site = SITE }: Options = {}): McpServer {
  const server = new McpServer(
    { name: "composer-nb", version: VERSION },
    { instructions: INSTRUCTIONS },
  )
  const grooveUrl = (g: Groove) => `${site}/grooves/${slugOf(g.title)}/`
  const query = (source: string, after?: string) =>
    `src=${encodeURIComponent(source)}` + (after ? `&after=${encodeURIComponent(after)}` : "")

  // parse and link name the MCP App (app.js): a host that renders MCP Apps draws the
  // player for the cell under the tool's result; every other host reads the text.
  registerAppTool(
    server,
    "parse",
    {
      title: "Check a cell and see what it plays",
      description:
        "Checks a composer-nb cell and says what it plays. Returns the errors with their line numbers (a cell with errors plays nothing), the settings and names in effect at the end, and for each play a grid of every hit and note, bar by bar, with the chords it heard. Where the client renders MCP Apps, the cell is drawn too, for the user to change and play: its code, the audio, the grid or the sheet, the chords. What the user plays there comes back with their next message. When the user wants to write a cell themselves, call it with an empty source: they get an empty cell to type in and play. Call it on every cell before showing the cell to anyone; fix the errors and call it again.",
      inputSchema: { source: SOURCE, after: AFTER },
      _meta: { ui: { resourceUri: CELL_UI } },
    },
    async ({ source, after }) => {
      if (!source.trim()) return { content: [text(EMPTY)] }
      const { parsed, earlier } = parse(source, after)
      return {
        isError: parsed.errors.length > 0,
        content: [text(describe(parsed, earlier, source))],
      }
    },
  )

  server.registerTool(
    "render",
    {
      title: "Sheet music, MIDI or ABC for a cell",
      description:
        "Draws a cell's plays as sheet music (a PNG: the kit on a percussion staff with the hands up and the feet down, each instrument on a staff of its own, a guitar with its tab), or writes them as a MIDI file for a DAW or a notation program, or gives the ABC notation. A cell with errors renders nothing, so parse first.",
      inputSchema: {
        source: SOURCE,
        after: AFTER,
        format: z
          .enum(["sheet", "midi", "abc"])
          .default("sheet")
          .describe("sheet: a PNG of the score. midi: a .mid file. abc: the score as ABC notation"),
        counts: z
          .boolean()
          .default(false)
          .describe("On the sheet, count the hands' notes under the staff: 1 e & a"),
      },
    },
    async ({ source, after, format, counts }) => {
      const { parsed, earlier } = parse(source, after)
      if (parsed.errors.length) return failed(parsed, earlier, source)
      if (!parsed.outputs.length) {
        return { isError: true, content: [text("Nothing to render: the cell has no play line.")] }
      }
      if (format === "midi") {
        const bytes = midiOf(parsed)
        const url = `${site}/api/midi?${query(source, after)}`
        return {
          content: [
            text(
              `A MIDI file of ${plural(parsed.outputs.length, "play")}, ${bytes.length} bytes: the drums on channel 10 with General MIDI notes, a track per instrument, the tempo and time signature in it. Download it at ${url}`,
            ),
            {
              type: "resource",
              resource: { uri: url, mimeType: "audio/midi", blob: bytes.toString("base64") },
            },
          ],
        }
      }
      const content: CallToolResult["content"] = []
      for (const [i, o] of parsed.outputs.entries()) {
        const sheet = await sheetOf(o, { counts })
        if (!sheet) continue
        if (format === "abc") {
          content.push(text(`${playLine(o, i)}\n\n${sheet.abc}`))
          continue
        }
        const png = await pngOf(sheet.svg, { width: sheet.width })
        const url = `${site}/api/sheet?${query(source, after)}&play=${i + 1}${counts ? "&counts=1" : ""}`
        content.push(text(`${playLine(o, i)}. The sheet as an image: ${url}`))
        content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" })
      }
      if (!content.length) content.push(text("Nothing to draw: the plays have no hits or notes."))
      return { content }
    },
  )

  registerAppTool(
    server,
    "link",
    {
      title: "A link that plays a cell",
      description:
        "A link that opens the playground on a cell, ready to play, with practice controls (tempo, loop, count-in, mute a part), sheet music, and WAV and MIDI downloads: send it, and it opens on a phone. Give cells instead of source for a link to a whole notebook of text and music cells. Where the client renders MCP Apps, the cell is drawn under the link as well, for the user to change and play.",
      _meta: { ui: { resourceUri: CELL_UI } },
      inputSchema: {
        source: SOURCE.optional(),
        cells: z
          .array(z.object({ type: z.enum(["text", "music"]), source: z.string() }))
          .optional()
          .describe("A notebook: text cells (markdown) and music cells, in order"),
      },
    },
    async ({ source, cells }) => {
      if (cells?.length) {
        const music = cells.filter((c) => c.type === "music")
        const bad = music.map((c) => parse(c.source).parsed.errors.length).filter(Boolean).length
        const note = bad
          ? ` ${plural(bad, "music cell")} of ${music.length} has errors; parse each to see them.`
          : ""
        return {
          content: [
            text(
              `Opens the playground on the notebook, ready to play:\n${notebookUrl(site, cells)}${note}`,
            ),
          ],
        }
      }
      if (!source)
        return { isError: true, content: [text("Give source (one cell) or cells (a notebook).")] }
      const { parsed } = parse(source)
      const warn = parsed.errors.length
        ? `\n\nThe cell has ${plural(parsed.errors.length, "error")}, so the link opens on the errors, not on music. Parse it to see them.`
        : ""
      return {
        content: [
          text(`Opens the playground on the cell, ready to play:\n${openUrl(site, source)}${warn}`),
        ],
      }
    },
  )

  server.registerTool(
    "library",
    {
      title: "Grooves and rudiments to start from",
      description:
        "Searches the grooves library: transcriptions (Porcupine Tree in 7 and 9, Gavin Harrison's paradiddle challenge, a 3 over 4 over 5 polyrhythm, Polyrhythmics), harmony cells (a ii–V–I with a walking bass, dorian, mixolydian and lydian vamps, a 12-bar blues, a harmonic-minor cadence, a phrygian riff, a lydian groove in 15/16) and the rudiments with their stickings. Each comes as a cell to start from, with its page and a link that plays it. Search by words (paradiddle, dorian, blues, 7/8, guitar) or leave the query empty for the list.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Words to look for in the titles, the notes and the code"),
      },
    },
    async ({ query: q }) => {
      const found = searchGrooves(q || "")
      if (!found.length) {
        return {
          content: [
            text(
              `Nothing in the library matches "${q}". The grooves are: ${GROOVES.map((g) => g.title).join(", ")}.`,
            ),
          ],
        }
      }
      const full = q ? found.slice(0, 3) : []
      const rest = q ? found.slice(3) : found
      const out: string[] = []
      for (const g of full) {
        out.push(
          `## ${g.title}\n${plain(g.byline)}\n\n${plain(g.body)}\n\n${fence(g.source)}\n\nPage: ${grooveUrl(g)}\nPlays at: ${openUrl(site, g.source)}`,
        )
      }
      if (rest.length) {
        out.push(
          (q ? "Also: " : "The library:\n") +
            rest
              .map(
                (g) =>
                  `- ${g.title} (${g.section.toLowerCase()}): ${plain(g.byline)}. ${plain(g.body).split(". ")[0]}. ${grooveUrl(g)}`,
              )
              .join("\n"),
        )
      }
      return { content: [text(out.join("\n\n"))] }
    },
  )

  const topics = [...REFERENCE.map((p) => p.id), "all"]
  server.registerTool(
    "reference",
    {
      title: "The language reference",
      description: `The language reference, page by page: ${REFERENCE.map((p) => `${p.id} (${p.description.replace(/\.$/, "").toLowerCase()})`).join(", ")}. Read the page before writing something you haven't written before; "all" is the whole reference.`,
      inputSchema: { topic: z.enum(topics as [string, ...string[]]).default("all") },
    },
    async ({ topic }) => {
      const pages = topic === "all" ? REFERENCE : REFERENCE.filter((p) => p.id === topic)
      return { content: [text(pages.map((p) => p.text).join("\n\n---\n\n"))] }
    },
  )

  registerCellApp(server)

  for (const page of REFERENCE) {
    server.registerResource(
      `reference-${page.id}`,
      `composer-nb://reference/${page.id}`,
      {
        title: `Reference: ${page.title}`,
        description: page.description,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: page.text }],
      }),
    )
  }
  for (const g of GROOVES) {
    const slug = slugOf(g.title)
    server.registerResource(
      `groove-${slug}`,
      `composer-nb://grooves/${slug}`,
      {
        title: g.title,
        description: `${plain(g.byline)}. ${plain(g.body)}`,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: `${grooveText(g)}\n\n${fence(g.source)}\n\nPage: ${grooveUrl(g)}\nPlays at: ${openUrl(site, g.source)}\n`,
          },
        ],
      }),
    )
  }

  return server
}
