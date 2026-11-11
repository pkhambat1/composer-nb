import { createClient } from "@supabase/supabase-js"
import { users, validateNotebook } from "./seed-local-data.mjs"
const url = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321"
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!key) throw new Error("Set VITE_SUPABASE_PUBLISHABLE_KEY")
const login = async (email) => { const c = createClient(url, key, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: "Composer123!" }); if (error) throw error; return c }
const rows = async (c) => { const { data, error } = await c.from("notebooks").select("id,title,owner_id,document,revision").is("deleted_at", null); if (error) throw error; return data }
const alice = await login("alice@composer.local"), bob = await login("bob@composer.local")
const a = await rows(alice), b = await rows(bob), anon = await rows(createClient(url, key, { auth: { persistSession: false } }))
for (const [email, notebooks] of [["alice@composer.local", a], ["bob@composer.local", b]]) {
  const expected = users.find((user) => user.email === email).notebooks.map((notebook) => notebook.id).sort()
  const actual = notebooks.map((notebook) => notebook.id).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`RLS notebook set failed for ${email}: expected ${expected.length}, got ${actual.length}`)
}
if (anon.length !== 0) throw new Error(`Anonymous users can read ${anon.length} notebooks`)
// Alice has no notebooks; she must still be unable to read or update Bob's.
const { data: hidden, error: hiddenError } = await alice.from("notebooks").select("id").eq("id", b[0].id)
if (hiddenError || hidden.length) throw hiddenError || new Error("Cross-user read was allowed")
const { data: cross, error } = await alice.from("notebooks").update({ title: b[0].title }).eq("id", b[0].id).select("id")
if (error || cross.length) throw error || new Error("Cross-user update was allowed")

for (const notebook of [...a, ...b]) {
  validateNotebook(notebook.title, notebook.document.cells)
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
