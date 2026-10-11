/* After vite build: a page for each starter groove, at dist/grooves/<slug>/, and an index
   of them. A page is the groove's text, its code, and the playground embedded on it, so
   it plays where it's found. Run as `node scripts/grooves.js` from playground/. */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { marked } from "marked"
import { APP_CONSTANTS } from "../src/shared/constants.js"

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist")
const site = "https://composer-nb.vercel.app"

const slugOf = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

// The starters and the rudiments come in pairs: a text cell with a ## title, then the
// music cell.
const grooves = []
const sections = [
  ["Transcriptions", APP_CONSTANTS.STARTER_CELLS],
  ["Rudiments", APP_CONSTANTS.RUDIMENTS],
]
for (const [section, cells] of sections) {
  for (let i = 0; i + 1 < cells.length; i++) {
    const [text, music] = [cells[i], cells[i + 1]]
    if (text.type !== "text" || music.type !== "music") continue
    const title = /^##\s+(.+)$/m.exec(text.source)?.[1]
    if (!title) continue
    const body = text.source.replace(/^##\s+.+\n/, "")
    // The text is the byline, then the paragraph about the groove, then a link
    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("["))
    const description = (lines[1] || lines[0] || title).replace(/[`*]/g, "")
    grooves.push({ section, title, slug: slugOf(title), body, description, source: music.source })
  }
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const style = `
  :root { color-scheme: light; }
  body { margin: 0; background: #f7f7f7; color: #1a1a1a; font: 16px/1.55 "IBM Plex Sans", -apple-system, system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-family: "IBM Plex Serif", Georgia, serif; font-weight: 600; font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 20px; margin: 28px 0 6px; }
  a { color: #1a73e8; }
  nav { font-size: 14px; margin-bottom: 20px; }
  nav a + a { margin-left: 14px; }
  pre { background: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px 14px; overflow: auto; font: 13px/1.55 "IBM Plex Mono", ui-monospace, Menlo, monospace; }
  iframe { width: 100%; height: 420px; border: 0; border-radius: 6px; background: #fff; }
  .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 4px; padding: 14px 16px; margin: 12px 0; }
  .card h3 { margin: 0 0 4px; font-size: 18px; }
  .card p { margin: 0 0 8px; color: #585858; font-size: 14px; }
  .open { display: inline-block; margin: 12px 0 0; font-weight: 600; }
  footer { margin-top: 40px; font-size: 13px; color: #8a8a8a; }
`

const head = (title, description, path) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · composer-nb</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${site}${path}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Serif:wght@600&family=IBM+Plex+Mono&display=swap" rel="stylesheet">
<style>${style}</style>
</head>
<body>
<main>
<nav><a href="/">Playground</a><a href="/grooves/">Grooves</a><a href="https://pkhambat.mintlify.site">Docs</a></nav>`

const foot = `<footer>composer-nb: a music notebook, in place of paper. Write what plays, hear it, see it as sheet music.</footer>
</main>
</body>
</html>
`

// The embedded playground sizes itself: it says how tall it is
const embed = (source) => `<iframe src="/?embed#src=${encodeURIComponent(source)}" title="Play it" loading="lazy"></iframe>
<script>
addEventListener("message", (e) => {
  if (e.data && e.data.type === "composer-nb:height") document.querySelector("iframe").style.height = e.data.height + 16 + "px"
})
</script>`

mkdirSync(join(dist, "grooves"), { recursive: true })
for (const g of grooves) {
  const path = `/grooves/${g.slug}/`
  const html = `${head(g.title, g.description, path)}
<h1>${escape(g.title)}</h1>
${marked.parse(g.body)}
<h2>Play it</h2>
${embed(g.source)}
<a class="open" href="/?open#src=${encodeURIComponent(g.source)}">Open it in the playground, playing →</a>
<h2>The code</h2>
<pre>${escape(g.source)}</pre>
${foot}`
  mkdirSync(join(dist, "grooves", g.slug), { recursive: true })
  writeFileSync(join(dist, "grooves", g.slug, "index.html"), html)
}

const index = `${head("Grooves", "Transcriptions and exercises to play, slow down and start from: Porcupine Tree, Gavin Harrison's exercises, polyrhythms.", "/grooves/")}
<h1>Grooves</h1>
<p>Transcriptions and rudiments, each with the playground on it. Open one, slow it down, change it.</p>
${sections
  .map(
    ([section]) =>
      `<h2>${escape(section)}</h2>\n` +
      grooves
        .filter((g) => g.section === section)
        .map(
          (g) => `<div class="card"><h3><a href="/grooves/${g.slug}/">${escape(g.title)}</a></h3><p>${escape(g.description)}</p></div>`,
        )
        .join("\n"),
  )
  .join("\n")}
${foot}`
writeFileSync(join(dist, "grooves", "index.html"), index)

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[`${site}/`, `${site}/grooves/`, ...grooves.map((g) => `${site}/grooves/${g.slug}/`)].map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`
writeFileSync(join(dist, "sitemap.xml"), sitemap)
console.log(`grooves: ${grooves.length} pages, an index and a sitemap`)
