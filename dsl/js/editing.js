/* Editing keys for a textarea holding music code: Tab and Shift+Tab indent and outdent,
   Enter keeps the indent (one level deeper after an opening brace), and Cmd+/ comments
   lines out. Shared by the playground's editor and the JavaScript library's. */

const INDENT = "  "

// Replaces ta.value[from, to) the way typing would, so Cmd+Z can undo it. Falls back
// to setting the value when the browser won't insert text for us.
function replaceRange(ta, from, to, text, onChange, select) {
  ta.setSelectionRange(from, to)
  const typed = document.execCommand(text ? "insertText" : "delete", false, text)
  if (!typed) onChange(ta.value.slice(0, from) + text + ta.value.slice(to))
  if (select) requestAnimationFrame(select)
  else if (!typed)
    requestAnimationFrame(() => ta.setSelectionRange(from + text.length, from + text.length))
}

// Handles a keydown in `ta`. `onChange(value)` is called with the new text when the
// browser can't make the edit itself.
export function editKey(e, ta, onChange) {
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey
  if (e.key === "Tab" && plain) {
    e.preventDefault()
    const { selectionStart: start, selectionEnd: end, value: text } = ta
    if (!e.shiftKey && start === end) {
      replaceRange(ta, start, end, INDENT, onChange)
      return
    }
    // Indent or outdent every line the selection touches.
    const lineStart = text.lastIndexOf("\n", start - 1) + 1
    const last = end > start && text[end - 1] === "\n" ? end - 1 : end
    const lineEnd = text.indexOf("\n", last) < 0 ? text.length : text.indexOf("\n", last)
    const lines = text.slice(lineStart, lineEnd).split("\n")
    const moved = lines.map((l) => (e.shiftKey ? l.replace(/^( {1,2}|\t)/, "") : INDENT + l))
    const firstDelta = moved[0].length - lines[0].length
    const totalDelta = moved.join("\n").length - (lineEnd - lineStart)
    replaceRange(ta, lineStart, lineEnd, moved.join("\n"), onChange, () => {
      ta.selectionStart = Math.max(lineStart, start + firstDelta)
      ta.selectionEnd = Math.max(lineStart, end + totalDelta)
    })
    return
  }

  if (e.key === "Enter" && plain && !e.shiftKey) {
    const { selectionStart: start, selectionEnd: end, value: text } = ta
    const before = text.slice(text.lastIndexOf("\n", start - 1) + 1, start)
    let indent = /^[ \t]*/.exec(before)[0]
    // The line after an opening brace goes one level in.
    if (/\{\s*(\/\/.*)?$/.test(before)) indent += INDENT
    if (!indent) return
    e.preventDefault()
    replaceRange(ta, start, end, "\n" + indent, onChange)
    return
  }

  if ((e.metaKey || e.ctrlKey) && e.key === "/") {
    e.preventDefault()

    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = ta.value
    const lineStart = text.lastIndexOf("\n", start - 1) + 1
    const lineEnd = text.indexOf("\n", end)
    const block = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd)
    const lines = block.split("\n")
    const allCommented = lines.every((l) => /^\s*\/\/ /.test(l) || l.trim() === "")
    const toggled = lines
      .map((l) => {
        if (l.trim() === "") return l
        if (allCommented) return l.replace(/^(\s*)\/\/ /, "$1")
        return "// " + l
      })
      .join("\n")

    const before = text.slice(0, lineStart)
    const after = text.slice(lineEnd < 0 ? text.length : lineEnd)
    const next = before + toggled + after
    onChange(next)

    const delta = toggled.length - block.length
    requestAnimationFrame(() => {
      ta.selectionStart = start + (allCommented ? -3 : 3)
      ta.selectionEnd = end + delta
    })
  }
}
