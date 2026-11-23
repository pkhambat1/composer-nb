import React from "react"
import { printLayout, type PrintOutput } from "composer-nb/language"

// One line per type: a bold evaluated value, then regular-weight resolution arrows. The spaces are real text, so a copied row pastes as one line.
export default function PrintedValues({ prints }: { prints: PrintOutput[] }) {
  if (!prints.length) return null
  return (
    <div className="printed-values" role="log" aria-label="Printed values">
      {printLayout(prints).map((row, i) => (
        <div className="print-row" key={i}>
          <span className="print-type">{row.type}</span>{" "}
          <span className="print-parts">
            {row.parts.map((part, n) => (
              <React.Fragment key={n}>
                {n > 0 && " "}
                <span className={`print-part print-${part.kind}`} title={part.title}>
                  <strong className="print-value">{part.text}</strong>
                  {part.name && <span className="print-meaning"> → {part.name}</span>}
                  {part.note && (
                    <span className="print-meaning">
                      {" "}
                      → {part.kind === "chord" ? `(${part.note})` : part.note}
                    </span>
                  )}
                  {part.comma && <span className="print-comma">,</span>}
                </span>
              </React.Fragment>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
