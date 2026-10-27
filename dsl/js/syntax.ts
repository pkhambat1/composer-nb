/* A cell as the parser reads it: tokens, and a tree of statements and blocks, each with
   where it was written. Declared here once, so every phase after the parser (checking,
   evaluating, highlighting) switches over the same kinds, and tsc lists every switch that
   misses one when a kind is added: end a switch with `default: return unhandled(node)`.

   What a statement holds after its head stays text for now, with its span: steps, notes,
   charts and sequences are still read by language.js. */

// Where something was written: lines from 1, columns from 0, the end just past it.
export type Span = { line: number; col: number; endLine: number; endCol: number }

// The lexer's pieces. Together they are the whole cell, character for character.
//   text     anything that isn't one of the others, brackets ( ) included
//   open     {
//   close    }
//   newline  a line break that ends a statement
//   join     a line break that doesn't: inside ( ), or before a line that starts with |
//   comment  // to the end of the line
export type TokenKind = "text" | "open" | "close" | "newline" | "join" | "comment"
export type Token = { kind: TokenKind; text: string; span: Span }

// What a statement holds after its head: text, and blocks in braces, in the order they
// were written. 4 bars { ... } is a text and a block.
export type Text = { kind: "text"; text: string; span: Span }
export type Block = { kind: "block"; statements: Statement[]; span: Span }
export type Value = { parts: (Text | Block)[]; span: Span | null }

// A line, by what it starts with:
//   set      set tempo 90
//   decl     steps pair = ^-x-, pattern groove = { ... }, or a name and = with no type
//   play     play groove, play { ... }
//   with     with key E, mode minor { ... }
//   place    bar 2 { ... }, bar 3 to 4 fill
//   pace     every 3 steps { ... }
//   track    kick: x--x, piano: chords Am F
//   line     patterns to play, inside braces: intro verse, (aa bb), 4 bars groove
export type SetNode = { kind: "set"; span: Span; setting: string; value: Value }
export type DeclNode = { kind: "decl"; span: Span; type: string | null; name: string; value: Value }
export type PlayNode = { kind: "play"; span: Span; value: Value }
export type WithNode = { kind: "with"; span: Span; settings: Value; value: Value }
export type PlaceNode = { kind: "place"; span: Span; value: Value }
export type PaceNode = { kind: "pace"; span: Span; value: Value }
export type TrackNode = { kind: "track"; span: Span; part: string; value: Value }
export type LineNode = { kind: "line"; span: Span; value: Value }
export type Node =
  | SetNode
  | DeclNode
  | PlayNode
  | WithNode
  | PlaceNode
  | PaceNode
  | TrackNode
  | LineNode
// A statement keeps everything it holds, its head too, as `parts`.
export type Statement = Node & { parts: (Text | Block)[] }

// A mistake in how the cell is put together, found while parsing
export type ParseError = { code: "brace.unclosed" | "brace.stray"; span: Span }

export type Cell = { statements: Statement[]; errors: ParseError[] }

// The end of a switch over kinds. tsc only accepts a call here when every kind has a case.
export function unhandled(node: never): never {
  throw new Error(`No case for ${JSON.stringify(node)}`)
}
