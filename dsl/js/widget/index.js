/* anywidget front end for the Python library: draws the player (render.js) from the
   widget's traits, and again whenever `sources` changes. */
import "./widget.css"
import { renderCell } from "./render.js"

export default {
  render({ model, el }) {
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
