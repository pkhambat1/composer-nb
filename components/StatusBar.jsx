// components/StatusBar.jsx — Bottom status bar

function StatusBar({ editingId, kernelStatus }) {
  return (
    <footer className="status-bar">
      <span className="sb-item">Composer.nb</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">MusicKernel | {kernelStatus === "busy" || kernelStatus === "rendering" ? "Busy" : "Idle"}</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">Mode: {editingId ? "Edit" : "Command"}</span>
      <span className="sb-spacer" />
      <span className="sb-shortcuts sb-dim">
        Shift+Enter run · Esc exit edit · A/B insert · DD delete · Z undo
      </span>
    </footer>
  )
}
