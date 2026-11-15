import { createServer } from "node:http"
import { expect, it, vi } from "vitest"
import handler from "../../api/mcp.ts"

vi.mock("../../api/_composer.ts", () => ({ composerApp: () => null }))

it("rejects hosted MCP access when account linking is not configured", async () => {
  const server = createServer(handler)
  server.listen(0, "127.0.0.1")
  await new Promise<void>((resolve) => server.once("listening", resolve))
  try {
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No test server")
    const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "Composer account linking is not configured" })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
