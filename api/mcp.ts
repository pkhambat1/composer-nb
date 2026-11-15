/* Hosted MCP always requires a linked Composer account. */
import type { Request, Response } from "./_vercel.ts"
import { composerApp } from "./_composer.ts"

export const config = { maxDuration: 10 }

export default async function handler(req: Request, res: Response) {
  const app = composerApp()
  if (app) {
    req.url = "/mcp"
    app(req, res)
    return
  }
  res.setHeader("Cache-Control", "no-store")
  res
    .writeHead(503, { "Content-Type": "application/json" })
    .end(JSON.stringify({ error: "Composer account linking is not configured" }))
}
