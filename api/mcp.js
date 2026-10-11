/* composer-nb.vercel.app/mcp: the MCP server as a Vercel function, one request at a time.
   A client is told the playground's address from the request, so a preview deployment
   links to itself. */
import { handleMcp, siteOf } from "../mcp/http.js"
import { SITE } from "../mcp/site.js"

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  )
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version")
  if (req.method === "OPTIONS") {
    res.statusCode = 204
    res.end()
    return
  }
  await handleMcp(req, res, { site: siteOf(req, SITE) })
}
