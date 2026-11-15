import { expect, it } from "vitest"
import { mergeCells } from "../app/merge.ts"
import type { DocumentCell } from "../src/notebook-document.ts"

const cell = (id: string, source = id): DocumentCell => ({ id, type: "music", source })
const base = [cell("a"), cell("b"), cell("c")]

it("keeps both sides' edits to different cells", () => {
  const mine = [cell("a", "mine"), cell("b"), cell("c")]
  const theirs = [cell("a"), cell("b"), cell("c", "theirs")]
  expect(mergeCells(base, mine, theirs)).toEqual([
    cell("a", "mine"),
    cell("b"),
    cell("c", "theirs"),
  ])
})
it("keeps the user's edit where both changed one cell", () => {
  expect(
    mergeCells(
      base,
      [cell("a", "mine"), cell("b"), cell("c")],
      [cell("a", "theirs"), cell("b"), cell("c")],
    )[0],
  ).toEqual(cell("a", "mine"))
})
it("keeps a cell they appended and a cell the user added, each in its place", () => {
  const mine = [cell("a"), cell("new"), cell("b"), cell("c")]
  const theirs = [...base, cell("appended")]
  expect(mergeCells(base, mine, theirs).map((c) => c.id)).toEqual([
    "a",
    "new",
    "b",
    "c",
    "appended",
  ])
})
it("drops what either side deleted, unless the user changed it", () => {
  expect(mergeCells(base, [cell("a"), cell("c")], base).map((c) => c.id)).toEqual(["a", "c"])
  expect(mergeCells(base, base, [cell("a"), cell("c")]).map((c) => c.id)).toEqual(["a", "c"])
  expect(
    mergeCells(base, [cell("a"), cell("b", "mine"), cell("c")], [cell("a"), cell("c")]),
  ).toEqual([cell("a"), cell("b", "mine"), cell("c")])
})
it("is theirs when the user changed nothing", () => {
  const theirs = [cell("c"), cell("a", "theirs")]
  expect(mergeCells(base, base, theirs)).toEqual(theirs)
})
