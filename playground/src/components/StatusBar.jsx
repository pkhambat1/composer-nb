// components/StatusBar.jsx — Bottom status bar
import React from "react"

export default function StatusBar({ editingId, kernelStatus }) {
  const busy = kernelStatus === "busy" || kernelStatus === "rendering"
  return (
    <footer className="status-bar">
      <span className={"sb-status" + (busy ? " sb-status-busy" : "")}>
        {busy ? "Rendering\u2026" : "Ready"}
      </span>
      <span className="sb-spacer" />
      <span className="sb-shortcuts sb-dim">
        {editingId
          ? "Shift+Enter play \u00b7 Esc leave the cell"
          : "Enter edit \u00b7 A/B add a cell above/below \u00b7 DD delete \u00b7 Z undo"}
      </span>
    </footer>
  )
}
