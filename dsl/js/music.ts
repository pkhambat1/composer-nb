/* The JavaScript library: music(source) gives back the player as a DOM node, so it shows
   in an Observable notebook cell, or anywhere else it's put on a page. It's the Jupyter
   widget's player (widget/render.ts), with its styles carried inside the module. */
import css from "./widget/widget.css?inline"
import { renderCell } from "./widget/render.ts"

const TAG = "composer-nb-song"

// What a node music() returned plays: its chain of sources, its name, and the name of the
// song it carries on from
type Song = { sources: string[]; name: string; after: string }
// What each node music() returned plays
const songs = new WeakMap<HTMLElement, Song>()

// Another copy of the library on the page (an older version, say) has its own styles.
function addStyles() {
  for (const style of document.querySelectorAll<HTMLStyleElement>("style[data-composer-nb]"))
    if (style.textContent === css) return
  const style = document.createElement("style")
  style.dataset.composerNb = ""
  style.textContent = css
  document.head.append(style)
}

// A notebook swaps a cell's node for a new one each time the cell runs again, and nothing
// tells the old one. A custom element is told: it draws the player when it's put on the
// page (`show`, which returns what stops it), and stops the audio and frees it when it's
// taken off.
type SongElement = HTMLElement & { show?: () => () => void; stop?: (() => void) | null }

function defineElement() {
  if (customElements.get(TAG)) return
  customElements.define(
    TAG,
    class extends HTMLElement {
      declare show?: () => () => void
      declare stop?: (() => void) | null
      connectedCallback() {
        this.stop = this.show?.()
      }
      disconnectedCallback() {
        this.stop?.()
        this.stop = null
      }
    },
  )
}

// The player for one cell's worth of source. Pass `after` (what an earlier music() call
// returned) to start from the settings and names that song ended with, and `name` to
// label it and name its WAV file.
export function music(
  source: string,
  { after, name }: { after?: HTMLElement; name?: string } = {},
): HTMLElement {
  if (typeof source !== "string")
    throw new TypeError(`source must be a string, not ${source === null ? "null" : typeof source}`)
  if (after != null && !songs.has(after))
    throw new TypeError("after must be a song that music() returned")
  if (name != null && typeof name !== "string")
    throw new TypeError(`name must be a string, not ${typeof name}`)

  addStyles()
  defineElement()
  const before = after ? songs.get(after) : null
  const song: Song = {
    sources: [...(before ? before.sources : []), source],
    name: name ?? "",
    after: before ? before.name : "",
  }
  const el: SongElement = document.createElement(TAG)
  el.className = "cnb-host"
  el.show = () => renderCell(el, song)
  songs.set(el, song)
  return el
}
