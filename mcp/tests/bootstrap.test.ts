import { parseHTML } from "linkedom"
import { expect, it, vi } from "vitest"

const handshake = vi.hoisted(() => {
  let finish: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  return { connect: vi.fn(() => pending), finish: () => finish() }
})
vi.mock("@modelcontextprotocol/ext-apps", () => ({
  App: class {
    connect = handshake.connect
  },
}))

it("finishes loading the module while its host handshake is pending", async () => {
  const { document, window } = parseHTML(
    '<html data-composer-app="https://composer.example/app.js"><body></body></html>',
  )
  vi.stubGlobal("document", document)
  vi.stubGlobal("window", window)
  vi.stubGlobal("__VERSION__", "test")
  try {
    // Top-level await would hold this import, potentially blocking host startup.
    await import("../app/bootstrap.ts")
    expect(handshake.connect).toHaveBeenCalledOnce()
    expect(document.querySelector("script")).toBeNull()
    handshake.finish()
    await vi.waitFor(() => {
      expect(document.querySelector("script")?.getAttribute("src")).toBe(
        "https://composer.example/app.js",
      )
    })
  } finally {
    vi.unstubAllGlobals()
  }
})
