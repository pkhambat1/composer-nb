// components/AccountMenu.tsx — Who's signed in, at the foot of the sidebar: their picture (or
// initial), name and email, opening a menu with dark mode, the keyboard shortcuts and sign out
import React from "react"
import type { Theme } from "../shared/types.ts"
import ShortcutsDialog from "./ShortcutsDialog.tsx"

// The signed-in person: Google sign-in gives a name and picture, email sign-in neither
export type Account = { email: string; name: string | null; avatarUrl: string | null }

function Avatar({ account }: { account: Account }) {
  const [broken, setBroken] = React.useState(false)
  if (account.avatarUrl && !broken)
    return (
      <img
        className="account-avatar"
        src={account.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    )
  const initial = (account.name || account.email).trim().charAt(0).toUpperCase() || "?"
  return (
    <span className="account-avatar account-avatar-initial" aria-hidden="true">
      {initial}
    </span>
  )
}

export default function AccountMenu({
  account,
  theme,
  onSetTheme,
  onSignOut,
}: {
  account: Account
  theme: Theme
  onSetTheme: (theme: Theme) => void
  onSignOut: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [shortcuts, setShortcuts] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const dark = theme === "dark"

  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="lhs-account" ref={wrapRef}>
      {open && (
        <div className="account-menu" role="menu" aria-label="Account">
          <div className="account-menu-head">
            {account.name && <span className="account-menu-name">{account.name}</span>}
            <span className="account-menu-email">{account.email}</span>
          </div>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={dark}
            className="menu-item"
            // Stays open: a switch shows its new state where it was flipped
            onClick={() => onSetTheme(dark ? "light" : "dark")}
          >
            <svg className="account-menu-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13.5 8.5a5.5 5.5 0 1 1-6-6 4 4 0 0 0 6 6z" />
            </svg>
            Dark mode
            <span className={"switch" + (dark ? " switch-on" : "")} aria-hidden="true" />
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              setShortcuts(true)
            }}
          >
            <svg className="account-menu-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
              <path d="M4 6.5h1M7.5 6.5h1M11 6.5h1M4.5 9.5h7" />
            </svg>
            Keyboard shortcuts
          </button>
          <div className="account-menu-rule" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            <svg className="account-menu-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10.5 11l3-3-3-3M13.5 8H6" />
            </svg>
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        className={"account-row" + (open ? " account-row-open" : "")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={account.email}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar account={account} />
        <span className="account-text">
          <span className="account-name">{account.name || account.email}</span>
          {account.name && <span className="account-email">{account.email}</span>}
        </span>
        <svg className="account-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 4.5L6 2l2.5 2.5M3.5 7.5L6 10l2.5-2.5" />
        </svg>
      </button>
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
    </div>
  )
}
