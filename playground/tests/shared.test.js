/* Notebooks kept from shared links, before sharing was taken out, are dropped when the page
   opens: they went by "Shared notebook" or "Shared cell". */
import { describe, it, expect } from "vitest"
import { dropShared } from "../src/hooks/useNotebooks.ts"

const nb = (id, title) => ({ id, title, cells: [], updated: 1 })

describe("notebooks from shared links", () => {
  it("go, and the first one left opens in place of one that was open", () => {
    const store = {
      current: "b",
      list: [
        nb("a", "Welcome"),
        nb("b", "Shared notebook"),
        nb("c", "Shared cell"),
        nb("d", "waltz"),
      ],
    }
    expect(dropShared(store)).toEqual({
      current: "a",
      list: [nb("a", "Welcome"), nb("d", "waltz")],
    })
  })

  it("leave a store without them as it is", () => {
    const store = { current: "a", list: [nb("a", "Welcome")] }
    expect(dropShared(store)).toBe(store)
  })
})
