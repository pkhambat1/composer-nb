// theme-panel.tsx — The look of the playground: light or dark, and how the hits are drawn.
// Kept on this device, so a choice holds from one visit to the next.
import React from "react"
import type { Settings } from "../shared/types.ts"

const KEY = "composer-nb:settings"

// Changes one setting, or several at once
export type SetSetting = {
  <K extends keyof Settings>(key: K, value: Settings[K]): void
  (edits: Partial<Settings>): void
}

function load(defaults: Settings): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null")
    return saved && typeof saved === "object" ? { ...defaults, ...saved } : defaults
  } catch {
    return defaults
  }
}

export function useTheme(defaults: Settings, { remember = true } = {}): [Settings, SetSetting] {
  const [values, setValues] = React.useState(() => (remember ? load(defaults) : defaults))
  const setTheme = React.useCallback(
    (keyOrEdits: keyof Settings | Partial<Settings>, val?: Settings[keyof Settings]) => {
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
  return [values, setTheme as SetSetting]
}
