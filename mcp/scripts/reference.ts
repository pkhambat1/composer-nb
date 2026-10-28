/* Writes mcp/src/reference.ts from the docs site's reference pages, so the server hands an
   assistant the same reference the site shows, with nothing to keep in step by hand. Run by
   `npm run build -w mcp`; a test checks the file is what this would write. */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const DOCS = fileURLToPath(new URL("../../docs/", import.meta.url))
const SITE = "https://pkhambat.mintlify.site"
const OUT = fileURLToPath(new URL("../src/reference.ts", import.meta.url))
// The sidebar's groups that make up the reference: the shared core, then the two parts.
const GROUPS = ["Language", "Drums", "Pitched instruments"]

// The reference pages, in the sidebar's order, as { id, title, description, text }: the page
// as markdown, without the site's components.
// One page of the reference
export type Page = { id: string; title: string; description: string; text: string }

export function referencePages(): Page[] {
  const nav: { group: string; pages: string[] }[] = JSON.parse(
    readFileSync(DOCS + "docs.json", "utf8"),
  ).navigation.groups
  const pages = GROUPS.flatMap((name) => nav.find((g) => g.group === name)!.pages)
  return pages.map((page) => {
    const mdx = readFileSync(`${DOCS}${page}.mdx`, "utf8")
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(mdx)
    const meta: Record<string, string> = {}
    for (const line of (fm?.[1] || "").split("\n")) {
      const m = /^(\w+):\s*"?(.*?)"?\s*$/.exec(line)
      if (m) meta[m[1]] = m[2]
    }
    const body = mdx
      .slice(fm ? fm[0].length : 0)
      .split("\n")
      .filter((l) => !/^import\b/.test(l) && !/^<\/?Cell>/.test(l) && !/^<img /.test(l))
      .join("\n")
      .replace(/\]\(\//g, `](${SITE}/`)
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    return {
      id: page.split("/").pop()!,
      title: meta.title,
      description: meta.description,
      text: `# ${meta.title}\n\n${meta.description}\n\n${body}\n`,
    }
  })
}

export function referenceSource(): string {
  return (
    "// Generated from the docs' reference pages by scripts/reference.ts: run npm run reference -w mcp. Don't edit.\n" +
    `export const REFERENCE: { id: string; title: string; description: string; text: string }[] = ${JSON.stringify(referencePages(), null, 2)}\n`
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, referenceSource())
  console.log(`reference: ${referencePages().length} pages`)
}
