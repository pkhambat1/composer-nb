/* The server over HTTP, as a deployment serves it: a request at a time, no session. */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createServer as createHttpServer } from "node:http"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { handleMcp, siteOf } from "../src/http.ts"

let server
let url

beforeAll(async () => {
  server = createHttpServer((req, res) => {
    handleMcp(req, res, { site: siteOf(req, "https://fallback.test") }).catch((err) => {
      console.error(err)
      if (!res.headersSent) res.writeHead(500).end()
    })
  })
  await new Promise((r) => server.listen(0, r))
  url = `http://localhost:${server.address().port}/mcp`
})

afterAll(() => server.close())

describe("over http", () => {
  it("answers a client, with links to the host it was asked at", async () => {
    const client = new Client({ name: "test", version: "0" })
    await client.connect(new StreamableHTTPClientTransport(new URL(url)))
    const { tools } = await client.listTools()
    expect(tools.length).toBe(4)
    const r = await client.callTool({ name: "library", arguments: { query: "paradiddle" } })
    expect(r.content[0].text).toContain(`http://localhost:${server.address().port}/grooves/single-paradiddle/`)
    await client.close()
  })
})
