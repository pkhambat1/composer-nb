/* Notebook React app — Jupyter-style cells, music DSL + Tone.js.
   Features: syntax-highlighted code cells, piano roll output, WAV export,
   chord palette sidebar, theme/accent/density/font tweaks.
*/

const { useState, useEffect, useRef, useCallback, useMemo } = React;

let _cid = 0;
function cellId() { return 'c' + (++_cid) + '_' + Date.now().toString(36); }

// ============================================================================
// Code editor with syntax highlighting overlay
// ============================================================================

const CodeEditor = React.forwardRef(function CodeEditor(props, ref) {
  const { value, onChange, onFocus, onBlur, placeholder } = props;
  const localRef = useRef(null);
  const setRef = (el) => {
    localRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  // Auto-grow
  useEffect(() => {
    const ta = localRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight + 2) + 'px';
  }, [value]);

  const html = useMemo(() => {
    const fn = window.highlightMusic;
    return (fn ? fn(value) : escapeHtml(value)) + '\n';
  }, [value]);

  return (
    <div className="code-input">
      <pre className="code-hl" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
      <textarea
        ref={setRef}
        className="code-area"
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
});

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================================
// Markdown renderer (minimal)
// ============================================================================

function renderMarkdown(src) {
  if (!src.trim()) return '<p class="md-empty">Empty text cell — double-click to edit.</p>';
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  const inline = (s) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      closeList();
      const block = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { block.push(lines[i]); i++; }
      i++;
      out.push('<pre><code>' + block.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>');
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
      i++;
      continue;
    }
    if (!line.trim()) { closeList(); i++; continue; }
    closeList();
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*]\s|```)/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    out.push('<p>' + inline(para.join(' ')) + '</p>');
  }
  closeList();
  return out.join('');
}

// ============================================================================
// Music cell output: waveform, piano roll, chord chips, errors
// ============================================================================

function themeColors(theme, accent) {
  // accent is hex
  if (theme === 'retro') {
    return {
      primary: '#ffb000', secondary: '#ff8533',
      midline: 'rgba(255,176,0,0.15)',
      grid: 'rgba(255,176,0,0.12)',
      label: 'rgba(255,176,0,0.7)',
      rest: 'rgba(255,176,0,0.22)',
      cellBg: 'rgba(255,176,0,0.04)',
      cellBgAlt: 'rgba(255,176,0,0.10)',
    };
  }
  if (theme === 'dark') {
    return {
      primary: accent, secondary: '#8ea4c8',
      midline: 'rgba(255,255,255,0.06)',
      grid: 'rgba(255,255,255,0.10)',
      label: 'rgba(255,255,255,0.55)',
      rest: 'rgba(255,255,255,0.12)',
      cellBg: 'rgba(255,255,255,0.02)',
      cellBgAlt: 'rgba(255,255,255,0.05)',
    };
  }
  return {
    primary: accent, secondary: '#9fb8da',
    midline: 'rgba(0,0,0,0.06)',
    grid: 'rgba(0,0,0,0.08)',
    label: 'rgba(0,0,0,0.6)',
    rest: 'rgba(0,0,0,0.12)',
    cellBg: 'rgba(0,0,0,0.02)',
    cellBgAlt: 'rgba(0,0,0,0.05)',
  };
}

// ----------------------------------------------------------------------------
// Chord diagrams — proper guitar fingering grid & a 2-octave piano keyboard
// ----------------------------------------------------------------------------

function getChordIntervals(chord) {
  const set = new Set();
  (chord.notesMidi || []).forEach((m) => set.add(((m - chord.rootPc) % 12 + 12) % 12));
  return set;
}

function detectChordQuality(intervals) {
  const has = (n) => intervals.has(n);
  if (!has(3) && !has(4)) {
    if (has(5)) return 'sus4';
    if (has(2)) return 'sus2';
  }
  const m3 = has(3), M3 = has(4);
  const b5 = has(6), p5 = has(7), s5 = has(8);
  const b7 = has(10), M7 = has(11);
  const has6 = has(9); // 9 semitones = major 6th

  if (m3 && b5 && !p5) {
    if (has(9)) return 'dim7';
    if (b7) return 'm7b5';
    return 'dim';
  }
  if (M3 && s5 && !p5) return 'aug';
  if (m3) {
    if (M7) return 'mM7';
    if (b7) return 'm7';
    if (has6) return 'm6';
    return 'min';
  }
  if (M3) {
    if (M7) return 'maj7';
    if (b7) return '7';
    if (has6) return '6';
    return 'maj';
  }
  return 'maj';
}

// Open shape per quality. Each shape: { frets: [low-E,A,D,G,B,high-E], baseRootPc }
// baseRootPc = pitch class the root sits on when the shape is in this open position.
// (so transpose = (targetRoot - baseRootPc + 12) % 12)
const GUITAR_SHAPES = {
  maj:  { frets: [0, 2, 2, 1, 0, 0], baseRootPc: 4 },   // E major
  min:  { frets: [0, 2, 2, 0, 0, 0], baseRootPc: 4 },   // Em
  '7':  { frets: [0, 2, 0, 1, 0, 0], baseRootPc: 4 },   // E7
  maj7: { frets: [0, 2, 1, 1, 0, 0], baseRootPc: 4 },   // Emaj7
  m7:   { frets: [0, 2, 0, 0, 0, 0], baseRootPc: 4 },   // Em7
  mM7:  { frets: [0, 2, 1, 0, 0, 0], baseRootPc: 4 },   // Em(maj7)
  '6':  { frets: [0, 2, 2, 1, 2, 0], baseRootPc: 4 },   // E6
  m6:   { frets: [0, 2, 2, 0, 2, 0], baseRootPc: 4 },   // Em6
  sus4: { frets: [0, 2, 2, 2, 0, 0], baseRootPc: 4 },   // Esus4
  sus2: { frets: [-1, -1, 0, 2, 3, 0], baseRootPc: 2 }, // Dsus2
  aug:  { frets: [0, 3, 2, 1, 1, 0], baseRootPc: 4 },   // E aug
  dim:  { frets: [-1, -1, 0, 1, 0, 1], baseRootPc: 2 }, // D dim shape
  m7b5: { frets: [-1, -1, 0, 1, 1, 1], baseRootPc: 2 }, // Dm7b5
  dim7: { frets: [-1, -1, 0, 1, 0, 1], baseRootPc: 2 },
};

function GuitarDiagram({ chord }) {
  const intervals = getChordIntervals(chord);
  const quality = detectChordQuality(intervals);
  const shape = GUITAR_SHAPES[quality] || GUITAR_SHAPES.maj;
  const transpose = ((chord.rootPc - shape.baseRootPc) % 12 + 12) % 12;
  const fretted = shape.frets.map((f) => (f < 0 ? -1 : f + transpose));
  // pick fret window
  const played = fretted.filter((f) => f > 0);
  const minF = played.length ? Math.min(...played) : 1;
  const maxF = played.length ? Math.max(...played) : 1;
  let lowFret = 1;
  let showNutLabel = false;
  if (maxF > 5) {
    lowFret = minF;
    showNutLabel = true;
  }

  const W = 76, H = 86;
  const PAD_L = 9, PAD_R = 9, PAD_T = 14, PAD_B = 6;
  const STRINGS = 6, FRETS = 5;
  const stringStep = (W - PAD_L - PAD_R) / (STRINGS - 1);
  const fretStep = (H - PAD_T - PAD_B) / FRETS;
  const xOf = (si) => PAD_L + si * stringStep;
  const yOfFret = (f) => PAD_T + (f - lowFret + 0.5) * fretStep;

  return (
    <svg className="chord-diagram chord-diagram-guitar" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* strings */}
      {Array.from({ length: STRINGS }, (_, i) => (
        <line key={'s' + i} x1={xOf(i)} y1={PAD_T} x2={xOf(i)} y2={H - PAD_B}
              stroke="var(--text-dim)" strokeWidth="0.7" />
      ))}
      {/* frets */}
      {Array.from({ length: FRETS + 1 }, (_, i) => (
        <line key={'f' + i}
              x1={PAD_L - 0.5} y1={PAD_T + i * fretStep}
              x2={W - PAD_R + 0.5} y2={PAD_T + i * fretStep}
              stroke="var(--text-dim)"
              strokeWidth={i === 0 && lowFret === 1 ? 2.4 : 0.7} />
      ))}
      {/* position label if barred up the neck */}
      {showNutLabel && (
        <text x={W - PAD_R + 3} y={PAD_T + fretStep * 0.65}
              fontSize="7.5" fill="var(--text-mute)" fontFamily="var(--font-mono)">
          {lowFret}fr
        </text>
      )}
      {/* per-string markers */}
      {fretted.map((f, si) => {
        const x = xOf(si);
        if (f < 0) {
          return (
            <text key={si} x={x} y={PAD_T - 4} fontSize="8.5"
                  fill="var(--text-mute)" fontFamily="var(--font-mono)"
                  textAnchor="middle" dominantBaseline="middle">×</text>
          );
        }
        if (f === 0) {
          return (
            <circle key={si} cx={x} cy={PAD_T - 5} r="2.6"
                    fill="none" stroke="var(--text)" strokeWidth="0.9" />
          );
        }
        if (f < lowFret || f > lowFret + FRETS - 1) return null;
        return (
          <circle key={si} cx={x} cy={yOfFret(f)} r="3.4"
                  fill="var(--text)" />
        );
      })}
    </svg>
  );
}

function PianoDiagram({ chord }) {
  const notes = [...new Set(chord.notesMidi || [])];
  if (chord.bassMidi != null) notes.push(chord.bassMidi);
  if (!notes.length) return null;
  const minM = Math.min(...notes);
  const maxM = Math.max(...notes);
  const startC = Math.floor(minM / 12) * 12;
  const octs = Math.max(2, Math.ceil((maxM - startC + 1) / 12));
  const numWhite = octs * 7;

  const W = 182, H = 56;
  const TOP_BAR = 4;
  const wW = W / numWhite;
  const keyH = H - TOP_BAR;
  const bW = wW * 0.58;
  const bH = keyH * 0.6;
  const dotR = 3.2;

  const whiteOrder = [0, 2, 4, 5, 7, 9, 11];
  const blackPcs = new Set([1, 3, 6, 8, 10]);
  // Map black-key pitch class to which white-key index it sits after
  const blackAfterWhite = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

  const noteSet = new Set(notes);

  const whiteKeyRects = [];
  const blackKeyRects = [];
  const whiteDots = [];
  const blackDots = [];

  for (let o = 0; o < octs; o++) {
    const baseM = startC + o * 12;

    // White keys
    whiteOrder.forEach((pc, i) => {
      const m = baseM + pc;
      const x = (o * 7 + i) * wW;
      const on = noteSet.has(m);
      whiteKeyRects.push(
        <rect key={'w' + m} x={x + 0.5} y={TOP_BAR}
              width={wW - 1} height={keyH - 0.5}
              fill="var(--paper)" stroke="var(--border)" strokeWidth="0.8"
              rx="0.5" />
      );
      if (on) {
        whiteDots.push(
          <circle key={'wd' + m} cx={x + wW / 2} cy={TOP_BAR + keyH * 0.76}
                  r={dotR} fill="var(--text)" stroke="var(--text)" strokeWidth="0.8" />
        );
      }
    });

    // Black keys
    Object.entries(blackAfterWhite).forEach(([pcStr, whiteIdx]) => {
      const pc = +pcStr;
      const m = baseM + pc;
      const x = (o * 7 + whiteIdx + 1) * wW - bW / 2;
      const on = noteSet.has(m);
      blackKeyRects.push(
        <rect key={'b' + m} x={x} y={TOP_BAR}
              width={bW} height={bH}
              fill="var(--text)" rx="0.5" />
      );
      if (on) {
        blackDots.push(
          <circle key={'bd' + m} cx={x + bW / 2} cy={TOP_BAR + bH * 0.72}
                  r={dotR} fill="var(--paper)" stroke="var(--text)" strokeWidth="0.8" />
        );
      }
    });
  }

  return (
    <svg className="chord-diagram chord-diagram-piano" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Top bar */}
      <rect x="0" y="0" width={W} height={TOP_BAR} fill="var(--text)" rx="0.5" />
      {/* White keys */}
      {whiteKeyRects}
      {/* Dots on white keys (below black keys layer) */}
      {whiteDots}
      {/* Black keys */}
      {blackKeyRects}
      {/* Dots on black keys (above black keys) */}
      {blackDots}
    </svg>
  );
}

function ChordDiagram({ chord, instrument }) {
  if (instrument === 'guitar') return <GuitarDiagram chord={chord} />;
  return <PianoDiagram chord={chord} />;
}

function MusicOutput({ cell, onRequestPlay, onStop, isPlaying, theme, accent, runCount }) {
  const waveRef = useRef(null);

  const redraw = useCallback(() => {
    if (!cell.output || cell.output.kind !== 'rendered') return;
    const colors = themeColors(theme, accent);
    if (waveRef.current) {
      window.MusicEngine.drawWaveform(waveRef.current, cell.output.buffer, {
        stroke: colors.primary, midline: colors.midline,
      });
    }
  }, [cell.output, theme, accent]);

  useEffect(() => { redraw(); }, [redraw]);

  // Redraw on resize
  useEffect(() => {
    const obs = new ResizeObserver(() => redraw());
    if (waveRef.current) obs.observe(waveRef.current);
    return () => obs.disconnect();
  }, [redraw]);

  if (!cell.output) return null;

  if (cell.output.kind === 'error') {
    const lines = String(cell.output.error || '').split('\n').filter(Boolean);
    return (
      <div className="cell-output cell-output-error">
        <div className="traceback">
          <span className="tb-name">MusicError</span>
          <div className="tb-msg-block">
            {lines.map((l, i) => <div key={i} className="tb-msg-line">{l}</div>)}
          </div>
        </div>
      </div>
    );
  }

  const parsed = cell.output.parsed;
  const onExport = () => {
    const fname = `cell-${runCount || 'out'}.wav`;
    window.MusicEngine.downloadWav(cell.output.buffer, fname);
  };

  return (
    <div className="cell-output">
      <div className="out-prompt">Out [{runCount}]:</div>
      <div className="out-content">
        <div className="music-row music-row-controls">
          <button
            className={"play-btn" + (isPlaying ? " playing" : "")}
            onClick={() => isPlaying ? onStop() : onRequestPlay()}
            title={isPlaying ? "Stop" : "Play"}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="3" width="3" height="8" /><rect x="8" y="3" width="3" height="8" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="3,2 12,7 3,12" /></svg>
            )}
          </button>
          <div className="waveform-wrap">
            <canvas ref={waveRef} className="waveform" />
            {isPlaying && <div className="playhead-track"><div className="playhead-bar" style={{ animationDuration: `${cell.output.duration}s` }} /></div>}
          </div>
          <div className="music-meta">
            <span className="meta-pill">{parsed.directives.tempo} BPM</span>
            <span className="meta-pill">{parsed.key.root}{parsed.key.mode === 'minor' ? 'm' : ''}</span>
            <span className="meta-pill">{parsed.directives.inst}</span>
            <span className="meta-pill meta-pill-count">{parsed.chords.length} chord{parsed.chords.length === 1 ? '' : 's'}</span>
          </div>
          <div className="out-controls-right">
            <button className="icon-btn" onClick={onExport} title="Download as WAV">
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1v7m-3-3l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span>WAV</span>
            </button>
          </div>
        </div>

        <div className="chord-strip">
            {parsed.events.filter(e => e.chord).map((e, i) => (
              <div
                key={i}
                className={"chord-chip" + (isPlaying ? " chord-chip-anim" : "")}
                style={{
                  animationDelay: `${e.secStart}s`,
                  animationDuration: `${Math.max(0.2, e.secDur)}s`,
                  flex: `${e.beats} 0 ${Math.max(96, e.beats * 24)}px`,
                }}
              >
                <span className="chord-label">{e.chord.label}</span>
                <ChordDiagram chord={e.chord} instrument={parsed.directives.inst} accent={accent} />
                <span className="chord-notes">{e.chord.noteNames.join(' ')}</span>
              </div>
            ))}
        </div>

        {parsed.errors && parsed.errors.length > 0 && (
          <div className="parse-errors">
            <span className="pe-icon">!</span>
            <div className="pe-list">
              {parsed.errors.slice(0, 4).map((e, i) => (
                <div key={i} className="pe-row">
                  <span className="pe-line">line {e.line}</span>
                  <span className="pe-msg">{e.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function prettyBeats(b) {
  if (Math.abs(b - 4) < 0.01) return '4';
  if (Math.abs(b - 2) < 0.01) return '2';
  if (Math.abs(b - 1) < 0.01) return '1';
  if (Math.abs(b - 0.5) < 0.01) return '½';
  if (Math.abs(b - 0.25) < 0.01) return '¼';
  if (b >= 1) return b.toFixed(1).replace(/\.0$/, '');
  return b.toFixed(2).replace(/0+$/, '');
}

// ============================================================================
// Single cell
// ============================================================================

function CellMenu({ onDelete }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="cell-menu-wrap" ref={menuRef}>
      <button
        className="cell-menu-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseDown={(e) => e.preventDefault()}
        title="Cell options"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="7" cy="3" r="1.3" />
          <circle cx="7" cy="7" r="1.3" />
          <circle cx="7" cy="11" r="1.3" />
        </svg>
      </button>
      {open && (
        <div className="cell-menu-dropdown">
          <button className="cell-menu-item cell-menu-item-danger"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
              <path d="M2 3h8M4.5 3V2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M3 3l.5 7.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5L9 3" />
              <path d="M5 5.5v3M7 5.5v3" />
            </svg>
            Delete cell
          </button>
        </div>
      )}
    </div>
  );
}

function Cell({ cell, index, selected, editing, onSelect, onEnterEdit, onLeaveEdit, onChange, onRun, onDelete, onSetPreview, theme, accent, playingId, onPlay, onStop }) {
  const taRef = useRef(null);

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      const v = taRef.current.value;
      taRef.current.setSelectionRange(v.length, v.length);
    }
  }, [editing]);

  const promptText = cell.type === 'music'
    ? (cell.runCount != null ? `In [${cell.runCount}]:` : 'In [ ]:')
    : '';
  const isRunning = cell.status === 'running';

  return (
    <div
      className={
        'cell cell-' + cell.type
        + (selected ? ' cell-selected' : '')
        + (editing ? ' cell-editing' : '')
        + (isRunning ? ' cell-running' : '')
      }
      onClick={onSelect}
      data-screen-label={`Cell ${index + 1} (${cell.type})`}
    >
      <div className="cell-prompt">
        {cell.type === 'music' ? (
          <>
            <span className={"prompt-text" + (isRunning ? " prompt-running" : "")}>{isRunning ? 'In [*]:' : promptText}</span>
            <button
              className="cell-run-btn"
              onClick={(e) => { e.stopPropagation(); onRun(); }}
              title="Run cell (Shift+Enter)"
              disabled={isRunning}
            >
              {isRunning ? (
                <svg width="11" height="11" viewBox="0 0 11 11"><circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeDasharray="3 3"><animateTransform attributeName="transform" type="rotate" from="0 5.5 5.5" to="360 5.5 5.5" dur="1s" repeatCount="indefinite"/></circle></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="currentColor" /></svg>
              )}
            </button>
          </>
        ) : null}
      </div>
      <div className="cell-body">
        <CellMenu onDelete={onDelete} />
        {cell.type === 'music' ? (
          <>
            <CodeEditor
              ref={taRef}
              value={cell.source}
              onChange={(v) => onChange(v)}
              onFocus={onEnterEdit}
              onBlur={onLeaveEdit}
            />
            <MusicOutput
              cell={cell}
              isPlaying={playingId === cell.id}
              onRequestPlay={() => onPlay(cell.id)}
              onStop={onStop}
              theme={theme}
              accent={accent}
              runCount={cell.runCount}
            />
          </>
        ) : (
          editing ? (
            cell.previewMode ? (
              <div className="text-split">
                <textarea
                  ref={taRef}
                  className="text-area text-area-split"
                  value={cell.source}
                  onFocus={onEnterEdit}
                  onBlur={onLeaveEdit}
                  onChange={(e) => onChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Markdown — # heading, **bold**, *italic*, `code`, - lists, [link](url)"
                />
                <div
                  className="text-rendered text-rendered-split markdown"
                  onClick={(e) => e.stopPropagation()}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.source) }}
                />
                <button
                  className="md-preview-toggle md-preview-toggle-on"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); onSetPreview(false); }}
                  title="Hide preview"
                >preview</button>
              </div>
            ) : (
              <>
                <textarea
                  ref={taRef}
                  className="text-area"
                  value={cell.source}
                  onFocus={onEnterEdit}
                  onBlur={onLeaveEdit}
                  onChange={(e) => onChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Markdown — # heading, **bold**, *italic*, `code`, - lists, [link](url)"
                />
                <button
                  className="md-preview-toggle"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); onSetPreview(true); }}
                  title="Show preview alongside"
                >preview</button>
              </>
            )
          ) : (
            <div
              className="text-rendered markdown"
              onDoubleClick={onEnterEdit}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.source) }}
            />
          )
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Toolbar
// ============================================================================

function Toolbar({ onAdd, onRun, onRunAll, onStop, onDelete, kernelStatus, onOpenTweaks }) {
  const Icon = (path, viewBox = "0 0 16 16") => (
    <svg width="14" height="14" viewBox={viewBox} fill="currentColor" dangerouslySetInnerHTML={{ __html: path }} />
  );
  const btn = (title, onClick, children, opts = {}) => (
    <button className={"tb-btn" + (opts.primary ? ' tb-btn-primary' : '') + (opts.danger ? ' tb-btn-danger' : '')} title={title} onClick={onClick}>
      {children}
    </button>
  );

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="tb-group">{btn('Insert cell below', onAdd, <span style={{fontWeight:700, fontSize:16, lineHeight:'14px'}}>+</span>)}</div>
        <div className="tb-group">
          {btn('Run All cells', onRunAll, <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{kernelStatus === 'busy' ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" strokeDasharray="6 6" strokeLinecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="0.9s" repeatCount="indefinite"/>
              </circle>
            </svg>
          ) : Icon('<polygon points="2,2 7,8 2,14"/><polygon points="8,2 13,8 8,14"/>')}<span style={{fontSize:12, fontWeight:600}}>{kernelStatus === 'busy' ? 'Running…' : 'Run All'}</span></span>, { primary: true })}
          {btn('Interrupt — stop audio', onStop, Icon('<rect x="3" y="3" width="10" height="10"/>'), { danger: true })}
        </div>
      </div>
      <div className="toolbar-right">
        <button className="tb-btn tb-btn-theme" onClick={onOpenTweaks} title="Theme & display">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="7" cy="7" r="4" />
            <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.6 2.6l1.4 1.4M10 10l1.4 1.4M2.6 11.4l1.4-1.4M10 4l1.4-1.4" strokeLinecap="round"/>
          </svg>
          <span style={{fontSize: 12}}>Theme</span>
        </button>
        <span className="kernel-name">MusicKernel</span>
        <span className={"kernel-dot kernel-" + kernelStatus} title={kernelStatus} />
      </div>
    </div>
  );
}

// ============================================================================
// Starter content
// ============================================================================

const STARTER = [
  {
    id: cellId(),
    type: 'text',
    source: `# Music Composer Notebook

A notebook for sketching chord progressions. Each **code cell** below is parsed as music — use \`@key\`, \`@tempo\`, \`@inst\` directives, then a stream of chord tokens.

**Chord tokens:**
- Absolute: \`Cmaj7\`, \`F#m\`, \`Bb7\`, \`Dm9\`, \`G7sus4\`, \`Em7b5\`, \`C/E\`
- Roman: \`I\`, \`ii\`, \`V7\`, \`vi\`, \`viio\`, \`bVII\`, \`Imaj7\`

**Rhythm:** suffix a chord with \`.w\` (whole), \`.h\` (half), \`.q\` (quarter), \`.e\` (eighth), or \`:N\` for N beats. \`~\` is a rest. Tokens without a suffix split the bar evenly.

Comments use \`--\` (double dash), so \`#\` stays free for sharps like \`F#m\`, \`C#maj7\`.

Hit **Shift+Enter** to render a cell, or **Run All** up top.`,
    runCount: null, output: null, status: 'idle',
  },
  {
    id: cellId(),
    type: 'music',
    source: `@key C
@tempo 72
@inst piano

-- Drifting minor 9th vamp
Dm9.h  Cmaj9/E.h
Dm9.h  Cmaj9/E.h
Dm9.h  Cmaj9/E.h
G7`,
    runCount: null, output: null, status: 'idle',
  },
  {
    id: cellId(),
    type: 'music',
    source: `@key C
@tempo 72
@inst guitar

-- Same vamp, on guitar
Dm9.h  Cmaj9/E.h
Dm9.h  Cmaj9/E.h
Dm9.h  Cmaj9/E.h
G7`,
    runCount: null, output: null, status: 'idle',
  },
  {
    id: cellId(),
    type: 'music',
    source: `@key C
@tempo 72
@inst piano

Fmaj7/D`,
    runCount: null, output: null, status: 'idle',
  },
];

// ============================================================================
// Tweaks
// ============================================================================

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#1a73e8",
  "density": "cozy",
  "monoFont": "IBM Plex Mono"
}/*EDITMODE-END*/;

const ACCENT_OPTIONS = ['#1a73e8', '#d97757', '#1f8a5b', '#a855f7'];
const MONO_FONTS = ['IBM Plex Mono', 'JetBrains Mono', 'Fira Code', 'Source Code Pro'];

function NotebookTweaks({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Theme">
        <TweakRadio value={tweaks.theme} onChange={(v) => setTweak('theme', v)}
          options={['light', 'dark', 'retro']} />
      </TweakSection>
      <TweakSection label="Accent">
        <TweakColor value={tweaks.accent} onChange={(v) => setTweak('accent', v)} options={ACCENT_OPTIONS} />
      </TweakSection>
      <TweakSection label="Density">
        <TweakRadio value={tweaks.density} onChange={(v) => setTweak('density', v)}
          options={['cozy', 'compact']} />
      </TweakSection>
      <TweakSection label="Mono font">
        <TweakSelect value={tweaks.monoFont} onChange={(v) => setTweak('monoFont', v)}
          options={MONO_FONTS} />
      </TweakSection>
    </TweaksPanel>
  );
}

// ============================================================================
// App
// ============================================================================

function App() {
  const [cells, setCells] = useState(STARTER);
  const [selectedId, setSelectedId] = useState(STARTER[1].id);
  const [editingId, setEditingId] = useState(null);
  const [kernelStatus, setKernelStatus] = useState('idle');
  const [runCounter, setRunCounter] = useState(0);
  const [trash, setTrash] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [audioReady, setAudioReady] = useState(false);
  const playingHandleRef = useRef(null);
  const dPressedRef = useRef(false);
  const dTimerRef = useRef(null);

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const theme = tweaks.theme || 'light';
  const accent = tweaks.accent || '#1a73e8';
  const density = tweaks.density || 'cozy';
  const monoFont = tweaks.monoFont || 'IBM Plex Mono';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--font-mono', `'${monoFont}', ui-monospace, Menlo, monospace`);
  }, [theme, accent, density, monoFont]);

  const armAudio = useCallback(async () => {
    try { await window.Tone.start(); setAudioReady(true); } catch (e) {}
  }, []);

  const findIndex = useCallback((id) => cells.findIndex((c) => c.id === id), [cells]);

  const updateCell = useCallback((id, patch) => {
    setCells((cs) => cs.map((c) => c.id === id ? { ...c, ...patch } : c));
  }, []);

  const insertCell = useCallback((afterId, where = 'below', type = 'music', source) => {
    setCells((cs) => {
      const idx = afterId ? cs.findIndex((c) => c.id === afterId) : cs.length - 1;
      const insertAt = where === 'above' ? Math.max(0, idx) : idx + 1;
      const nc = {
        id: cellId(), type,
        source: source != null ? source : (type === 'music' ? '@key C\n@tempo 96\n@inst piano\n\n' : ''),
        runCount: null, output: null, status: 'idle',
      };
      const next = [...cs];
      next.splice(insertAt, 0, nc);
      setSelectedId(nc.id);
      setEditingId(source ? null : nc.id);
      return next;
    });
  }, []);

  const deleteCell = useCallback((id) => {
    setCells((cs) => {
      const idx = cs.findIndex((c) => c.id === id);
      if (idx < 0) return cs;
      const removed = cs[idx];
      setTrash((t) => [...t, { cell: removed, idx }]);
      const next = cs.filter((c) => c.id !== id);
      if (next.length) setSelectedId(next[Math.min(idx, next.length - 1)].id);
      else setSelectedId(null);
      return next;
    });
  }, []);

  const undoDelete = useCallback(() => {
    setTrash((t) => {
      if (!t.length) return t;
      const last = t[t.length - 1];
      setCells((cs) => {
        const next = [...cs];
        next.splice(Math.min(last.idx, next.length), 0, last.cell);
        return next;
      });
      setSelectedId(last.cell.id);
      return t.slice(0, -1);
    });
  }, []);

  const convertCell = useCallback((id, type) => {
    setCells((cs) => cs.map((c) => c.id === id ? { ...c, type, output: null, runCount: null } : c));
  }, []);

  const runCell = useCallback(async (id) => {
    const c = cells.find((x) => x.id === id);
    if (!c) return;
    if (c.type === 'text') {
      setEditingId((e) => e === id ? null : e);
      return;
    }
    setKernelStatus('busy');
    updateCell(id, { status: 'running' });
    try {
      const parsed = window.MusicEngine.parseSource(c.source);
      if (parsed.errors && parsed.errors.length > 0) {
        const lines = parsed.errors.map((e) => `Line ${e.line}: ${e.msg}`).join('\n');
        updateCell(id, { status: 'idle', output: { kind: 'error', error: lines } });
        return;
      }
      const isEmpty = parsed.kind === 'drums'
        ? (!parsed.events || parsed.events.length === 0)
        : parsed.chords.length === 0;
      if (isEmpty) {
        const msg = parsed.kind === 'drums'
          ? 'No drum hits. Try `bd: x.4 ~.4 x.4 ~.4`.'
          : 'No chords. Try `Cmaj7  Am7  Dm7  G7`.';
        updateCell(id, { status: 'idle', output: { kind: 'error', error: msg } });
        return;
      }
      const buffer = await window.MusicEngine.renderToBuffer(parsed);
      const nextCount = runCounter + 1;
      setRunCounter(nextCount);
      updateCell(id, { status: 'idle', runCount: nextCount, output: { kind: 'rendered', buffer, parsed, duration: buffer.duration } });
    } catch (e) {
      updateCell(id, { status: 'idle', output: { kind: 'error', error: String(e && e.message || e) } });
    } finally {
      setKernelStatus('idle');
    }
  }, [cells, runCounter, updateCell]);

  const runAll = useCallback(async () => {
    setKernelStatus('busy');
    let counter = runCounter;
    for (const c of cells) {
      if (c.type !== 'music') continue;
      updateCell(c.id, { status: 'running' });
      try {
        const parsed = window.MusicEngine.parseSource(c.source);
        if (parsed.errors && parsed.errors.length > 0) {
          const lines = parsed.errors.map((e) => `Line ${e.line}: ${e.msg}`).join('\n');
          updateCell(c.id, { status: 'idle', output: { kind: 'error', error: lines } });
          continue;
        }
        const isEmpty = parsed.kind === 'drums'
          ? (!parsed.events || parsed.events.length === 0)
          : parsed.chords.length === 0;
        if (isEmpty) {
          const msg = parsed.kind === 'drums' ? 'No drum hits.' : 'No chords.';
          updateCell(c.id, { status: 'idle', output: { kind: 'error', error: msg } });
          continue;
        }
        const buffer = await window.MusicEngine.renderToBuffer(parsed);
        counter += 1;
        updateCell(c.id, { status: 'idle', runCount: counter, output: { kind: 'rendered', buffer, parsed, duration: buffer.duration } });
      } catch (e) {
        updateCell(c.id, { status: 'idle', output: { kind: 'error', error: String(e && e.message || e) } });
      }
    }
    setRunCounter(counter);
    setKernelStatus('idle');
  }, [cells, runCounter, updateCell]);

  const stopPlay = useCallback(() => {
    if (playingHandleRef.current) { try { playingHandleRef.current.stop(); } catch (e) {} playingHandleRef.current = null; }
    setPlayingId(null);
  }, []);

  const playCell = useCallback(async (id) => {
    if (!audioReady) await armAudio();
    stopPlay();
    const c = cells.find((x) => x.id === id);
    if (!c || !c.output || c.output.kind !== 'rendered') return;
    const handle = window.MusicEngine.playBuffer(c.output.buffer, () => {
      if (playingHandleRef.current === handle) { playingHandleRef.current = null; setPlayingId(null); }
    });
    playingHandleRef.current = handle;
    setPlayingId(id);
  }, [cells, audioReady, armAudio, stopPlay]);

  // Insert from palette
  const insertFromPalette = useCallback((source) => {
    const target = selectedId || (cells.length ? cells[cells.length - 1].id : null);
    insertCell(target, 'below', 'music', source);
  }, [selectedId, cells, insertCell]);

  // Keybindings
  useEffect(() => {
    const onKey = (e) => {
      const inEditable = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable;

      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        if (selectedId) {
          runCell(selectedId);
          const idx = findIndex(selectedId);
          if (idx === cells.length - 1) insertCell(selectedId, 'below', 'music');
          else { setSelectedId(cells[idx + 1].id); setEditingId(null); if (e.target.blur) e.target.blur(); }
        }
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); if (selectedId) runCell(selectedId); return;
      }
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        if (selectedId) { runCell(selectedId); insertCell(selectedId, 'below', 'music'); }
        return;
      }

      if (inEditable) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setEditingId(null);
          if (e.target.blur) e.target.blur();
        }
        return;
      }

      if (!selectedId) return;
      const idx = findIndex(selectedId);

      if (e.key === 'Enter') { e.preventDefault(); setEditingId(selectedId); return; }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); insertCell(selectedId, 'above', 'music'); return; }
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); insertCell(selectedId, 'below', 'music'); return; }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoDelete(); return; }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (dPressedRef.current) {
          deleteCell(selectedId);
          dPressedRef.current = false;
          if (dTimerRef.current) clearTimeout(dTimerRef.current);
        } else {
          dPressedRef.current = true;
          dTimerRef.current = setTimeout(() => { dPressedRef.current = false; }, 800);
        }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); if (idx < cells.length - 1) setSelectedId(cells[idx + 1].id); return; }
      if (e.key === 'ArrowUp'   || e.key === 'k') { e.preventDefault(); if (idx > 0) setSelectedId(cells[idx - 1].id); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, editingId, cells, runCell, insertCell, deleteCell, convertCell, undoDelete, findIndex]);

  const selectedCell = cells.find((c) => c.id === selectedId);

  return (
    <div className="notebook-root">
      <header className="nb-header">
        <div className="nb-header-left">
          <div className="nb-logo">
            <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="9" cy="17" r="3" fill="currentColor"/><circle cx="18" cy="14" r="3" fill="currentColor"/><path d="M12 17V5l9-2v12" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
          </div>
          <div className="nb-titles">
            <div className="nb-title">Composer<span className="nb-title-sep">.</span><span className="nb-title-ext">nb</span></div>
            <div className="nb-subtitle">Last Checkpoint: a few seconds ago <span className="nb-dim">(autosaved)</span></div>
          </div>
        </div>
      </header>

      <Toolbar
        onAdd={() => insertCell(selectedId || (cells[cells.length-1] && cells[cells.length-1].id), 'below', 'music')}
        onRun={() => selectedId && runCell(selectedId)}
        onRunAll={runAll}
        onStop={stopPlay}
        onDelete={() => selectedId && deleteCell(selectedId)}
        kernelStatus={kernelStatus}
        onOpenTweaks={() => window.postMessage({ type: '__activate_edit_mode' }, '*')}
      />

      <main
        className="nb-main"
        onClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('cells')) setSelectedId(null); }}
      >
        <div className="cells">
          {cells.map((c, i) => (
            <Cell
              key={c.id}
              cell={c} index={i}
              selected={c.id === selectedId}
              editing={c.id === editingId}
              theme={theme}
              accent={accent}
              playingId={playingId}
              onSelect={() => setSelectedId(c.id)}
              onEnterEdit={() => setEditingId(c.id)}
              onLeaveEdit={() => setEditingId((cur) => cur === c.id ? null : cur)}
              onChange={(v) => updateCell(c.id, { source: v })}
              onRun={() => runCell(c.id)}
              onDelete={() => deleteCell(c.id)}
              onSetPreview={(v) => updateCell(c.id, { previewMode: v })}
              onPlay={playCell}
              onStop={stopPlay}
            />
          ))}
        </div>
      </main>

      <footer className="status-bar">
        <span className="sb-item">Composer.nb</span>
        <span className="sb-sep">|</span>
        <span className="sb-item">MusicKernel | {kernelStatus === 'busy' ? 'Busy' : 'Idle'}</span>
        <span className="sb-sep">|</span>
        <span className="sb-item">Mode: {editingId ? 'Edit' : 'Command'}</span>
        <span className="sb-spacer" />
        <span className="sb-item sb-dim">Shift+Enter run · Esc exit edit · A/B insert · DD delete · Z undo</span>
      </footer>

      <NotebookTweaks tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
