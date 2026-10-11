/* /api/sheet?src=<cell>&play=1&counts=1&format=png: a play's sheet music as an image, so a
   link to it works anywhere an image does. `after` holds the earlier cells' source. The
   address holds the cell, so the image never changes and can be cached for good. */
import { parse } from "../mcp/cell.js"
import { pngOf, sheetOf } from "../mcp/render.js"

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  const { src = "", after, play = "1", counts, format = "png" } = req.query || {}
  const { parsed } = parse(src, after)
  if (parsed.errors.length) {
    res.statusCode = 422
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ errors: parsed.errors }))
    return
  }
  const output = parsed.outputs[Number(play) - 1]
  const sheet = output && (await sheetOf(output, { counts: counts === "1" || counts === "true" }))
  if (!sheet) {
    res.statusCode = 404
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ error: output ? "nothing to draw in this play" : "no such play" }))
    return
  }
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
  res.setHeader("Access-Control-Allow-Origin", "*")
  if (format === "svg") {
    res.setHeader("Content-Type", "image/svg+xml")
    res.end(sheet.svg)
    return
  }
  res.setHeader("Content-Type", "image/png")
  res.end(await pngOf(sheet.svg, { width: sheet.width }))
}
