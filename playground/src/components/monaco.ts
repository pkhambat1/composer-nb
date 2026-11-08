/* Monaco, the editor VS Code uses, set up once for music cells: the language's brackets,
   comments and indenting, quiet themes after GitHub's, and composer-nb's own highlighter
   painting the tokens. Loaded on demand, as it's most of the page's weight. */
// The core's types, for every program that compiles this file (the playground and the MCP app)
/// <reference path="../monaco.d.ts" />
import * as monaco from "monaco-editor/esm/vs/editor/edcore.main.js"
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker"
import { highlightMusic } from "composer-nb/highlight"

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

export { monaco }
export const LANGUAGE = "composer-nb"

monaco.languages.register({ id: LANGUAGE })
monaco.languages.setLanguageConfiguration(LANGUAGE, {
  comments: { lineComment: "//" },
  brackets: [
    ["{", "}"],
    ["(", ")"],
    ["[", "]"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: '"', close: '"' },
  ],
  // One level deeper after an opening brace or bracket, one less on a line that closes one
  indentationRules: {
    increaseIndentPattern: /[{(]\s*(\/\/.*)?$/,
    decreaseIndentPattern: /^\s*[})]/,
  },
})

// The notebook's own keys (useKeyboard): Monaco would otherwise take Cmd+Enter to insert a
// line, and the run never reaches the notebook
monaco.editor.addKeybindingRules([
  { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, command: "-editor.action.insertLineAfter" },
  {
    keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
    command: "-editor.action.insertLineBefore",
  },
])

// The editor's chrome from GitHub's VS Code themes. The background, text and bracket colours
// come from the page's own variables (app.css), so the editor sits on the cell's code
// background; the token colours are the playground's .tk-* classes.
const CHROME = {
  light: {
    "editorLineNumber.foreground": "#c3c7cd",
    "editorLineNumber.activeForeground": "#7c828c",
    "editor.lineHighlightBackground": "#00000008",
    "editor.selectionBackground": "#0969da26",
    "editor.inactiveSelectionBackground": "#0969da12",
    "editor.selectionHighlightBackground": "#4ac26b26",
    "editor.wordHighlightBackground": "#0000000d",
    "editorIndentGuide.background1": "#1f232812",
    "editorIndentGuide.activeBackground1": "#1f23287a",
    "editorBracketMatch.background": "#4ac26b26",
    "editorWidget.background": "#ffffff",
    "editorWidget.border": "#e0e0e0",
    "input.background": "#ffffff",
    "input.border": "#e0e0e0",
  },
  dark: {
    "editorLineNumber.foreground": "#474d58",
    "editorLineNumber.activeForeground": "#8a919c",
    "editor.lineHighlightBackground": "#ffffff08",
    "editor.selectionBackground": "#2f81f733",
    "editor.inactiveSelectionBackground": "#2f81f71a",
    "editor.selectionHighlightBackground": "#3fb95026",
    "editor.wordHighlightBackground": "#ffffff12",
    "editorIndentGuide.background1": "#e6edf312",
    "editorIndentGuide.activeBackground1": "#e6edf366",
    "editorBracketMatch.background": "#3fb95033",
    "editorWidget.background": "#21252b",
    "editorWidget.border": "#353b46",
    "input.background": "#1b1e23",
    "input.border": "#353b46",
  },
}

// A colour variable of the page, as Monaco needs it: hex
function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback
}

// The page's theme, as App sets it on <html>, made into a Monaco theme from the page's colours
export function themeName(): string {
  const dark = document.documentElement.dataset.theme === "dark"
  const name = dark ? "nb-dark" : "nb-light"
  const background = cssColor("--code-bg", dark ? "#1b1e23" : "#f5f5f5")
  const text = cssColor("--text", dark ? "#e1e4e8" : "#1a1a1a")
  // Brackets take the faint token colour at every depth
  const faint = cssColor("--tk-faint", dark ? "#656b75" : "#a0a0a0")
  const brackets = Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((n) => [`editorBracketHighlight.foreground${n}`, faint]),
  )
  monaco.editor.defineTheme(name, {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      ...CHROME[dark ? "dark" : "light"],
      ...brackets,
      "editor.background": background,
      "editorGutter.background": background,
      "editor.foreground": text,
      "editorCursor.foreground": text,
      "editor.lineHighlightBorder": "#00000000",
      "editorBracketMatch.border": "#00000000",
      focusBorder: cssColor("--accent", dark ? "#7eb6ff" : "#1a73e8"),
    },
  })
  return name
}
new MutationObserver(() => monaco.editor.setTheme(themeName())).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
})

// Monaco measures the font when it starts; measure again once IBM Plex Mono has loaded
document.fonts?.ready.then(() => monaco.editor.remeasureFonts())

// The highlighter's tokens as decorations, each carrying its .tk-* class
export function tokenDecorations(model: monaco.editor.ITextModel): monaco.editor.IModelDeltaDecoration[] {
  const out: monaco.editor.IModelDeltaDecoration[] = []
  highlightMusic(model.getValue()).forEach((parts, i) => {
    let column = 1
    for (const part of parts) {
      if (part.s === "\r") continue
      if (part.c && part.s)
        out.push({
          range: new monaco.Range(i + 1, column, i + 1, column + part.s.length),
          options: { inlineClassName: part.c },
        })
      column += part.s.length
    }
  })
  return out
}

// Lines the last run found mistakes on
export function errorDecorations(lines: Iterable<number>): monaco.editor.IModelDeltaDecoration[] {
  return [...lines].map((line) => ({
    range: new monaco.Range(line, 1, line, 1),
    options: { isWholeLine: true, className: "hl-error-line" },
  }))
}

export const OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  language: LANGUAGE,
  fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  fontSize: 13,
  lineHeight: 20,
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: false,
  autoClosingBrackets: "always",
  autoClosingQuotes: "always",
  autoSurround: "languageDefined",
  autoIndent: "full",
  bracketPairColorization: { enabled: false },
  guides: { bracketPairs: false, indentation: true, highlightActiveIndentation: true },
  matchBrackets: "always",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: "on",
  wrappingIndent: "same",
  renderLineHighlight: "all",
  renderLineHighlightOnlyWhenFocus: true,
  // Room above the code for the Run button
  padding: { top: 40, bottom: 12 },
  scrollbar: { alwaysConsumeMouseWheel: false, vertical: "hidden", horizontal: "hidden", useShadows: false },
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  folding: false,
  glyphMargin: false,
  lineNumbersMinChars: 3,
  lineDecorationsWidth: 10,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: "off",
  parameterHints: { enabled: false },
  hover: { enabled: false },
  links: false,
  contextmenu: false,
  occurrencesHighlight: "off",
  fixedOverflowWidgets: true,
  automaticLayout: true,
  ariaLabel: "Music source",
}
