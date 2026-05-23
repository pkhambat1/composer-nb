// theme-panel.jsx — Theme hook
import React from "react"

export function useTheme(defaults) {
  const [values, setValues] = React.useState(defaults)
  const setTheme = React.useCallback((keyOrEdits, val) => {
    const edits =
      typeof keyOrEdits === "object" && keyOrEdits !== null ? keyOrEdits : { [keyOrEdits]: val }
    setValues((prev) => ({ ...prev, ...edits }))
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits }, "*")
    window.dispatchEvent(new CustomEvent("themechange", { detail: edits }))
  }, [])
  return [values, setTheme]
}
