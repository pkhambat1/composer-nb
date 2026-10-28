/* /api/sheet?src=<cell>&play=1&counts=1&format=png: a play's sheet music as an image, so a
   link to it works anywhere an image does. `after` holds the earlier cells' source. The
   address holds the cell, so the image never changes and can be cached for good. */
import { parse } from "composer-nb-mcp/cell"
import { pngOf, sheetOf } from "composer-nb-mcp/render"
import type { Request, Response } from "./_vercel.ts"

export const config = { maxDuration: 30 }

// A parameter's value: the first, when it's given more than once
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default async function handler(req: Request, res: Response) {
  const query = req.query || {}
  const src = one(query.src) ?? ""
  const after = one(query.after)
  const play = one(query.play) ?? "1"
  const counts = one(query.counts)
  const format = one(query.format) ?? "png"
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
