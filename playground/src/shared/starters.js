/* The starter notebook, kept current: a notebook that still holds the starter cells exactly
   as they shipped is given the current starters when the page opens, so a fix to a starter
   reaches people who opened the playground before it. A notebook that has been changed at
   all is left as it is. */

// A short fingerprint of cells' types and sources (cyrb53), to tell starter cells as they
// shipped from cells someone has changed. Changing it forgets every notebook made so far.
export function fingerprint(cells) {
  const text = JSON.stringify(cells.map((c) => [c.type, c.source]))
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// The starters as they shipped before a notebook recorded which starters it was made from
// (2026-10-10 to 2026-10-16). A notebook made since carries its own `starters`, so this
// list doesn't grow.
const SHIPPED = new Set([
  "l82nd3ust4",
  "dbh7ml4w9m",
  "12fhy23j48m",
  "bjjcvyqw78",
  "197gkvzpubb",
  "mvpa1uhzwp",
  "1p3jgwp8zz1",
  "hp7igx0eb5",
  "1j9ow2m0bzb",
  "2bn9ym5hfsy",
])

// A notebook made from the starters and not changed since
export function untouched(nb) {
  const f = fingerprint(nb.cells)
  return f === nb.starters || SHIPPED.has(f)
}

// The store with every untouched starter notebook holding `starters`, or the same store
// when there's nothing to change. Titles, ids and when they were last changed stay.
export function refreshStarters(store, starters) {
  const now = fingerprint(starters)
  const cells = starters.map((c) => ({ type: c.type, source: c.source }))
  let changed = false
  const list = store.list.map((nb) => {
    if (!untouched(nb) || (nb.starters === now && fingerprint(nb.cells) === now)) return nb
    changed = true
    return { ...nb, cells, starters: now }
  })
  return changed ? { ...store, list } : store
}
