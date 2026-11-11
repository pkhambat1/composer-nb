/* The composer-nb examples on the docs site (docs/*.mdx), shared by the docs test and the
   corpus. */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

export const DOCS = fileURLToPath(new URL("../../../docs", import.meta.url))
// Design notes sit beside the pages but aren't published (see docs/.mintignore).
export const pages = (readdirSync(DOCS, { recursive: true, encoding: "utf8" }) as string[])
  .filter((f) => f.endsWith(".mdx") && !f.startsWith("superpowers"))
  .sort()
export const read = (file: string) => readFileSync(join(DOCS, file), "utf8")

// The composer-nb blocks on a page: each one's source, the line it starts on, and whether
// it's titled Invalid. A block inside a list is indented, and so is its closing fence.
export function examples(text: string) {
  const found: { line: number; invalid: boolean; source: string }[] = []
  const fence = /^([ \t]*)```composer-nb([^\n]*)\n([\s\S]*?)\n\1```/gm
  for (const m of text.matchAll(fence)) {
    found.push({
      line: text.slice(0, m.index).split("\n").length,
      invalid: /\bInvalid\b/.test(m[2]),
      source: m[3]
        .split("\n")
        .map((l) => l.slice(m[1].length))
        .join("\n"),
    })
  }
  return found
}
