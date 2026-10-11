// theme-panel.jsx — The look of the playground: light or dark, and how the hits are drawn.
// Kept on this device, so a choice holds from one visit to the next.
import React from "react"

const KEY = "composer-nb:settings"

function load(defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    return saved && typeof saved === "object" ? { ...defaults, ...saved } : defaults
  } catch {
    return defaults
  }
}

export function useTheme(defaults, { remember = true } = {}) {
  const [values, setValues] = React.useState(() => (remember ? load(defaults) : defaults))
  const setTheme = React.useCallback(
    (keyOrEdits, val) => {
      const edits =
        typeof keyOrEdits === "object" && keyOrEdits !== null ? keyOrEdits : { [keyOrEdits]: val }
      setValues((prev) => {
        const next = { ...prev, ...edits }
        if (remember) {
          try {
            localStorage.setItem(KEY, JSON.stringify(next))
          } catch {
            // storage not allowed: the choice holds for this visit
          }
        }
        return next
      })
    },
    [remember],
  )
  return [values, setTheme]
}
