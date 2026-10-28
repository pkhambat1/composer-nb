/* Embed mode: the playground as a single cell in a frame, which is how the docs site and the
   groove pages show an example you can edit and play (/?embed#src=...&theme=dark). The
   frame tells its parent how tall it is, so the parent can size it (composer-nb:height),
   and follows the parent's theme when the parent says it changed (composer-nb:theme). */
import { isTheme } from "composer-nb/links"
import type { SavedCell, Theme } from "./types.ts"

const query = new URLSearchParams(window.location.search)
const hash = new URLSearchParams(window.location.hash.slice(1))

export const EMBED = query.has("embed")

// The frame's cell is read when the page loads, so a new address loads the page again
if (EMBED) window.addEventListener("hashchange", () => window.location.reload())

// The cell the frame opens with.
export function embedCell(): SavedCell {
  return { type: "music", source: hash.get("src") || "" }
}

export function embedTheme(): Theme {
  const theme = hash.get("theme")
  return isTheme(theme) ? theme : "light"
}

// Tells the parent page how tall `el` is, now and whenever that changes.
export function reportHeight(el: HTMLElement): () => void {
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
export function listenForTheme(onTheme: (theme: Theme) => void): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.source !== window.parent || e.data?.type !== "composer-nb:theme") return
    if (isTheme(e.data.theme)) onTheme(e.data.theme)
  }
  window.addEventListener("message", onMessage)
  return () => window.removeEventListener("message", onMessage)
}
