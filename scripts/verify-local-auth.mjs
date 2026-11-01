import { createClient } from "@supabase/supabase-js"
import { initialState, parseCell } from "composer-nb/language"
const url = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321"
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!key) throw new Error("Set VITE_SUPABASE_PUBLISHABLE_KEY")
const login = async (email) => { const c = createClient(url, key, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: "Composer123!" }); if (error) throw error; return c }
const rows = async (c) => { const { data, error } = await c.from("notebooks").select("id,title,owner_id,document,revision").is("deleted_at", null); if (error) throw error; return data }
const alice = await login("alice@composer.local"), bob = await login("bob@composer.local")
const a = await rows(alice), b = await rows(bob), anon = await rows(createClient(url, key, { auth: { persistSession: false } }))
if (a.length !== 2 || b.length !== 1 || anon.length !== 0) throw new Error(`RLS counts failed: Alice ${a.length}, Bob ${b.length}, anonymous ${anon.length}`)
const { data: cross, error } = await bob.from("notebooks").update({ title: "Unauthorized edit" }).eq("id", a[0].id).select("id")
if (error || cross.length) throw error || new Error("Cross-user update was allowed")

for (const notebook of [...a, ...b]) {
  let state = initialState()
  let playable = false
  for (const cell of notebook.document.cells) {
    if (cell.type !== "music") continue
    const parsed = parseCell(cell.source, state)
    state = parsed.state
    if (parsed.errors.length) throw new Error(`${notebook.title} has DSL errors: ${JSON.stringify(parsed.errors)}`)
    playable ||= parsed.outputs.some((output) => output.events.length > 0 || output.drumEvents.length > 0)
  }
  if (!playable) throw new Error(`${notebook.title} produces no playable events`)
}

const bobNotebook = b[0]
const { data: saved, error: saveError } = await bob.rpc("save_notebook", {
  notebook_id: bobNotebook.id,
  expected_revision: bobNotebook.revision,
  new_document: bobNotebook.document,
})
if (saveError) throw saveError
if (saved.revision !== bobNotebook.revision + 1) throw new Error("Autosave did not increment revision")
const { data: roundTrip, error: readError } = await bob.from("notebooks").select("document,revision").eq("id", bobNotebook.id).single()
if (readError) throw readError
if (JSON.stringify(roundTrip.document) !== JSON.stringify(bobNotebook.document)) throw new Error("Saved notebook did not round-trip")

console.log("Verified login, RLS isolation, playable DSL for every seed, autosave revision, and JSON round-trip.")
