// components/ShortcutsDialog.tsx — The keyboard shortcuts, opened from the account menu: the
// notebook's own keys (useKeyboard) and the code editor's most useful ones
import React from "react"

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = MAC ? "⌘" : "Ctrl"
const ALT = MAC ? "⌥" : "Alt"

// Each shortcut: its keys (a space between keys pressed together, " / " between choices)
const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Running",
    keys: [
      ["Shift Enter", "Run the cell and go to the next"],
      [`${MOD} Enter`, "Run the cell and stay"],
      [`${ALT} Enter`, "Run the cell and add one below"],
    ],
  },
  {
    title: "Between cells",
    keys: [
      ["Enter", "Edit the selected cell"],
      ["Esc", "Leave the cell"],
      ["↑ / ↓", "Select the cell above or below"],
      ["A / B", "Add a cell above or below"],
      ["D D", "Delete the cell"],
      ["Z", "Bring back the cell last deleted"],
    ],
  },
  {
    title: "In the code",
    keys: [
      [`${MOD} /`, "Comment lines out, or back in"],
      ["Tab / Shift Tab", "Indent or outdent lines"],
      [`${MOD} D`, "Select the next match too"],
      [`${ALT} Click`, "Add a cursor"],
      [`${MOD} F`, "Find and replace"],
    ],
  },
]

function Keys({ keys }: { keys: string }) {
  return (
    <span className="shortcut-keys">
      {keys.split(" / ").map((choice, i) => (
        <React.Fragment key={choice}>
          {i > 0 && <span className="shortcut-or">or</span>}
          {choice.split(" ").map((k, j) => (
            <kbd key={j}>{k}</kbd>
          ))}
        </React.Fragment>
      ))}
    </span>
  )
}

export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = React.useRef<HTMLDialogElement>(null)

  React.useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // The dialog takes focus, not its close button, so nothing looks pressed on opening
      dialog.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="shortcuts-dialog"
      tabIndex={-1}
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      // A click on the dim backdrop lands on the dialog itself
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shortcuts-head">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      </div>
      {GROUPS.map((group) => (
        <section key={group.title} className="shortcuts-group">
          <h3>{group.title}</h3>
          <dl>
            {group.keys.map(([keys, does]) => (
              <div key={keys} className="shortcut">
                <dt>
                  <Keys keys={keys} />
                </dt>
                <dd>{does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </dialog>
  )
}
