import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { initialState, parseCell } from "composer-nb/language"

// The local accounts and their notebooks. Alice has none: she is there to check that one
// account can't read or change another's. Each notebook keeps its id, so seeding again
// puts these cells back in the same notebook.
const music = (source) => ({ type: "music", source: source.trim() })
const text = (source) => ({ type: "text", source: source.trim() })

const circleOfFifths = [
  text(`
# Circle of fifths

**1. Fifths through the scale, 100 BPM.** Pair scale chords with \`fifth(...)\`: C–G, Dm–Am and Em–Bdim, then close with F–C. Starting each pair on degree 1, 2 or 3 keeps the whole cycle in one register. These are scale intervals: the seven-chord cycle follows the key and mode.

Change **\`set key C\`** to move the cycle. \`print(tonic, fifth(tonic))\` shows the first transformation; the last line displays the complete chart automatically.

**2. Minor circle — piano, bass and drums, 96 BPM.** Numeric degrees spell the descending-fifths progression directly. The piano uses octave 2 and the bass octave 1; degree 8 is the tonic one octave above that instrument's base. An explicit \`5dom7\` supplies E7 before the return to Am. Change **\`set key A\`** to move the band. Print shows the resolved values without rhythmic marks.

Press **Run**, then **Play** on either cell.
`),
  music(`
set key C
set mode major
set time 4 over 4
set tempo 100
set octave 3

chords tonic = 1
chords fifthCircle = tonic fifth(tonic)
  |2 fifth(2)
  |3 fifth(3)
  |4 tonic

print(tonic, fifth(tonic))
play piano: chords fifthCircle
fifthCircle
`),
  music(`
set key A
set mode minor
set time 4 over 4
set tempo 96
set octave 2

chords minorChanges = 8m7|4m7|7dom7|3maj7|6maj7|2m7b5|5dom7|8m
notes minorBass = 8 7*- 12 7*-
  |4 7*- 8 7*-
  |7 7*- 11 7*-
  |3 7*- 7 7*-
  |6 7*- 10 7*-
  |2 7*- 6 7*-
  |5 7*- 9 7*-
  |8 15*-

pattern minorCircle = {
  piano: chords minorChanges,
  with octave 1 { bass: notes minorBass, },
  hat: ~-x-,
  snare.cross: 4*- x 3*-,
  kick: x 7*-,
}

with octave 1 { print(minorBass), }
play minorCircle
minorChanges
`),
]

const gavinHarrisonGrooves = [
  text(`
# Gavin Harrison grooves

Four playable studies from the project's groove library. Each cell uses **\`print(...)\`** to inspect a part and a **bare value on its last line** to display another. Run a cell, then press **Play**; edit its tempo to practise slower.

1. **The Sound of Muzak** — 7/8, 90 BPM. Two-bar groove with ghost notes and a hi-hat lift.
2. **What Happens Now?** — 7/8, 110 BPM. Shifting drum, ride-bell and muted-guitar cycles, with a rim pickup.
3. **Circle of Manias** — 9/8, 100 BPM. Open/closed hi-hats and interlocking kick/snare figures.
4. **Paradiddle challenge** — 3/4, 100 BPM. The feet play the paradiddle three times slower than the hands.

These are short groove studies, not full-song arrangements. The music cells below follow this order.
`),
  music(`
set time 7 over 8
set tempo 90

steps kickLine = x--x---
steps backbeat = 5*- x-
pattern groove = {
  kick: kickLine,
  snare: backbeat,
  snare.ghost: --x----,
  hat: ^-x-,
  pattern {
    snare.ghost: 8*- dd 4*-,
    hat.open: 10*- ^ 3*-,
    hat.pedal: 12*- x-,
  } on bar 2,
}

print(backbeat)
play block { crash: x 13*-, groove, }
kickLine
`),
  music(`
set time 7 over 8
set tempo 110
set key C
set mode major
set octave 2
set guitar.electric muted

notes guitarLine = D---E D-D--
pattern groove = {
  kick: x--x---,
  snare.rim: ----x--,
  ride.bell: x--,
  guitar.electric: notes guitarLine,
}

print(guitarLine)
play (
  block { snare.rim: ^-, }
  pattern { pattern { crash: x 13*-, } on bar 1, groove, }
) for 3 bars
fifth(guitarLine)
`),
  music(`
set time 9 over 8
set tempo 100

steps openHat = x---
steps kickLine = x--x-x---x--x-xx--
pattern manias = {
  hat.open: openHat,
  hat: --x-,
  kick: kickLine,
  snare: -------x-,
  snare.ghost: -xx ...-,
}

print(kickLine)
play manias for 4 bars
openHat
`),
  music(`
set time 3 over 4
set tempo 100

steps pa = ^---
steps radiddle = -xxx
steps footKick = ^-^^-^--
pattern hands = { snare: pa, snare.ghost: radiddle, }
pattern feet = every 3/4 beats { kick: footKick, hat.pedal: -x--x-xx, }

print(pa, radiddle)
play block { hands, feet, }
footKick
`),
]

export const users = [
  { email: "alice@composer.local", name: "Alice Composer", notebooks: [] },
  {
    email: "bob@composer.local",
    name: "Bob Beatmaker",
    notebooks: [
      { id: "7c7e0885-d2ce-4f59-86ae-d46bda4cad22", title: "Circle of fifths", cells: circleOfFifths },
      { id: "31b2a639-489d-427c-a0c4-99040cfd91af", title: "Gavin Harrison grooves", cells: gavinHarrisonGrooves },
    ],
  },
]

export function validateNotebook(title, cells) {
  let state = initialState()
  let playable = false
  for (const [index, cell] of cells.entries()) {
    if (cell.type !== "music") continue
    const parsed = parseCell(cell.source, state)
    state = parsed.state
    if (parsed.errors.length) {
      const details = parsed.errors.map((error) => `line ${error.line}: ${error.msg}`).join("; ")
      throw new Error(`Invalid seed notebook "${title}", cell ${index + 1}: ${details}`)
    }
    playable ||= parsed.outputs.some((output) => output.events.length > 0 || output.drumEvents.length > 0)
  }
  if (!playable) throw new Error(`Seed notebook "${title}" has no playable output`)
}

async function main() {
  const notebooks = users.flatMap((user) => user.notebooks)
  for (const nb of notebooks) validateNotebook(nb.title, nb.cells)
  if (process.argv.includes("--check")) {
    const musicCells = notebooks.flatMap((notebook) => notebook.cells).filter((cell) => cell.type === "music").length
    console.log(`Validated ${notebooks.length} seed notebooks (${musicCells} music cells) with the current DSL; every notebook produces playable events.`)
    return
  }

  const url = process.env.SUPABASE_URL || "http://127.0.0.1:54321"
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
  if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY from `supabase status -o env`.")
  const client = createClient(url, key, { auth: { persistSession: false } })
  const { data: existing, error: listError } = await client.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw listError
  for (const item of users) {
    let user = existing.users.find((candidate) => candidate.email === item.email)
    if (!user) {
      const { data, error } = await client.auth.admin.createUser({ email: item.email, password: "Composer123!", email_confirm: true, user_metadata: { name: item.name, seeded: true } })
      if (error) throw error
      user = data.user
    }
    const { data: notebooks, error: readError } = await client.from("notebooks")
      .select("id,document,revision,deleted_at").eq("owner_id", user.id)
    if (readError) throw readError

    // Reset only the two local test accounts to their fixtures. Retired notebooks
    // stay in the database as soft-deleted rows so their contents can be recovered.
    const keep = new Set(item.notebooks.map((notebook) => notebook.id))
    const retired = notebooks.filter((notebook) => !notebook.deleted_at && !keep.has(notebook.id))
    if (retired.length) {
      const { error } = await client.from("notebooks")
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("owner_id", user.id).in("id", retired.map((notebook) => notebook.id))
      if (error) throw error
    }
    if (!item.notebooks.length) continue
    const rows = item.notebooks.map(({ id, title, cells }) => {
      const previous = notebooks.find((notebook) => notebook.id === id)
      return {
        id, owner_id: user.id, title,
        document: {
          version: 1,
          cells: cells.map((cell, index) => ({ ...previous?.document.cells[index], ...cell })),
        },
        revision: (previous?.revision ?? 0) + 1,
        updated_at: new Date().toISOString(), deleted_at: null,
      }
    })
    const { error } = await client.from("notebooks").upsert(rows, { onConflict: "id" })
    if (error) throw error
  }
  console.log("Seeded Alice (no notebooks) and Bob (Circle of fifths, Gavin Harrison grooves); retired the other local test notebooks.")
  console.log("Dummy login: alice@composer.local or bob@composer.local / Composer123!")
}

// The auth verifier imports the same fixtures without running the seed operation.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
