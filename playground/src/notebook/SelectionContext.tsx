import React from "react"
import type { NotebookSelection } from "./types.ts"

export const SelectionContext = React.createContext<NotebookSelection | null>(null)
export const CellIdContext = React.createContext<string | null>(null)
export function useSelectedTarget() {
  const selection = React.useContext(SelectionContext)
  const cellId = React.useContext(CellIdContext)
  return (kind: NotebookSelection["kind"], label: string) =>
    selection?.cellId === cellId && selection?.kind === kind && selection.label === label
}

export function NotebookTarget({
  kind,
  label,
  className,
  children,
}: {
  kind: "sheet" | "chord"
  label: string
  className: string
  children: React.ReactNode
}) {
  const selected = useSelectedTarget()(kind, label)
  return (
    <div
      className={className}
      data-notebook-target={kind}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          event.currentTarget.click()
        }
      }}
    >
      {children}
    </div>
  )
}
