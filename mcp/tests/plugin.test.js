/* The Claude plugin in plugin/: its skills' examples parse on this engine, and the
   marketplace, the manifest and the connector agree. A language change that breaks an
   example fails here. */
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parse } from "../cell.js"

const root = fileURLToPath(new URL("../../", import.meta.url))
const json = (path) => JSON.parse(readFileSync(root + path, "utf8"))
const skills = readdirSync(root + "plugin/skills")

describe("plugin skills", () => {
  for (const skill of skills) {
    // Each example is parsed after the ones above it in the same skill, as cells in a notebook.
    it(`${skill}: every example parses`, () => {
      const text = readFileSync(`${root}plugin/skills/${skill}/SKILL.md`, "utf8")
      const blocks = [...text.matchAll(/^```composer-nb\n([\s\S]*?)\n```/gm)].map((m) => m[1])
      expect(blocks.length).toBeGreaterThan(0)
      blocks.forEach((source, i) => {
        const after = blocks.slice(0, i).join("\n\n") || undefined
        const { parsed } = parse(source, after)
        expect(parsed.errors, `example ${i + 1}:\n${source}`).toEqual([])
      })
    })
  }

  it("each skill's name is its folder", () => {
    for (const skill of skills) {
      const text = readFileSync(`${root}plugin/skills/${skill}/SKILL.md`, "utf8")
      expect(text).toMatch(new RegExp(`^---\\nname: ${skill}\\ndescription: .+\\n---\\n`))
    }
  })
})

it("the marketplace lists the plugin under its own name, and the plugin connects to /mcp", () => {
  const market = json(".claude-plugin/marketplace.json")
  const [entry] = market.plugins
  const manifest = json(entry.source + "/.claude-plugin/plugin.json")
  expect(entry.name).toBe(manifest.name)
  expect(existsSync(root + entry.source + "/skills")).toBe(true)
  const { mcpServers } = json(entry.source + "/.mcp.json")
  expect(mcpServers[manifest.name]).toEqual({
    type: "http",
    url: "https://composer-nb.vercel.app/mcp",
  })
})
