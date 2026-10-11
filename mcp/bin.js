#!/usr/bin/env node
/* composer-nb-mcp: the server over stdio, for Claude Desktop, Claude Code, Cursor and the
   rest. `composer-nb-mcp --http 3333` serves it over HTTP at /mcp instead. COMPOSER_NB_SITE
   sets the playground the links open (the hosted one by default). */
import { createServer as createHttpServer } from "node:http"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { handleMcp } from "./http.js"
import { createServer } from "./server.js"

const site = process.env.COMPOSER_NB_SITE || undefined
const args = process.argv.slice(2)
const at = args.indexOf("--http")

if (at >= 0) {
  const port = Number(args[at + 1]) || 3333
  createHttpServer((req, res) => {
    if (!req.url.startsWith("/mcp")) {
      res.writeHead(404).end("composer-nb-mcp serves MCP at /mcp")
      return
    }
    handleMcp(req, res, { site }).catch((err) => {
      console.error(err)
      if (!res.headersSent) res.writeHead(500).end()
    })
  }).listen(port, () => console.error(`composer-nb-mcp at http://localhost:${port}/mcp`))
} else {
  const server = createServer({ site })
  await server.connect(new StdioServerTransport())
}
