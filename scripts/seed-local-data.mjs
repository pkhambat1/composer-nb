import { createClient } from "@supabase/supabase-js"
import { initialState, parseCell } from "composer-nb/language"

const url = process.env.SUPABASE_URL || "http://127.0.0.1:54321"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
const checkOnly = process.argv.includes("--check")
const users = [
  { email: "alice@composer.local", name: "Alice Composer", notebooks: [
    ["Midnight progression", [{ type: "music", source: "with tempo 92, time 4 over 4, key A, mode minor { play { piano: chords i vi iii vii } }" }]],
    ["Seven eight sketch", [{ type: "text", source: "# Seven eight sketch" }, { type: "music", source: "with time 7 over 8, tempo 120 { play { kick: x--x---\nsnare: ----x-- } }" }]],
  ] },
  { email: "bob@composer.local", name: "Bob Beatmaker", notebooks: [
    ["Friday groove", [{ type: "music", source: "set tempo 108\nset time 4 over 4\nplay {\n  kick: 1 3&\n  snare: 2 4\n}" }]],
  ] },
]

function validateNotebook(title, cells) {
  let state = initialState()
  let playable = false
  for (const cell of cells) {
    if (cell.type !== "music") continue
    const parsed = parseCell(cell.source, state)
    state = parsed.state
    if (parsed.errors.length) {
      const details = parsed.errors.map((error) => `line ${error.line}: ${error.msg}`).join("; ")
      throw new Error(`Invalid seed notebook "${title}": ${details}`)
    }
    playable ||= parsed.outputs.some((output) => output.events.length > 0 || output.drumEvents.length > 0)
  }
  if (!playable) throw new Error(`Seed notebook "${title}" has no playable output`)
}

for (const user of users) for (const [title, cells] of user.notebooks) validateNotebook(title, cells)
if (checkOnly) {
  console.log("Validated every seeded notebook with the production DSL; all produce playable events.")
  process.exit(0)
}
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
  const rows = item.notebooks.map(([title, cells], index) => ({
    id: `${item.email.startsWith("alice") ? "10000000" : "20000000"}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    owner_id: user.id, title, document: { version: 1, cells }, revision: 1, deleted_at: null,
  }))
  const { error } = await client.from("notebooks").upsert(rows, { onConflict: "id" })
  if (error) throw error
}
console.log("Seeded Alice (2 notebooks) and Bob (1 notebook).")
console.log("Dummy login: alice@composer.local or bob@composer.local / Composer123!")
