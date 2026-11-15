import type { Request, Response } from "./_vercel.ts"
import { composerApp } from "./_composer.ts"

export default function handler(req: Request, res: Response) {
  const app = composerApp()
  if (!app) {
    res
      .writeHead(503, { "Content-Type": "application/json" })
      .end(JSON.stringify({ error: "Notebook account linking is not configured" }))
    return
  }
  // Explicit rewrite destinations preserve the original public OAuth path.
  const route = req.query?.route
  if (
    typeof route !== "string" ||
    !/^\/(authorize|token|register|revoke|oauth\/(request|decision|connections|disconnect)|\.well-known\/oauth-(authorization-server|protected-resource)(\/mcp)?)$/.test(
      route,
    )
  ) {
    res.writeHead(404).end()
    return
  }
  const query = new URL(req.url || "/", "http://localhost").searchParams
  query.delete("route")
  req.url = `${route}?${query}`
  app(req, res)
}
