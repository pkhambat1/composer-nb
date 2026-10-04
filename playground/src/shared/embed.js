/* Embed mode: the playground as a single cell in a frame, which is how the docs site shows
   an example you can edit and play. The address is
     /?embed#src=<the cell's source, URI-encoded>&theme=dark
   where theme is optional. The frame tells its parent how tall it is, so the parent can
   size it (composer-nb:height), and follows the parent's theme when the parent says it
   changed (composer-nb:theme). */

const THEMES = ["light", "dark"]
const hash = new URLSearchParams(window.location.hash.slice(1))

export const EMBED = new URLSearchParams(window.location.search).has("embed")

// The cell the frame opens with.
export function embedCell() {
  return { type: "music", source: hash.get("src") || "" }
}

export function embedTheme() {
  const theme = hash.get("theme")
  return THEMES.includes(theme) ? theme : "light"
}

// Tells the parent page how tall `el` is, now and whenever that changes.
export function reportHeight(el) {
  const send = () => {
    const height = Math.ceil(el.getBoundingClientRect().height)
    window.parent.postMessage({ type: "composer-nb:height", height }, "*")
  }
  const observer = new ResizeObserver(send)
  observer.observe(el)
  send()
  return () => observer.disconnect()
}

// Calls `onTheme` when the parent page switches between light and dark.
export function listenForTheme(onTheme) {
  const onMessage = (e) => {
    if (e.source !== window.parent || e.data?.type !== "composer-nb:theme") return
    if (THEMES.includes(e.data.theme)) onTheme(e.data.theme)
  }
  window.addEventListener("message", onMessage)
  return () => window.removeEventListener("message", onMessage)
}
