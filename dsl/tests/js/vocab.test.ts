/* The docs site colours composer-nb code with its own grammar (docs/languages/composer-nb.json),
   which can't import vocab.ts. So every word the language knows has to be one the grammar
   colours: a kit piece or instrument before its colon, a type in a declaration, a setting
   after set, a keyword and a kit. (The Python completer's copy is checked in
   tests/python/test_completer.py.) */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { KEYWORDS } from "../../js/language.ts"
import { KITS, PARTS, SETTINGS, SOUNDS, SWING, TYPES } from "../../js/vocab.ts"

const grammar = JSON.parse(
  readFileSync(new URL("../../../docs/languages/composer-nb.json", import.meta.url), "utf8"),
)
// A rule's pattern, anchored to the start, and the name it captured from `text`
const rule = (name) => new RegExp(grammar.repository[name].match)
const captured = (name, text, group = 1) => rule(name).exec(text)?.[group]

describe("the docs grammar knows every word", () => {
  it("every kit piece and instrument, before its colon", () => {
    for (const part of PARTS) expect(captured("instrument", `${part}: x-`), part).toBe(part)
  })

  it("every type, in a declaration", () => {
    for (const type of TYPES) expect(captured("declaration", `${type} fig = x-`), type).toBe(type)
  })

  it("every setting and every instrument with a sound, after set", () => {
    for (const name of [...SETTINGS, ...Object.keys(SOUNDS)]) {
      expect(captured("setting", `set ${name} 1`, 2), name).toBe(name)
    }
  })

  it("every keyword that isn't a type", () => {
    for (const word of KEYWORDS.filter((w) => !(TYPES as readonly string[]).includes(w))) {
      expect(captured("keyword", word, 0), word).toBe(word)
    }
  })

  it("every kit", () => {
    for (const kit of KITS) expect(captured("value", `set kit ${kit}`, 0), kit).toBe(kit)
  })

  it("swing on and off", () => {
    for (const v of SWING) expect(captured("value", `set swing ${v}`, 0), v).toBe(v)
  })
})
