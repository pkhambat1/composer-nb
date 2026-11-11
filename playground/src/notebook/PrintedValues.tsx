import React from "react"
import { printLayout, type PrintOutput } from "composer-nb/language"

// One line per type: the type, then each value with its pitches in parentheses after
// it. The spaces are real text, so a copied row pastes as one line.
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
                  <span className="print-value">{part.text}</span>
                  {part.note && <span className="print-meaning">({part.note})</span>}
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
