/* The site as one Node HTTP server: the playground's build, the MCP server at /mcp, and the
   sheet and MIDI downloads at /api. It runs the functions in api/ as they are, so any host
   that runs Node (or Deno, as Deno Deploy does) can serve composer-nb. Build first
   (npm run build:site), then: node server/main.ts */
import { readFile, stat } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import type { Request, Response } from "../api/_vercel.ts"

const ROOT = fileURLToPath(new URL("../playground/dist/", import.meta.url))
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
}

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>

// Each function is loaded on its first request, so a cold start that only serves the
// playground doesn't load the MCP server or the renderer
const functions: Record<string, () => Promise<{ default: Handler }>> = {
  "/mcp": () => import("../api/mcp.ts"),
  "/api/mcp": () => import("../api/mcp.ts"),
  "/api/sheet": () => import("../api/sheet.ts"),
  "/api/midi": () => import("../api/midi.ts"),
}

// The query as Vercel hands it over: a parameter given more than once is an array
function queryOf(url: URL): Request["query"] {
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of url.searchParams) {
    const had = query[key]
    query[key] = had === undefined ? value : [...[had].flat(), value]
  }
  return query
}

async function serveFile(path: string, req: IncomingMessage, res: ServerResponse) {
  // normalize() drops any ../, so the path stays inside the build
  const file = join(ROOT, normalize(path === "/" ? "/index.html" : decodeURIComponent(path)))
  const info = await stat(file).catch(() => null)
  if (!file.startsWith(ROOT) || !info?.isFile()) {
    res.statusCode = 404
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.end("Not found")
    return
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream")
  res.setHeader("Content-Length", info.size)
  // Vite names what's in assets/ by its contents, so those never change; the rest can
  res.setHeader(
    "Cache-Control",
    path.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
  )
  res.end(req.method === "HEAD" ? undefined : await readFile(file))
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost")
    const load = functions[url.pathname.replace(/\/+$/, "") || "/"]
    if (load) {
      const handler = (await load()).default
      await handler(Object.assign(req, { query: queryOf(url) }), res)
    } else if (req.method === "GET" || req.method === "HEAD") {
      await serveFile(url.pathname, req, res)
    } else {
      res.statusCode = 405
      res.setHeader("Allow", "GET, HEAD")
      res.end()
    }
  } catch (error) {
    console.error(error)
    if (!res.headersSent) res.statusCode = 500
    res.end()
  }
})

const port = Number(process.env.PORT) || 8000
server.listen(port, () => console.log(`composer-nb on http://localhost:${port}`))
