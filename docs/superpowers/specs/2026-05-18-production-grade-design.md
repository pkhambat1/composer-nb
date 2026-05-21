# Production-Grade Polish: Music Composer Notebook

## Goal

Take a feature-complete but janky music composer notebook and make it feel polished and maintainable. Fix broken playback, tighten visual polish (minimal/clean hybrid aesthetic), reduce workflow friction, and extract the monolithic codebase into organized components.

## Approach: Fix-First

Each step produces visible improvement. Refactoring happens in service of UX fixes, not as a separate pass.

Order: Fix playback → Extract components organically → Visual polish

---

## 1. Playback System Fix

### Problem

The play button is broken in multiple ways due to a single-value `playingId` state conflating "which cell owns audio focus" with "is audio playing."

### Bugs

1. **Can't resume from pause.** Clicking pause calls `onPlaybackEnd`, clearing `playingId`. Next click starts fresh instead of resuming.
2. **Race condition on re-run.** WaveSurfer cleanup fires `onPlaybackEnd` after the new instance is created, wiping new playback state.
3. **Silent play failures.** `ws.play().catch(() => {})` swallows errors. No user feedback when audio context isn't armed.
4. **Player ref deleted while playing.** Cleanup in the `ready` effect removes player ref without stopping playback.

### Fix

Split `playingId` into two state values:

- `focusedCellId` — which cell currently owns audio focus (persists through pause)
- `isPlaying` — boolean, whether audio is actually playing

State machine:

```
IDLE ──[click play]──> PLAYING
PLAYING ──[click pause]──> PAUSED  (focusedCellId retained)
PAUSED ──[click play]──> PLAYING  (resumes from position)
PAUSED ──[play other cell]──> PLAYING (new focusedCellId)
PLAYING ──[finish]──> IDLE
PLAYING/PAUSED ──[re-run cell]──> IDLE → re-render → IDLE
```

Cleanup race condition fix: Use an abort flag in the WaveSurfer effect. Cleanup sets the flag but does NOT call `onPlaybackEnd`. The new effect instance checks the flag to decide whether to auto-play.

Extract all playback logic into a `usePlayback` hook:
- State: `focusedCellId`, `isPlaying`
- Refs: `playersRef`
- Actions: `playCell(id)`, `pauseCell()`, `stopCell(id)`, `togglePlayback(id)`
- Callbacks: `onPlaybackEnd(id)`, `registerPlayer(id, playerApi)`

### Player API contract

Each MusicOutput registers a player object:

```javascript
{
  play: () => void,
  pause: () => void,
  stop: () => void,       // pause + seek to 0
  isPlaying: () => boolean,
  getCurrentTime: () => number,
}
```

---

## 2. Component Extraction

Break the 2046-line `notebook.jsx` into focused files. No new features — just moving existing code.

### File structure

```
notebook.jsx              → App shell, cell state, keyboard shortcuts (~400 lines)
components/
  Toolbar.jsx             → +, Run All, Stop, Theme button, kernel status
  Cell.jsx                → Cell wrapper: gutter, edit/command mode dispatch
  CodeEditor.jsx          → Textarea + syntax highlight overlay
  MusicOutput.jsx         → Waveform, chord strip, piano roll, WAV download
  ChordDiagram.jsx        → Guitar/Piano SVG diagrams
  MarkdownCell.jsx        → Markdown rendering for text cells
  StatusBar.jsx           → Bottom bar
  Sidebar.jsx             → Nav tabs + chord browser panel
hooks/
  usePlayback.js          → Playback state machine (from Section 1)
  useCellManager.js       → Cell CRUD, ordering, undo/trash
  useKeyboard.js          → Keyboard shortcut handling
shared/
  constants.js            → Magic numbers, default values
  chord-regex.js          → Shared chord parsing regex (currently duplicated in 3 files)
```

### Rules

- Each component receives props from App. No new state management library.
- `window.*` globals stay (MusicEngine, highlightMusic, ChordLookup) since we're keeping the no-bundler setup.
- Components are plain functions, no classes.
- No new dependencies.

---

## 3. Visual Polish (Hybrid: Clean Core, Notebook Structure)

Keep the cell-based notebook structure. Modernize everything inside.

### Cells

- Borders: 2px → 1px, low opacity gray. Accent color only on selected/focused cell.
- Code line-height: tighten to match VS Code density.
- Gutter (`In [N]:`): smaller font, muted color, less horizontal space.
- Output area: subtle top border separator instead of heavy box.

### Waveform player

- Slim inline bar, same width as code area.
- Play button integrated into the left edge of the bar.
- Time display compact: `0:00 / 0:14` instead of current layout.
- Remove heavy chrome/borders around the player.

### Chord diagrams / piano roll

- Compact horizontal tile layout: chord name + small diagram side by side.
- Piano roll becomes a thin strip instead of tall block.
- Reduce diagram size ~40%.

### Toolbar

- Reduce padding, subtler button styles.
- Kernel status: small dot + text, not a badge.
- Less visual weight overall.

### Status bar

- Shrink to essentials: filename, kernel status, mode.
- Keyboard shortcut hints become tooltip on hover, not always visible.

### Transitions

- Cell output: subtle fade-in when appearing after run.
- Theme switching: smooth CSS transition on custom properties (currently instant).
- Cell selection: subtle highlight transition.

### Theme CSS changes

All visual changes go through CSS custom properties. No theme logic changes — just tighter values for spacing, borders, font sizes.

---

## 4. Workflow Friction Fixes

Small targeted improvements that reduce clicks and awkwardness:

- **Cell run feedback:** Immediate visual indicator that a cell is rendering (spinner or pulse on the gutter) — currently the UI just freezes until `renderToBuffer` resolves.
- **Clearer error display:** Parse errors in cells should be inline and styled, not just dumped text.
- **Better focus management:** After running a cell, focus should move to the output (play button) so you can immediately press Enter/Space to play.
- **Double-D delete timing:** Currently 800ms magic number — extract to constant, consider reducing to 400ms for snappier feel.

---

## Out of Scope

- No bundler (Vite) — keeping the no-build setup
- No new features
- No mobile/responsive layout
- No PWA/offline support
- No test coverage (separate effort)
- No new dependencies
