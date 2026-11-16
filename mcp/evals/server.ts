/* The test server: one MCP endpoint per run, each with notebooks of its own in memory, so
   runs in parallel never see each other and nothing reaches a real account. */
import { createServer as createHttpServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { handleMcp } from "../src/http.ts"
import { createServer } from "../src/server.ts"
import { MemoryWorkspace } from "./workspace.ts"

export type TestServer = {
  /** Serves the workspace for this run and returns the MCP URL */
  open(runId: string, workspace: MemoryWorkspace): string
  close(runId: string): void
  stop(): Promise<void>
}

export async function startServer(): Promise<TestServer> {
  const runs = new Map<string, MemoryWorkspace>()
  const http: Server = createHttpServer((req, res) => {
    const runId = req.url?.match(/^\/run\/([^/?]+)\/mcp(?:\?|$)/)?.[1]
    const workspace = runId ? runs.get(runId) : undefined
    if (!workspace) {
      res.writeHead(404).end("No such run")
      return
    }
    handleMcp(req, res, { workspace }).catch((err: unknown) => {
      console.error(err)
      if (!res.headersSent) res.writeHead(500).end()
    })
  })
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve))
  const { port } = http.address() as AddressInfo
  return {
    open(runId, workspace) {
      runs.set(runId, workspace)
      return `http://127.0.0.1:${port}/run/${runId}/mcp`
    },
    close: (runId) => void runs.delete(runId),
    stop: () =>
      new Promise<void>((resolve) => {
        http.closeAllConnections()
        http.close(() => resolve())
      }),
  }
}

/** The tools only the widget calls. A real host hides them from the model, so the eval does. */
export async function appOnlyTools(): Promise<string[]> {
  const server = createServer({ workspace: new MemoryWorkspace([]) })
  const client = new Client({ name: "eval", version: "0.0.0" })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  try {
    const { tools } = await client.listTools()
    return tools
      .filter((tool) => {
        const visibility = (tool._meta?.ui as { visibility?: unknown } | undefined)?.visibility
        return Array.isArray(visibility) && !visibility.includes("model")
      })
      .map((tool) => tool.name)
  } finally {
    await client.close()
    await server.close()
  }
}
