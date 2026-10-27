/* The server as a client sees it: every tool called over an in-memory transport, the
   resources listed and read. */
import { describe, it, expect, beforeAll } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createServer } from "../server.js"

const MUZAK = `set time 7 over 8
set tempo 90

pattern groove = {
  kick: x--x---
  snare: 2e 4
  snare.ghost: --x----
  hat: ^-x-
  bar 2 {
    snare.ghost: d3 d3e
    hat.open: ^3&
    hat.pedal: 4
  }
}

play {
  crash: 1
  groove
}`

const CHORDS = `set tempo 100
set key A
set mode minor

play piano: {
  chords i bVI|bIII bVII
  E5-------C5-------|E5---D5---C5---B4---
}`

let client
const call = async (name, args) => client.callTool({ name, arguments: args })
const textOf = (r) =>
  r.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")

beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair()
  await createServer({ site: "https://example.test" }).connect(b)
  client = new Client({ name: "test", version: "0" })
  await client.connect(a)
})

describe("tools", () => {
  it("are parse, render, link, library and reference", async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      "library",
      "link",
      "parse",
      "reference",
      "render",
    ])
  })

  it("parse reports a clean cell with its settings, names and a grid", async () => {
    const r = await call("parse", { source: MUZAK })
    expect(r.isError).toBeFalsy()
    const t = textOf(r)
    expect(t).toContain("No errors.")
    expect(t).toContain("time 7 over 8 · tempo 90")
    expect(t).toContain("pattern groove")
    expect(t).toContain("Play 1 (line 16)")
    expect(t).toContain("2 bars")
    expect(t).toMatch(/kick\s+x - - x - - - x - - x - - -/)
    expect(t).toMatch(/hat\.open\s+- - - - - - - - - - - - - -\n/)
  })

  it("parse reports errors with their lines and the line's text", async () => {
    const r = await call("parse", {
      source: "set tempo 90\n\nplay {\n  kick: x--x---\n  piano: Am F\n}",
    })
    expect(r.isError).toBe(true)
    const t = textOf(r)
    expect(t).toContain("1 error")
    expect(t).toMatch(/line 5: .*chords/)
    expect(t).toContain("piano: Am F")
  })

  it("parse takes an empty source as a cell for the user to write in", async () => {
    const r = await call("parse", { source: "  \n" })
    expect(r.isError).toBeFalsy()
    expect(textOf(r)).toMatch(/^An empty cell, for the user to write in\./)
  })

  it("parse starts from the cells in after", async () => {
    const r = await call("parse", {
      source: "play 1 bars groove",
      after: "set tempo 70\npattern groove = { kick: x--- }",
    })
    expect(r.isError).toBeFalsy()
    expect(textOf(r)).toContain("tempo 70")
  })

  it("parse hears the chords, with their notes the first time", async () => {
    const t = textOf(await call("parse", { source: CHORDS }))
    expect(t).toContain("key A minor")
    expect(t).toContain("Settings at the end: time 4 over 4 · tempo 100 · swing 50 · key A · mode minor")
    expect(t).toMatch(/chords bar 1: Am \(A C E\) · F \(F A C\)/)
    expect(t).toMatch(/piano\s+E5/)
  })

  it("render gives the ABC", async () => {
    const t = textOf(await call("render", { source: MUZAK, format: "abc" }))
    expect(t).toContain("X:1")
    expect(t).toContain("M:7/8")
    expect(t).toContain('V:H clef=perc stem=up name="drums"')
  })

  it("render draws the sheet as a PNG, with a link to it", async () => {
    const r = await call("render", { source: MUZAK, format: "sheet" })
    expect(r.isError).toBeFalsy()
    const image = r.content.find((c) => c.type === "image")
    expect(image.mimeType).toBe("image/png")
    const bytes = Buffer.from(image.data, "base64")
    expect(bytes.subarray(1, 4).toString()).toBe("PNG")
    expect(bytes.length).toBeGreaterThan(5000)
    expect(textOf(r)).toContain("https://example.test/api/sheet?src=")
  })

  it("render writes a MIDI file", async () => {
    const r = await call("render", { source: MUZAK, format: "midi" })
    const file = r.content.find((c) => c.type === "resource")
    expect(file.resource.mimeType).toBe("audio/midi")
    expect(Buffer.from(file.resource.blob, "base64").subarray(0, 4).toString()).toBe("MThd")
    expect(textOf(r)).toContain("/api/midi?src=")
  })

  it("render refuses a cell with errors, and says what they are", async () => {
    const r = await call("render", { source: "play { kick: xq }" })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toContain("line 1")
  })

  it("link opens the playground on the cell", async () => {
    const t = textOf(await call("link", { source: MUZAK }))
    expect(t).toContain("https://example.test/?open#src=set%20time%207%20over%208")
    expect(t).not.toContain("<iframe")
    expect(t).not.toContain("errors")
  })

  it("link warns when the cell has errors", async () => {
    const t = textOf(await call("link", { source: "play { kick: xq }" }))
    expect(t).toContain("1 error")
  })

  it("link takes a notebook of cells", async () => {
    const t = textOf(
      await call("link", {
        cells: [
          { type: "text", source: "# Hi" },
          { type: "music", source: MUZAK },
        ],
      }),
    )
    expect(t).toContain("https://example.test/?open#nb=")
  })

  it("library finds grooves by words, with their code and links", async () => {
    const t = textOf(await call("library", { query: "paradiddle" }))
    expect(t).toContain("## Single paradiddle")
    expect(t).toContain("sticking: RLRR LRLL")
    expect(t).toContain("https://example.test/grooves/single-paradiddle/")
    expect(t).toContain("https://example.test/?open#src=")
  })

  it("library lists everything without a query", async () => {
    const t = textOf(await call("library", {}))
    expect(t).toContain("The Sound of Muzak")
    expect(t).toContain("Five-stroke roll")
  })

  it("reference hands over a page, or all of them", async () => {
    const one = textOf(await call("reference", { topic: "settings" }))
    expect(one).toContain("# Settings")
    expect(one).toContain("| `tempo` |")
    const all = textOf(await call("reference", {}))
    expect(all).toContain("# Overview")
    expect(all).toContain("# play")
  })
})

describe("the MCP App", () => {
  it("is what parse and link name for a host that renders UI", async () => {
    const { tools } = await client.listTools()
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))
    expect(byName.parse._meta.ui.resourceUri).toBe("ui://composer-nb/cell")
    expect(byName.link._meta.ui.resourceUri).toBe("ui://composer-nb/cell")
    expect(byName.render._meta?.ui).toBeUndefined()
  })

  it("reads as one page with the player in it, and no way out to the playground", async () => {
    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri)).toContain("ui://composer-nb/cell")
    const [page] = (await client.readResource({ uri: "ui://composer-nb/cell" })).contents
    expect(page.mimeType).toBe("text/html;profile=mcp-app")
    expect(page.text).not.toContain("Open in the playground")
    expect(page.text).toContain("play-btn") // the player's Play button, from the bundled playground
    expect(page.text.match(/<\/script>/g)).toHaveLength(1) // the inline bundle closes no tag of its own
    expect(page._meta.ui.csp.connectDomains).toContain("https://cdn.jsdelivr.net")
    expect(page._meta.ui.csp.resourceDomains).toContain("https://fonts.gstatic.com")
  })

  it("leaves parse answering in text, with nothing structured to replace it", async () => {
    const r = await call("parse", { source: MUZAK })
    expect(r.structuredContent).toBeUndefined()
    expect(textOf(r)).toContain("No errors.")
  })
})

describe("resources", () => {
  it("list the reference pages and the grooves", async () => {
    const { resources } = await client.listResources()
    const uris = resources.map((r) => r.uri)
    expect(uris).toContain("composer-nb://reference/overview")
    expect(uris).toContain("composer-nb://grooves/the-sound-of-muzak")
  })

  it("read as markdown", async () => {
    const r = await client.readResource({ uri: "composer-nb://grooves/the-sound-of-muzak" })
    expect(r.contents[0].text).toContain("## The Sound of Muzak")
    expect(r.contents[0].text).toContain("```composer-nb")
  })
})
