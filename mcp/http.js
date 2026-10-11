/* The server over HTTP, one request at a time: a server and a transport of its own for each
   request and no session, which is what a serverless function can do and all these tools
   need. `req.body` is the parsed JSON when the host has read it already (Vercel does);
   otherwise the transport reads the request. Used by api/mcp.js on Vercel and by
   `composer-nb-mcp --http`. */
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { createServer } from "./server.js"

export async function handleMcp(req, res, options = {}) {
  const server = createServer(options)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  res.on("close", () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
}

// The playground's address for links, from the request when it was made to a deployment.
export function siteOf(req, fallback) {
  const host = req.headers["x-forwarded-host"] || req.headers.host
  if (!host) return fallback
  const proto = req.headers["x-forwarded-proto"] || (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}
