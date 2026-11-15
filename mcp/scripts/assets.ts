import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"

// File names depend only on their contents, so unchanged assets remain cached
// across notebook opens and releases. The function reads only this tiny manifest.
const root = new URL("../app/dist/", import.meta.url)
const destination = new URL("static/", root)
await mkdir(destination, { recursive: true })
async function publish(name: string) {
  const contents = await readFile(new URL(name, root))
  const hash = createHash("sha256").update(contents).digest("hex").slice(0, 16)
  const file = name.replace(/\.(js|css)$/, `.${hash}.$1`)
  await writeFile(new URL(file, destination), contents)
  return file
}
const manifest = {
  renderer: await publish("app.js"),
  bootstrap: await publish("bootstrap.js"),
  stylesheet: await publish("composer-nb-mcp.css"),
}
await writeFile(new URL("manifest.json", root), JSON.stringify(manifest))
