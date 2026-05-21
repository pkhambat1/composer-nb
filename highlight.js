/* Music DSL syntax highlighter.
   Exposes window.highlightMusic(src) -> lines of token parts for React rendering.
   Each part: { c: className | null, s: text }
   Token classes (used by CSS):
     .tk-comment, .tk-directive-key, .tk-directive-val,
     .tk-bar, .tk-root, .tk-quality, .tk-ext, .tk-rhythm,
     .tk-rest, .tk-error, .tk-slash, .tk-bass
*/

;(function () {
  function raw(parts, s) {
    if (s) parts.push({ c: null, s })
  }

  function span(parts, cls, s) {
    if (s) parts.push({ c: cls, s })
  }

  function concatParts(target, source) {
    for (let i = 0; i < source.length; i++) target.push(source[i])
  }

  function highlightChordToken(raw) {
    const parts = []
    let core = raw
    let rhythm = ""
    const dotM = raw.match(/^(.+?)(\.(w|h|q|e|s))$/)
    const colonM = raw.match(/^(.+?)(:\d+(?:\.\d+)?)$/)
    if (dotM) {
      core = dotM[1]
      rhythm = dotM[2]
    } else if (colonM) {
      core = colonM[1]
      rhythm = colonM[2]
    }

    let slashTail = []
    if (core.includes("/")) {
      const splitParts = core.split("/")
      core = splitParts[0]
      slashTail = [
        { c: "tk-slash", s: "/" },
        { c: "tk-bass", s: splitParts[1] },
      ]
    }

    if (core === "~" || core === "_") {
      span(parts, "tk-rest", core)
      concatParts(parts, slashTail)
      if (rhythm) span(parts, "tk-rhythm", rhythm)
      return parts
    }

    const romanRe = /^([#b])?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/
    const absRe = /^([A-G][b#]?)(.*)$/

    let restAfter = ""
    const rm = romanRe.exec(core)
    if (rm) {
      const acc = rm[1] || ""
      const roman = rm[2]
      const isLower = roman === roman.toLowerCase()
      span(parts, "tk-root " + (isLower ? "tk-root-min" : "tk-root-maj"), acc + roman)
      restAfter = rm[3] || ""
    } else {
      const am = absRe.exec(core)
      if (am) {
        span(parts, "tk-root tk-root-abs", am[1])
        restAfter = am[2] || ""
      } else {
        span(parts, "tk-error", raw)
        return parts
      }
    }

    if (restAfter) {
      let i = 0
      while (i < restAfter.length) {
        const r = restAfter.slice(i)
        const q = /^(maj|min|sus2|sus4|sus|dim|aug|hdim|m|M|°|o|\+|ø|Δ)/.exec(r)
        if (q) {
          span(parts, "tk-quality", q[0])
          i += q[0].length
          continue
        }
        const e = /^(add9|b5|#5|b9|#9|#11|b13|13|11|9|7|6|2|4)/.exec(r)
        if (e) {
          span(parts, "tk-ext", e[0])
          i += e[0].length
          continue
        }
        span(parts, "tk-error", restAfter[i])
        i++
      }
    }

    concatParts(parts, slashTail)
    if (rhythm) span(parts, "tk-rhythm", rhythm)
    return parts
  }

  function highlightLine(line) {
    const dashIdx = line.indexOf("--")
    let codePart = line
    let commentPart = ""
    if (dashIdx >= 0) {
      codePart = line.slice(0, dashIdx)
      commentPart = line.slice(dashIdx)
    }

    const parts = []
    const trimmed = codePart.trim()

    const drumM =
      /^(\s*)(bd|sd|hh|oh|cp|cy|rd|tm|rs|kick|snare|hat|open|clap|cymbal|ride|tom|rim|k|s|h)(\s*)(:)(\s*)(.*)$/i.exec(
        codePart,
      )
    if (drumM && !trimmed.startsWith("@")) {
      raw(parts, drumM[1])
      span(parts, "tk-drum-lane", drumM[2])
      raw(parts, drumM[3])
      span(parts, "tk-drum-sep", drumM[4])
      raw(parts, drumM[5])
      const pattern = drumM[6]
      let i = 0
      while (i < pattern.length) {
        const ws = /^\s+/.exec(pattern.slice(i))
        if (ws) {
          raw(parts, ws[0])
          i += ws[0].length
          continue
        }
        const tk = /^\S+/.exec(pattern.slice(i))
        if (!tk) break
        const t = tk[0]
        const durM = /^([~r]?)([xXoO]?)(\.?(?:\d+(?:\.\d+)?|[whqesWHQES]))?$/.exec(t)
        if (durM && (durM[2] || durM[3] || durM[1])) {
          if (durM[1]) span(parts, "tk-drum-rest", durM[1])
          if (durM[2]) span(parts, "tk-drum-hit", durM[2])
          if (durM[3]) span(parts, "tk-rhythm", durM[3])
        } else if (t === "x" || t === "X" || t === "#" || t === "o" || t === "O") {
          span(parts, "tk-drum-hit", t)
        } else if (t === "." || t === "-" || t === "_") {
          span(parts, "tk-drum-rest", t)
        } else if (/^\d+(\.\d+)?$/.test(t)) {
          span(parts, "tk-rhythm", t)
        } else {
          raw(parts, t)
        }
        i += t.length
      }
      if (commentPart) span(parts, "tk-comment", commentPart)
      return parts
    }

    if (trimmed.startsWith("@")) {
      const leading = codePart.match(/^\s*/)[0]
      const rest = codePart.slice(leading.length)
      const dm = /^(@\w+)(\s+)(.*)$/.exec(rest)
      if (dm) {
        raw(parts, leading)
        span(parts, "tk-directive-key", dm[1])
        raw(parts, dm[2])
        span(parts, "tk-directive-val", dm[3])
      } else {
        span(parts, "tk-directive-key", codePart)
      }
    } else if (trimmed.length === 0) {
      raw(parts, codePart)
    } else {
      let i = 0
      while (i < codePart.length) {
        const ws = /^\s+/.exec(codePart.slice(i))
        if (ws) {
          raw(parts, ws[0])
          i += ws[0].length
          continue
        }
        const tk = /^\S+/.exec(codePart.slice(i))
        if (!tk) break
        const t = tk[0]
        if (t === "|" || t === "||") {
          span(parts, "tk-bar", t)
        } else {
          concatParts(parts, highlightChordToken(t))
        }
        i += t.length
      }
    }

    if (commentPart) span(parts, "tk-comment", commentPart)
    return parts
  }

  function highlightMusic(src) {
    return src.split("\n").map(highlightLine)
  }

  window.highlightMusic = highlightMusic
})()
