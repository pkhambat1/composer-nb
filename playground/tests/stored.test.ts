import { describe, expect, it } from "vitest"
import { notebookStore, themeSettings } from "../src/shared/stored.ts"
import type { Settings } from "../src/shared/types.ts"

const defaults: Settings = {
  theme: "light",
  accent: "#1a73e8",
  drumView: "bricks",
  sheetCounts: false,
}
describe("stored notebook boundaries", () => {
  it("preserves valid notebook data and rejects malformed nested cells", () => {
    const valid = {
      current: "song",
      list: [{ id: "song", title: "Song", updated: 1, cells: [{ type: "music", source: "" }] }],
    }
    expect(notebookStore(valid)).toEqual(valid)
    for (const source of [123, null, {}, false]) {
      expect(
        notebookStore({
          ...valid,
          list: [{ ...valid.list[0], cells: [{ type: "music", source }] }],
        }),
      ).toBeNull()
    }
  })
  it("does not treat an arbitrary list as a typed notebook store", () => {
    for (const value of [null, [], { list: [] }, { current: null, list: ["song"] }])
      expect(notebookStore(value)).toBeNull()
  })
  it("restores valid preferences while falling back for invalid fields", () => {
    expect(themeSettings({ theme: "dark", sheetCounts: true }, defaults)).toEqual({
      ...defaults,
      theme: "dark",
      sheetCounts: true,
    })
    expect(
      themeSettings({ theme: 42, accent: {}, drumView: "unknown", sheetCounts: "yes" }, defaults),
    ).toEqual(defaults)
  })
})
