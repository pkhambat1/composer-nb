/* anywidget front end for the Python library: draws the player (render.ts) from the
   widget's traits, and again whenever `sources` changes. */
import "./widget.css"
import { renderCell } from "./render.ts"

// What anywidget hands the front end: the widget's traits, which it can read and listen to
type Model = {
  get(name: "sources"): string[]
  get(name: "name" | "after"): string
  on(event: string, fn: () => void): void
  off(event: string, fn: () => void): void
}

export default {
  render({ model, el }: { model: Model; el: HTMLElement }) {
    el.classList.add("cnb-host")
    const show = () =>
      renderCell(el, {
        sources: model.get("sources"),
        name: model.get("name"),
        after: model.get("after"),
      })
    let dispose = show()
    const onChange = () => {
      dispose()
      dispose = show()
    }
    model.on("change:sources", onChange)
    return () => {
      model.off("change:sources", onChange)
      dispose()
    }
  },
}
