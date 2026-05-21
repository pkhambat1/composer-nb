// components/Toolbar.jsx — Top bar controls

function Toolbar({ onAdd, onRun, onRunAll, onStop, onDelete, kernelStatus, onOpenTweaks }) {
  const Icon = (children, viewBox = "0 0 16 16") => (
    <svg width="14" height="14" viewBox={viewBox} fill="currentColor">
      {children}
    </svg>
  )
  const btn = (title, onClick, children, opts = {}) => (
    <button
      className={
        "tb-btn" + (opts.primary ? " tb-btn-primary" : "") + (opts.danger ? " tb-btn-danger" : "")
      }
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="tb-group">
          {btn(
            "Insert cell below",
            onAdd,
            <span style={{ fontWeight: 700, fontSize: 16, lineHeight: "14px" }}>+</span>,
          )}
        </div>
        <div className="tb-group">
          {btn(
            "Run All cells",
            onRunAll,
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {kernelStatus === "busy" ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle
                    cx="7"
                    cy="7"
                    r="5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeDasharray="6 6"
                    strokeLinecap="round"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 7 7"
                      to="360 7 7"
                      dur="0.9s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
              ) : (
                Icon(
                  <>
                    <polygon points="2,2 7,8 2,14" />
                    <polygon points="8,2 13,8 8,14" />
                  </>,
                )
              )}
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {kernelStatus === "busy" ? "Running…" : "Run All"}
              </span>
            </span>,
            { primary: true },
          )}
          {btn(
            "Interrupt — stop audio",
            onStop,
            Icon(<rect x="3" y="3" width="10" height="10" />),
            { danger: true },
          )}
        </div>
      </div>
      <div className="toolbar-right">
        <button className="tb-btn tb-btn-theme" onClick={onOpenTweaks} title="Theme & display">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <circle cx="7" cy="7" r="4" />
            <path
              d="M7 1v2M7 11v2M1 7h2M11 7h2M2.6 2.6l1.4 1.4M10 10l1.4 1.4M2.6 11.4l1.4-1.4M10 4l1.4-1.4"
              strokeLinecap="round"
            />
          </svg>
          <span style={{ fontSize: 12 }}>Theme</span>
        </button>
        <span className="kernel-name">MusicKernel</span>
        <span className={"kernel-dot kernel-" + kernelStatus} title={kernelStatus} />
      </div>
    </div>
  )
}
