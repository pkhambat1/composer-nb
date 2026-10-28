/* mcp/src/reference.ts is written from the docs; it can't fall behind them. */
import { it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { referenceSource } from "../scripts/reference.ts"

it("reference.ts is what the docs say now (run npm run reference -w mcp)", () => {
  const file = readFileSync(fileURLToPath(new URL("../src/reference.ts", import.meta.url)), "utf8")
  expect(file).toBe(referenceSource())
})
