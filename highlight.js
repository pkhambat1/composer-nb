/* Music DSL syntax highlighter.
   Exposes window.highlightMusic(src) -> HTML string with token spans.
   Token classes (used by CSS):
     .tk-comment, .tk-directive-key, .tk-directive-val,
     .tk-bar, .tk-root, .tk-quality, .tk-ext, .tk-rhythm,
     .tk-rest, .tk-error, .tk-slash, .tk-bass
*/

(function () {
  function escape(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Split a chord-or-rest token (with optional rhythm suffix) into colored parts.
  function highlightChordToken(raw) {
    // Pull off rhythm suffix
    let core = raw;
    let rhythm = '';
    const dotM = raw.match(/^(.+?)(\.(w|h|q|e|s))$/);
    const colonM = raw.match(/^(.+?)(:\d+(?:\.\d+)?)$/);
    if (dotM) { core = dotM[1]; rhythm = dotM[2]; }
    else if (colonM) { core = colonM[1]; rhythm = colonM[2]; }

    // Slash bass
    let slashTail = '';
    if (core.includes('/')) {
      const parts = core.split('/');
      core = parts[0];
      slashTail = '<span class="tk-slash">/</span><span class="tk-bass">' + escape(parts[1]) + '</span>';
    }

    // Rest token
    if (core === '~' || core === '_') {
      return '<span class="tk-rest">' + escape(core) + '</span>'
        + slashTail
        + (rhythm ? '<span class="tk-rhythm">' + escape(rhythm) + '</span>' : '');
    }

    // Roman vs absolute
    const romanRe = /^([#b])?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/;
    const absRe = /^([A-G][b#]?)(.*)$/;

    let rootHTML = '';
    let restAfter = '';

    const rm = romanRe.exec(core);
    if (rm) {
      const acc = rm[1] || '';
      const roman = rm[2];
      const isLower = roman === roman.toLowerCase();
      rootHTML = '<span class="tk-root ' + (isLower ? 'tk-root-min' : 'tk-root-maj') + '">'
        + escape(acc + roman) + '</span>';
      restAfter = rm[3] || '';
    } else {
      const am = absRe.exec(core);
      if (am) {
        rootHTML = '<span class="tk-root tk-root-abs">' + escape(am[1]) + '</span>';
        restAfter = am[2] || '';
      } else {
        // unparseable
        return '<span class="tk-error">' + escape(raw) + '</span>';
      }
    }

    // restAfter: quality + extensions. Highlight letters as quality, digits/alts as extension.
    let html = rootHTML;
    if (restAfter) {
      // Split into runs of [letters / symbols] and [digits / alterations]
      // Quality letters: m, maj, M, dim, °, o, aug, +, sus2, sus4, ø, hdim, Δ
      // Extensions: 7, 9, 11, 13, b5, #5, b9, #9, #11, b13, add9
      let i = 0;
      while (i < restAfter.length) {
        const r = restAfter.slice(i);
        // Match a quality chunk
        const q = /^(maj|min|sus2|sus4|sus|dim|aug|hdim|m|M|°|o|\+|ø|Δ)/.exec(r);
        if (q) {
          html += '<span class="tk-quality">' + escape(q[0]) + '</span>';
          i += q[0].length;
          continue;
        }
        // Match an extension chunk
        const e = /^(add9|b5|#5|b9|#9|#11|b13|13|11|9|7|6|2|4)/.exec(r);
        if (e) {
          html += '<span class="tk-ext">' + escape(e[0]) + '</span>';
          i += e[0].length;
          continue;
        }
        // Stray char
        html += '<span class="tk-error">' + escape(restAfter[i]) + '</span>';
        i++;
      }
    }

    html += slashTail;
    if (rhythm) html += '<span class="tk-rhythm">' + escape(rhythm) + '</span>';
    return html;
  }

  function highlightLine(line) {
    // Trailing comment — use `--` so `#` is free for sharps (C#, F#m, etc.)
    const dashIdx = line.indexOf('--');
    let codePart = line;
    let commentPart = '';
    if (dashIdx >= 0) {
      codePart = line.slice(0, dashIdx);
      commentPart = line.slice(dashIdx);
    }

    let out = '';
    const trimmed = codePart.trim();

    // Drum lane line: e.g. "bd: x.4 ~.4 x.4 ~.4" or legacy "bd: x . . . x . . ."
    const drumM = /^(\s*)(bd|sd|hh|oh|cp|cy|rd|tm|rs|kick|snare|hat|open|clap|cymbal|ride|tom|rim|k|s|h)(\s*)(:)(\s*)(.*)$/i.exec(codePart);
    if (drumM && !trimmed.startsWith('@')) {
      out += escape(drumM[1])
        + '<span class="tk-drum-lane">' + escape(drumM[2]) + '</span>'
        + escape(drumM[3])
        + '<span class="tk-drum-sep">' + escape(drumM[4]) + '</span>'
        + escape(drumM[5]);
      const pattern = drumM[6];
      // Tokenize: split by whitespace, color each token
      let i = 0;
      while (i < pattern.length) {
        const ws = /^\s+/.exec(pattern.slice(i));
        if (ws) { out += escape(ws[0]); i += ws[0].length; continue; }
        const tk = /^\S+/.exec(pattern.slice(i));
        if (!tk) break;
        const t = tk[0];
        // Split into core + rhythm suffix for coloring
        const durM = /^([~r]?)([xXoO]?)(\.?(?:\d+(?:\.\d+)?|[whqesWHQES]))?$/.exec(t);
        if (durM && (durM[2] || durM[3] || durM[1])) {
          const restPart = durM[1];
          const hitPart = durM[2];
          const durPart = durM[3] || '';
          if (restPart) out += '<span class="tk-drum-rest">' + escape(restPart) + '</span>';
          if (hitPart) out += '<span class="tk-drum-hit">' + escape(hitPart) + '</span>';
          if (durPart) out += '<span class="tk-rhythm">' + escape(durPart) + '</span>';
        } else if (t === 'x' || t === 'X' || t === '#' || t === 'o' || t === 'O') {
          out += '<span class="tk-drum-hit">' + escape(t) + '</span>';
        } else if (t === '.' || t === '-' || t === '_') {
          out += '<span class="tk-drum-rest">' + escape(t) + '</span>';
        } else if (/^\d+(\.\d+)?$/.test(t)) {
          // bare duration shorthand
          out += '<span class="tk-rhythm">' + escape(t) + '</span>';
        } else {
          out += escape(t);
        }
        i += t.length;
      }
      if (commentPart) out += '<span class="tk-comment">' + escape(commentPart) + '</span>';
      return out;
    }

    if (trimmed.startsWith('@')) {
      // Directive: split @keyword then value
      const leading = codePart.match(/^\s*/)[0];
      const rest = codePart.slice(leading.length);
      const dm = /^(@\w+)(\s+)(.*)$/.exec(rest);
      if (dm) {
        out += escape(leading)
          + '<span class="tk-directive-key">' + escape(dm[1]) + '</span>'
          + escape(dm[2])
          + '<span class="tk-directive-val">' + escape(dm[3]) + '</span>';
      } else {
        out += '<span class="tk-directive-key">' + escape(codePart) + '</span>';
      }
    } else if (trimmed.length === 0) {
      out += escape(codePart);
    } else {
      // Tokens — preserve whitespace between them
      let i = 0;
      while (i < codePart.length) {
        // whitespace run
        const ws = /^\s+/.exec(codePart.slice(i));
        if (ws) { out += escape(ws[0]); i += ws[0].length; continue; }
        // non-whitespace token
        const tk = /^\S+/.exec(codePart.slice(i));
        if (!tk) break;
        const t = tk[0];
        if (t === '|' || t === '||') {
          out += '<span class="tk-bar">' + escape(t) + '</span>';
        } else {
          out += highlightChordToken(t);
        }
        i += t.length;
      }
    }

    if (commentPart) {
      out += '<span class="tk-comment">' + escape(commentPart) + '</span>';
    }
    return out;
  }

  function highlightMusic(src) {
    const lines = src.split('\n');
    return lines.map(highlightLine).join('\n');
  }

  window.highlightMusic = highlightMusic;
})();
