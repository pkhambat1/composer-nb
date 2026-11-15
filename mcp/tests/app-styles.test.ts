import { parseHTML } from "linkedom"
import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it.each([undefined, "https://composer.example"])(
  "ships editor layout styles in the resource (asset origin: %s)",
  async (origin) => {
    vi.stubEnv("COMPOSER_NB_APP_ORIGIN", origin)
    const { cellHtml } = await import("../src/app.ts")
    const { document } = parseHTML(await cellHtml())
    const css = document.querySelector("style[data-composer-editor]")?.textContent || ""
    // Without these rules Monaco exposes a native resizable textarea over its code.
    const inputRule = css.split("}").find((rule) => rule.startsWith(".monaco-editor .inputarea{"))
    expect(inputRule).toContain("resize:none")
    expect(inputRule).toContain("position:absolute")
    expect(inputRule).toContain("background-color:transparent")
    expect(css).toContain(".monaco-editor .view-lines")
    expect(document.querySelector("link[href$='.css']")).toBeNull()
  },
)
