/* /api/midi?src=<cell>: the cell's plays as a MIDI file to download, one after another.
   `after` holds the earlier cells' source. */
import { parse } from "../mcp/cell.js"
import { midiOf } from "../mcp/render.js"

export default async function handler(req, res) {
  const { src = "", after, name = "composer-nb" } = req.query || {}
  const { parsed } = parse(src, after)
  if (parsed.errors.length) {
    res.statusCode = 422
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ errors: parsed.errors }))
    return
  }
  if (!parsed.outputs.length) {
    res.statusCode = 404
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ error: "nothing plays in this cell" }))
    return
  }
  const file = String(name).replace(/[^\w.-]+/g, "-") || "composer-nb"
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Content-Type", "audio/midi")
  res.setHeader("Content-Disposition", `attachment; filename="${file}.mid"`)
  res.end(midiOf(parsed))
}
