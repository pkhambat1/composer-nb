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
export const read = (file) => readFileSync(join(DOCS, file), "utf8")

// The composer-nb blocks on a page: each one's source, the line it starts on, and whether
// it's titled Invalid. A block inside a list is indented, and so is its closing fence.
export function examples(text) {
  const found: any[] = []
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

// %%music verse after intro: a Jupyter cell's name and the cell it continues from. Named
// cells hand their state to later blocks on the same page.
export function readMagic(source) {
  const m = /^%%music[ \t]*(.*)\n?/.exec(source)
  if (!m) return { body: source }
  const words = m[1].split(/\s+/).filter(Boolean)
  const at = words.indexOf("after")
  return {
    body: source.slice(m[0].length),
    name: at === 0 ? undefined : words[0],
    after: at < 0 ? undefined : words[at + 1],
  }
}
