// What can be muted while practising: the feet, the hands, or an instrument, named by a
// key in a set. The audio is rendered again without them; the grid dims their rows.
const FEET = new Set(["kick", "hat.pedal"])

// Whether a hit on `lane`, or a note on `instrument`, is muted.
export function quietens(muted, lane, instrument) {
  if (!muted.size) return false
  if (instrument) return muted.has(instrument)
  if (lane === "sticking") return false
  return muted.has(FEET.has(lane) ? "feet" : "hands")
}

// What a cell's output offers to mute: { key, label }
export function muteChoices(parsed) {
  const out = []
  const lanes = new Set(parsed.drumEvents.filter((e) => !e.hidden).map((e) => e.lane))
  if ([...lanes].some((l) => FEET.has(l))) out.push({ key: "feet", label: "Feet: kick, pedal" })
  if ([...lanes].some((l) => !FEET.has(l) && l !== "sticking")) out.push({ key: "hands", label: "Hands" })
  for (const inst of new Set(parsed.events.filter((e) => e.note || e.chord).map((e) => e.instrument))) {
    out.push({ key: inst, label: inst })
  }
  return out
}
