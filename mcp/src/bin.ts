#!/usr/bin/env node
/* composer-nb-mcp: the server over stdio, for Claude Desktop, Claude Code, Cursor and the
   rest. `composer-nb-mcp --http 3333` serves it over HTTP at /mcp instead. COMPOSER_NB_SITE
   sets the site its links point at (the hosted one by default). */
import { createServer as createHttpServer } from "node:http"
import { readFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { handleMcp } from "./http.ts"
import { createServer } from "./server.ts"
import { FileNotebookStore } from "./notebook-file.ts"
import { resolve } from "node:path"
import { cellHtml } from "./app.ts"

const site = process.env.COMPOSER_NB_SITE || undefined
const args = process.argv.slice(2)
const at = args.indexOf("--http")
const notebookAt = args.indexOf("--notebook")
const notebookPath = notebookAt < 0 ? undefined : args[notebookAt + 1]
if (notebookAt >= 0 && (!notebookPath || notebookPath.startsWith("--")))
  throw new Error("--notebook requires a notebook JSON file path")
const notebook = notebookPath ? new FileNotebookStore(resolve(notebookPath)) : undefined

if (at >= 0) {
  const port = Number(args[at + 1]) || 3333
  createHttpServer((req, res) => {
    if (process.env.COMPOSER_DEBUG) console.error(req.method, req.url)
    if (req.method === "GET" && req.url === "/widget") {
      void cellHtml()
        .then((html) =>
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html),
        )
        .catch(() => res.writeHead(500).end("Build the MCP App first"))
      return
    }
    if (req.method === "GET" && req.url === "/app.js") {
      void readFile(new URL("../app/dist/app.js", import.meta.url))
        .then((source) => {
          res.setHeader("Access-Control-Allow-Origin", "*")
          res.setHeader("Content-Type", "text/javascript; charset=utf-8")
          res.setHeader("Cache-Control", "no-cache")
          if (req.headers["accept-encoding"]?.includes("gzip")) {
            res.setHeader("Content-Encoding", "gzip")
            res.end(gzipSync(source))
          } else res.end(source)
        })
        .catch(() => res.writeHead(404).end("Build the MCP App first"))
      return
    }
    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404).end("composer-nb-mcp serves MCP at /mcp")
      return
    }
    handleMcp(req, res, { site, notebook }).catch((err: unknown) => {
      console.error(err)
      if (!res.headersSent) res.writeHead(500).end()
    })
  }).listen(port, "127.0.0.1", () =>
    console.error(`composer-nb-mcp at http://localhost:${port}/mcp`),
  )
} else {
  const server = createServer({ site, notebook })
  await server.connect(new StdioServerTransport())
}
