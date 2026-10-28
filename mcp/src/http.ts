/* The server over HTTP, one request at a time: a server and a transport of its own for each
   request and no session, which is what a serverless function can do and all these tools
   need. `req.body` is the parsed JSON when the host has read it already (Vercel does);
   otherwise the transport reads the request. Used by api/mcp.ts on Vercel and by
   `composer-nb-mcp --http`. */
import type { IncomingMessage, ServerResponse } from "node:http"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { createServer, type Options } from "./server.ts"

export async function handleMcp(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
  options: Options = {},
): Promise<void> {
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

// The site's address for links, from the request when it was made to a deployment.
export function siteOf(req: IncomingMessage, fallback?: string): string | undefined {
  // Node joins a header sent twice into one string, apart from a few it keeps as a list
  const header = (name: string) => {
    const value = req.headers[name]
    return Array.isArray(value) ? value[0] : value
  }
  const host = header("x-forwarded-host") || req.headers.host
  if (!host) return fallback
  const proto = header("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}
