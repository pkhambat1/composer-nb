import { parseHTML } from "linkedom"
import { readFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import { createHash } from "node:crypto"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it.each([undefined, "https://composer.example"])(
  "ships editor layout styles in the resource (asset origin: %s)",
  async (origin) => {
    vi.stubEnv("COMPOSER_NB_APP_ORIGIN", origin)
    vi.stubEnv("COMPOSER_NB_ORIGIN", undefined)
    const { cellHtml } = await import("../src/app.ts")
    const { document } = parseHTML(await cellHtml())
    const stylesheet = document.querySelector("[data-composer-editor]")
    const file = stylesheet?.getAttribute("href")?.split("/").at(-1)
    const css = file
      ? await readFile(new URL(`../app/dist/static/${file}`, import.meta.url), "utf8")
      : stylesheet?.textContent || ""
    // Without these rules Monaco exposes a native resizable textarea over its code.
    const inputRule = css.split("}").find((rule) => rule.startsWith(".monaco-editor .inputarea{"))
    expect(inputRule).toContain("resize:none")
    expect(inputRule).toContain("position:absolute")
    expect(inputRule).toContain("background-color:transparent")
    expect(css).toContain(".monaco-editor .view-lines")
  },
)

it("returns tiny hosted HTML with all content-addressed assets allowed by CSP", async () => {
  vi.stubEnv("COMPOSER_NB_APP_ORIGIN", undefined)
  vi.stubEnv("COMPOSER_NB_ORIGIN", "https://composer.example")
  const { registerCellApp, NOTEBOOK_UI } = await import("../src/app.ts")
  const server = new McpServer({ name: "resource-test", version: "0" })
  registerCellApp(server)
  const client = new Client({ name: "resource-test", version: "0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const resource = await client.readResource({ uri: NOTEBOOK_UI })
    // The previous response repeated 7.46 MB on every open. Stay tiny, well below
    // Vercel's 4.5 MB limit, and let the browser cache all unchanged assets.
    expect(Buffer.byteLength(JSON.stringify(resource))).toBeLessThan(10_000)
    const [page] = resource.contents
    if (!("text" in page)) throw new Error("Missing HTML page")
    const { document } = parseHTML(page.text)
    const urls = [
      document.documentElement.getAttribute("data-composer-app"),
      document.querySelector("script[type=module]")?.getAttribute("src"),
      document.querySelector("link[data-composer-editor]")?.getAttribute("href"),
    ]
    for (const url of urls) {
      expect(url).toMatch(
        /^https:\/\/composer\.example\/mcp-assets\/[\w-]+\.[a-f0-9]{16}\.(js|css)$/,
      )
      const file = new URL(url!).pathname.split("/").at(-1)!
      const contents = await readFile(new URL(`../app/dist/static/${file}`, import.meta.url))
      const hash = createHash("sha256").update(contents).digest("hex").slice(0, 16)
      expect(file).toContain(`.${hash}.`)
    }
    expect(document.querySelector("script")?.textContent).toBe("")
    expect(page._meta).toMatchObject({
      ui: {
        csp: { resourceDomains: expect.arrayContaining(["https://composer.example", "blob:"]) },
      },
    })
  } finally {
    await client.close()
    await server.close()
  }
})

it("keeps emitted assets compact and never requests a worker from the host sandbox", async () => {
  const renderer = await readFile(new URL("../app/dist/app.js", import.meta.url))
  const bootstrap = await readFile(new URL("../app/dist/bootstrap.js", import.meta.url))
  expect(renderer.toString()).not.toMatch(/["']\/assets\/editor\.worker-/)
  // These budgets cover the actual output, after Vite's library formatting.
  expect(renderer.length).toBeLessThan(6_000_000)
  expect(gzipSync(renderer).length).toBeLessThan(1_800_000)
  expect(bootstrap.length).toBeLessThan(520_000)
  expect(gzipSync(bootstrap).length).toBeLessThan(110_000)
})
