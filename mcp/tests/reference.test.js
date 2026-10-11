/* mcp/reference.js is written from the docs; it can't fall behind them. */
import { it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { referenceSource } from "../scripts/reference.js"

it("reference.js is what the docs say now (run npm run build -w mcp)", () => {
  const file = readFileSync(fileURLToPath(new URL("../reference.js", import.meta.url)), "utf8")
  expect(file).toBe(referenceSource())
})
