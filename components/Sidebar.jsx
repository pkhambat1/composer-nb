// components/Sidebar.jsx — Left sidebar navigation

const SIDE_TABS = [
  { id: "notebook", label: "Notebook", hint: "Cells & playback" },
  { id: "chords", label: "Chord library", hint: "Browse chord shapes" },
]

function Sidebar({ sideTab, onTabChange, onStopAll }) {
  return (
    <aside className="app-lhs" aria-label="Workspace">
      <div className="lhs-brand">
        <span className="lhs-brand-title">Composer</span>
        <span className="lhs-brand-ext">.nb</span>
      </div>
      <nav className="lhs-nav">
        {SIDE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={"lhs-tab" + (sideTab === tab.id ? " lhs-tab-active" : "")}
            onClick={() => {
              if (sideTab === "notebook" && tab.id !== "notebook") onStopAll()
              onTabChange(tab.id)
            }}
            title={tab.hint}
          >
            <span className="lhs-tab-label">{tab.label}</span>
            <span className="lhs-tab-hint">{tab.hint}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
