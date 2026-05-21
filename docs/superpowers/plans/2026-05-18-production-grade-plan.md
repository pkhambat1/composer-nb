# Production-Grade Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken playback, extract the monolithic notebook.jsx into organized components/hooks, and apply visual polish for a minimal/clean aesthetic.

**Architecture:** No-bundler setup (Babel standalone + script tags). Each extracted file defines global functions. Files loaded in dependency order via `<script>` tags in index.html. Hooks are plain JS files; components are `.jsx` files.

**Tech Stack:** React 18 (UMD), Tone.js, WaveSurfer.js, Babel standalone, Python dev server.

**Constraints:**
- No bundler, no ES module imports between files — globals only
- No new dependencies
- Tests are out of scope for this plan
- All visual changes go through CSS custom properties

**Deferred:**
- `shared/chord-regex.js` — extracting the duplicated chord regex requires modifying `music-engine.js`, `highlight.js`, and `chord-lookup.js`. Deferred to a future cleanup pass to keep this plan focused.

---

## File Structure After All Tasks

```
index.html                  (modify: add script tags, CSS changes)
notebook.jsx                (modify: shrink to ~400 lines — App shell + cell state + keyboard)
hooks/
  usePlayback.js            (create: playback state machine, player registry)
  useCellManager.js         (create: cell CRUD, ordering, undo/trash)
  useKeyboard.js            (create: keyboard shortcut handling)
components/
  Toolbar.jsx               (create: top bar)
  Cell.jsx                  (create: cell wrapper + CellMenu)
  CodeEditor.jsx            (create: textarea + syntax highlight overlay)
  MusicOutput.jsx           (create: waveform, chord strip, diagrams, WAV export)
  ChordDiagram.jsx          (create: GuitarDiagram + PianoDiagram SVGs)
  MarkdownCell.jsx          (create: markdown rendering)
  StatusBar.jsx             (create: bottom bar)
  Sidebar.jsx               (create: nav tabs)
  ChordBrowser.jsx          (create: chord library panel)
shared/
  constants.js              (create: shared regex, magic numbers, defaults)
music-engine.js             (no changes)
highlight.js                (no changes)
chord-lookup.js             (no changes)
tweaks-panel.jsx            (no changes)
```

---

## Task 1: Create shared constants

Extract duplicated values into a shared constants file loaded before everything else.

**Files:**
- Create: `shared/constants.js`
- Modify: `index.html` (add script tag)

- [ ] **Step 1: Create shared/constants.js**

```javascript
// shared/constants.js — Global constants shared across modules
// Loaded before all other app scripts.

window.APP_CONSTANTS = {
  // Double-press "D" to delete timeout (ms)
  DOUBLE_KEY_TIMEOUT: 400,

  // Default tweaks
  TWEAK_DEFAULTS: {
    theme: "light",
    accent: "#1a73e8",
    density: "cozy",
    monoFont: "IBM Plex Mono",
  },

  ACCENT_OPTIONS: ["#1a73e8", "#d97757", "#1f8a5b", "#a855f7"],
  MONO_FONTS: ["IBM Plex Mono", "JetBrains Mono", "Fira Code", "Source Code Pro"],

  // Starter cells
  STARTER_CELLS: [
    {
      type: "text",
      source: `# Music Composer Notebook

A notebook for sketching chord progressions. Each **code cell** below is parsed as music — use \`@key\`, \`@tempo\`, \`@inst\` directives, then a stream of chord tokens.

**Chord tokens:**
- Absolute: \`Cmaj7\`, \`F#m\`, \`Bb7\`, \`Dm9\`, \`G7sus4\`, \`Em7b5\`, \`C/E\`
- Roman: \`I\`, \`ii\`, \`V7\`, \`vi\`, \`viio\`, \`bVII\`, \`Imaj7\`

**Rhythm:** suffix a chord with \`.w\` (whole), \`.h\` (half), \`.q\` (quarter), \`.e\` (eighth), or \`:N\` for N beats. \`~\` is a rest. Tokens without a suffix split the bar evenly.

Comments use \`--\` (double dash), so \`#\` stays free for sharps like \`F#m\`, \`C#maj7\`.

Hit **Shift+Enter** to render a cell, or **Run All** up top.`,
    },
    {
      type: "music",
      source: `@key C\n@tempo 72\n@inst piano\n\n-- Drifting minor 9th vamp\nDm9.h  Cmaj9/E.h\nDm9.h  Cmaj9/E.h\nDm9.h  Cmaj9/E.h\nG7`,
    },
    {
      type: "music",
      source: `@key C\n@tempo 72\n@inst guitar\n\n-- Same vamp, on guitar\nDm9.h  Cmaj9/E.h\nDm9.h  Cmaj9/E.h\nDm9.h  Cmaj9/E.h\nG7`,
    },
    {
      type: "music",
      source: `@key C\n@tempo 72\n@inst piano\n\nFmaj7/D`,
    },
  ],
}
```

- [ ] **Step 2: Add script tag to index.html**

Add this line in index.html, after the `highlight.js` script tag and before `tweaks-panel.jsx`:

```html
<script src="shared/constants.js"></script>
```

- [ ] **Step 3: Create directories**

```bash
mkdir -p shared hooks components
```

- [ ] **Step 4: Verify app still loads**

Open http://localhost:5173 and verify the app renders without errors. Check browser console for any script loading issues.

- [ ] **Step 5: Commit**

```bash
git add shared/constants.js index.html
git commit -m "feat: extract shared constants into separate module"
```

---

## Task 2: Fix playback — create usePlayback hook

This is the critical bug fix. Replace the broken single `playingId` state with a proper playback state machine that supports pause/resume.

**Files:**
- Create: `hooks/usePlayback.js`
- Modify: `index.html` (add script tag)

- [ ] **Step 1: Create hooks/usePlayback.js**

```javascript
// hooks/usePlayback.js — Playback state machine
// Provides: focusedCellId, isPlaying, playersRef, and control functions.
//
// State machine:
//   IDLE ──[play]──> PLAYING
//   PLAYING ──[pause]──> PAUSED  (focusedCellId kept)
//   PAUSED ──[play same]──> PLAYING  (resume from position)
//   PAUSED ──[play other]──> PLAYING (new cell)
//   PLAYING ──[finish]──> IDLE
//   PLAYING/PAUSED ──[stop]──> IDLE

const { useState, useRef, useCallback } = React

window.usePlayback = function usePlayback(armAudio) {
  const [focusedCellId, setFocusedCellId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playersRef = useRef({})

  const registerPlayer = useCallback((cellId, playerApi) => {
    playersRef.current[cellId] = playerApi
  }, [])

  const unregisterPlayer = useCallback((cellId) => {
    delete playersRef.current[cellId]
  }, [])

  // Play a cell. If another cell is focused, stop it first.
  // If the same cell is paused, resume it.
  const playCell = useCallback(async (id) => {
    await armAudio()
    const currentFocused = focusedCellId
    // Stop the previously focused cell if it's different
    if (currentFocused && currentFocused !== id) {
      const prev = playersRef.current[currentFocused]
      if (prev) {
        try { prev.stop() } catch (_) {}
      }
    }
    setFocusedCellId(id)
    setIsPlaying(true)
  }, [armAudio, focusedCellId])

  // Pause the currently playing cell (keeps focusedCellId)
  const pauseCell = useCallback(() => {
    if (focusedCellId) {
      const player = playersRef.current[focusedCellId]
      if (player) {
        try { player.pause() } catch (_) {}
      }
    }
    setIsPlaying(false)
  }, [focusedCellId])

  // Toggle play/pause for a cell
  const togglePlayback = useCallback(async (id) => {
    await armAudio()
    if (focusedCellId === id && isPlaying) {
      // Currently playing this cell — pause it
      pauseCell()
    } else if (focusedCellId === id && !isPlaying) {
      // This cell is paused — resume
      setIsPlaying(true)
    } else {
      // Different cell or nothing playing — play new cell
      playCell(id)
    }
  }, [armAudio, focusedCellId, isPlaying, pauseCell, playCell])

  // Stop a specific cell's playback and clear focus
  const stopCell = useCallback((id) => {
    const player = playersRef.current[id]
    if (player) {
      try { player.stop() } catch (_) {}
    }
    setFocusedCellId(cur => cur === id ? null : cur)
    setIsPlaying(prev => {
      // Only set to false if we're stopping the focused cell
      if (focusedCellId === id) return false
      return prev
    })
  }, [focusedCellId])

  // Stop all playback
  const stopAll = useCallback(() => {
    if (focusedCellId) {
      const player = playersRef.current[focusedCellId]
      if (player) {
        try { player.stop() } catch (_) {}
      }
    }
    setFocusedCellId(null)
    setIsPlaying(false)
  }, [focusedCellId])

  // Called when a WaveSurfer instance finishes playing to the end
  const onPlaybackFinished = useCallback((id) => {
    setFocusedCellId(cur => cur === id ? null : cur)
    setIsPlaying(prev => {
      // Only clear if this is the cell that finished
      return focusedCellId === id ? false : prev
    })
  }, [focusedCellId])

  return {
    focusedCellId,
    isPlaying,
    playersRef,
    registerPlayer,
    unregisterPlayer,
    playCell,
    pauseCell,
    togglePlayback,
    stopCell,
    stopAll,
    onPlaybackFinished,
  }
}
```

- [ ] **Step 2: Add script tag to index.html**

Add after `shared/constants.js`, before `tweaks-panel.jsx`:

```html
<script src="hooks/usePlayback.js"></script>
```

- [ ] **Step 3: Verify the file loads without errors**

Open http://localhost:5173 and check the browser console. `window.usePlayback` should be defined.

- [ ] **Step 4: Commit**

```bash
git add hooks/usePlayback.js index.html
git commit -m "feat: add usePlayback hook with proper pause/resume state machine"
```

---

## Task 3: Wire usePlayback into App and MusicOutput

Replace the old `playingId` / `onPlaybackEnd` / `playCell` logic with the new hook. Fix the WaveSurfer cleanup race condition.

**Files:**
- Modify: `notebook.jsx` (App component + MusicOutput component)

- [ ] **Step 1: Replace playback state in App**

In `notebook.jsx`, in the `App` function (around lines 1587-1803), replace:

```javascript
const [playingId, setPlayingId] = useState(null)
const [audioReady, setAudioReady] = useState(false)
const playersRef = useRef({})
```

with:

```javascript
const [audioReady, setAudioReady] = useState(false)
```

And add the hook call right after `armAudio`:

```javascript
const playback = usePlayback(armAudio)
```

- [ ] **Step 2: Remove old playback functions from App**

Remove the following functions from App:
- `stopCellPlayback` (lines 1684-1688)
- `onPlaybackEnd` (lines 1790-1792)
- `playCell` (lines 1794-1803)
- `stopPlay` (lines 1741-1746)

Replace their usages:
- `stopCellPlayback(id)` → `playback.stopCell(id)`
- `stopPlay()` → `playback.stopAll()`
- `playCell` prop → `playback.togglePlayback`
- `onPlaybackEnd` prop → `playback.onPlaybackFinished`
- `playingId` prop → `playback.focusedCellId`
- `playersRef` prop → `playback.playersRef`

- [ ] **Step 3: Update Cell component props**

In the Cell component, rename the `onPlay` prop to `onTogglePlayback` and `playingId` to `focusedCellId`. Pass through to MusicOutput.

- [ ] **Step 4: Rewrite MusicOutput playback integration**

In MusicOutput, make these changes:

1. Accept new props: `focusedCellId`, `isPlaying` (from playback hook), `onTogglePlayback`, `onPlaybackFinished`, `registerPlayer`, `unregisterPlayer`

2. Replace the `isActive` derived state:
```javascript
const isFocused = focusedCellId === cell.id
const cellIsPlaying = isFocused && isPlaying
```

3. Fix the WaveSurfer init effect (currently lines 697-749). The cleanup must NOT call onPlaybackEnd. Use an abort pattern:

```javascript
useEffect(() => {
  if (!buffer || !waveMountRef.current || !window.WaveSurfer) return
  let aborted = false

  const colors = themeColors(theme, accent)
  const url = window.MusicEngine.bufferToObjectUrl(buffer)
  urlRef.current = url
  setReady(false)

  const ws = window.WaveSurfer.create({
    container: waveMountRef.current,
    height: 50,
    waveColor: colors.midline || "rgba(0,0,0,0.12)",
    progressColor: colors.primary,
    cursorColor: colors.primary,
    cursorWidth: 2,
    barWidth: 2,
    barGap: 1,
    barRadius: 1,
    normalize: true,
    interact: true,
    autoplay: false,
  })

  wsRef.current = ws

  let lastTimeUi = 0
  const bumpTime = () => {
    if (aborted) return
    const now = Date.now()
    if (now - lastTimeUi < 200) return
    lastTimeUi = now
    setTimeTick(n => n + 1)
  }
  const onFinish = () => {
    if (!aborted) onPlaybackFinishedRef.current(cell.id)
  }

  ws.on("ready", () => {
    if (!aborted) setReady(true)
  })
  ws.on("finish", onFinish)
  ws.on("timeupdate", bumpTime)
  ws.on("audioprocess", bumpTime)

  ws.load(url)

  return () => {
    aborted = true
    ws.un("finish", onFinish)
    ws.destroy()
    wsRef.current = null
    setReady(false)
    // Do NOT call onPlaybackFinished here — avoids the race condition
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }
}, [buffer, cell.runCount, theme, accent, cell.id])
```

4. Fix the player registration effect to use registerPlayer/unregisterPlayer:

```javascript
useEffect(() => {
  if (!ready || !wsRef.current) return
  registerPlayer(cell.id, {
    play: () => wsRef.current?.play(),
    pause: () => wsRef.current?.pause(),
    stop: () => {
      wsRef.current?.pause()
      wsRef.current?.seekTo(0)
    },
    isPlaying: () => wsRef.current?.isPlaying() ?? false,
    getCurrentTime: () => wsRef.current?.getCurrentTime() ?? 0,
  })
  return () => unregisterPlayer(cell.id)
}, [ready, cell.id, registerPlayer, unregisterPlayer])
```

5. Fix the play/pause sync effect to use the new state:

```javascript
useEffect(() => {
  const ws = wsRef.current
  if (!ws || !ready) return
  if (focusedCellId === cell.id && isPlaying) {
    if (!ws.isPlaying()) {
      ws.play().catch(err => {
        console.warn("Playback failed:", err.message)
      })
    }
  } else {
    if (ws.isPlaying()) ws.pause()
  }
}, [focusedCellId, isPlaying, cell.id, ready])
```

6. Fix the play button click handler:

```javascript
onClick={async (e) => {
  e.stopPropagation()
  await armAudio()
  const w = wsRef.current
  if (!w || !ready) return
  onTogglePlayback(cell.id)
}}
```

7. Update the `isPlaying` display logic:

```javascript
const displayPlaying = cellIsPlaying && ws && ready && ws.isPlaying()
const displayPaused = isFocused && !isPlaying && ws && ready && ws.getCurrentTime() > 0
```

Use `displayPlaying` for the pause icon and `displayPaused` for the paused visual state.

- [ ] **Step 5: Update all prop passing in App render**

In App's render, update the Cell props:

```javascript
<Cell
  key={c.id}
  cell={c}
  index={i}
  selected={c.id === selectedId}
  editing={c.id === editingId}
  theme={theme}
  accent={accent}
  focusedCellId={playback.focusedCellId}
  isPlaying={playback.isPlaying}
  playersRef={playback.playersRef}
  registerPlayer={playback.registerPlayer}
  unregisterPlayer={playback.unregisterPlayer}
  onSelect={() => setSelectedId(c.id)}
  onEnterEdit={() => setEditingId(c.id)}
  onLeaveEdit={() => setEditingId(cur => cur === c.id ? null : cur)}
  onChange={v => updateCell(c.id, { source: v })}
  onRun={() => runCell(c.id)}
  onDelete={() => deleteCell(c.id)}
  onSetPreview={v => updateCell(c.id, { previewMode: v })}
  onTogglePlayback={playback.togglePlayback}
  onPlaybackFinished={playback.onPlaybackFinished}
  armAudio={armAudio}
/>
```

Update Toolbar `onStop` to use `playback.stopAll`.

Update sidebar tab click to use `playback.stopAll()`.

Update `runCell` to call `playback.stopCell(id)` instead of `stopCellPlayback(id)`.

Update `runAll` to call `playback.stopAll()` instead of `stopPlay()`.

- [ ] **Step 6: Test playback manually**

1. Run a cell, click play — should play
2. Click pause — should pause (waveform position preserved)
3. Click play again — should resume from paused position
4. While one cell plays, click play on another — should stop first, play second
5. Let a cell play to completion — should return to idle
6. Re-run a cell while it's playing — should stop cleanly, render new output

- [ ] **Step 7: Commit**

```bash
git add notebook.jsx
git commit -m "fix: rewrite playback with proper pause/resume state machine

Fixes: can't resume from pause, cleanup race condition,
silent play failures, player ref cleanup timing."
```

---

## Task 4: Extract useCellManager hook

Move cell CRUD, ordering, undo/trash out of App into a dedicated hook.

**Files:**
- Create: `hooks/useCellManager.js`
- Modify: `notebook.jsx` (App component)
- Modify: `index.html` (add script tag)

- [ ] **Step 1: Create hooks/useCellManager.js**

```javascript
// hooks/useCellManager.js — Cell CRUD, ordering, undo/trash
const { useState, useCallback } = React

let _cid = 0
function cellId() {
  return "c" + ++_cid + "_" + Date.now().toString(36)
}

window.cellId = cellId

window.useCellManager = function useCellManager(starterCells) {
  const initial = starterCells.map(s => ({
    id: cellId(),
    type: s.type,
    source: s.source,
    runCount: null,
    output: null,
    status: "idle",
  }))

  const [cells, setCells] = useState(initial)
  const [selectedId, setSelectedId] = useState(initial[1]?.id || null)
  const [editingId, setEditingId] = useState(null)
  const [trash, setTrash] = useState([])

  const findIndex = useCallback(
    (id) => cells.findIndex(c => c.id === id),
    [cells]
  )

  const updateCell = useCallback((id, patch) => {
    setCells(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])

  const insertCell = useCallback((afterId, where = "below", type = "music", source) => {
    setCells(cs => {
      const idx = afterId ? cs.findIndex(c => c.id === afterId) : cs.length - 1
      const insertAt = where === "above" ? Math.max(0, idx) : idx + 1
      const nc = {
        id: cellId(),
        type,
        source: source != null ? source : (type === "music" ? "@key C\n@tempo 96\n@inst piano\n\n" : ""),
        runCount: null,
        output: null,
        status: "idle",
      }
      const next = [...cs]
      next.splice(insertAt, 0, nc)
      setSelectedId(nc.id)
      setEditingId(source ? null : nc.id)
      return next
    })
  }, [])

  const deleteCell = useCallback((id) => {
    setCells(cs => {
      const idx = cs.findIndex(c => c.id === id)
      if (idx < 0) return cs
      const removed = cs[idx]
      setTrash(t => [...t, { cell: removed, idx }])
      const next = cs.filter(c => c.id !== id)
      if (next.length) setSelectedId(next[Math.min(idx, next.length - 1)].id)
      else setSelectedId(null)
      return next
    })
  }, [])

  const undoDelete = useCallback(() => {
    setTrash(t => {
      if (!t.length) return t
      const last = t[t.length - 1]
      setCells(cs => {
        const next = [...cs]
        next.splice(Math.min(last.idx, next.length), 0, last.cell)
        return next
      })
      setSelectedId(last.cell.id)
      return t.slice(0, -1)
    })
  }, [])

  const convertCell = useCallback((id, type) => {
    setCells(cs => cs.map(c =>
      c.id === id ? { ...c, type, output: null, runCount: null } : c
    ))
  }, [])

  return {
    cells,
    setCells,
    selectedId,
    setSelectedId,
    editingId,
    setEditingId,
    findIndex,
    updateCell,
    insertCell,
    deleteCell,
    undoDelete,
    convertCell,
  }
}
```

- [ ] **Step 2: Add script tag to index.html**

Add after `hooks/usePlayback.js`:

```html
<script src="hooks/useCellManager.js"></script>
```

- [ ] **Step 3: Wire into App**

In App, replace:
- Remove the `_cid`/`cellId` function at the top of notebook.jsx
- Remove `STARTER` array
- Remove individual `useState` calls for `cells`, `selectedId`, `editingId`, `trash`
- Remove `findIndex`, `updateCell`, `insertCell`, `deleteCell`, `undoDelete`, `convertCell`

Replace with:

```javascript
const cm = useCellManager(APP_CONSTANTS.STARTER_CELLS)
const { cells, selectedId, editingId, findIndex, updateCell,
        insertCell, deleteCell, undoDelete, convertCell } = cm
const setSelectedId = cm.setSelectedId
const setEditingId = cm.setEditingId
```

- [ ] **Step 4: Verify app works**

Test: add cell, delete cell, undo delete, edit cell, run cell, navigate with keyboard. All should work as before.

- [ ] **Step 5: Commit**

```bash
git add hooks/useCellManager.js notebook.jsx index.html
git commit -m "refactor: extract cell management into useCellManager hook"
```

---

## Task 5: Extract useKeyboard hook

Move the keyboard event handler out of App.

**Files:**
- Create: `hooks/useKeyboard.js`
- Modify: `notebook.jsx`
- Modify: `index.html`

- [ ] **Step 1: Create hooks/useKeyboard.js**

```javascript
// hooks/useKeyboard.js — Keyboard shortcut handling
const { useEffect, useRef } = React

window.useKeyboard = function useKeyboard({
  selectedId,
  editingId,
  cells,
  findIndex,
  runCell,
  insertCell,
  deleteCell,
  undoDelete,
  setSelectedId,
  setEditingId,
}) {
  const dPressedRef = useRef(false)
  const dTimerRef = useRef(null)
  const DOUBLE_KEY_TIMEOUT = (window.APP_CONSTANTS && APP_CONSTANTS.DOUBLE_KEY_TIMEOUT) || 400

  useEffect(() => {
    const onKey = (e) => {
      const inEditable =
        e.target.tagName === "TEXTAREA" ||
        e.target.tagName === "INPUT" ||
        e.target.isContentEditable

      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault()
        if (selectedId) {
          runCell(selectedId)
          const idx = findIndex(selectedId)
          if (idx === cells.length - 1) insertCell(selectedId, "below", "music")
          else {
            setSelectedId(cells[idx + 1].id)
            setEditingId(null)
            if (e.target.blur) e.target.blur()
          }
        }
        return
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (selectedId) runCell(selectedId)
        return
      }
      if (e.key === "Enter" && e.altKey) {
        e.preventDefault()
        if (selectedId) {
          runCell(selectedId)
          insertCell(selectedId, "below", "music")
        }
        return
      }

      if (inEditable) {
        if (e.key === "Escape") {
          e.preventDefault()
          setEditingId(null)
          if (e.target.blur) e.target.blur()
        }
        return
      }

      if (!selectedId) return
      const idx = findIndex(selectedId)

      if (e.key === "Enter") {
        e.preventDefault()
        setEditingId(selectedId)
        return
      }
      if (e.key === "a" || e.key === "A") {
        e.preventDefault()
        insertCell(selectedId, "above", "music")
        return
      }
      if (e.key === "b" || e.key === "B") {
        e.preventDefault()
        insertCell(selectedId, "below", "music")
        return
      }
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault()
        undoDelete()
        return
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault()
        if (dPressedRef.current) {
          deleteCell(selectedId)
          dPressedRef.current = false
          if (dTimerRef.current) clearTimeout(dTimerRef.current)
        } else {
          dPressedRef.current = true
          dTimerRef.current = setTimeout(() => {
            dPressedRef.current = false
          }, DOUBLE_KEY_TIMEOUT)
        }
        return
      }
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        if (idx < cells.length - 1) setSelectedId(cells[idx + 1].id)
        return
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        if (idx > 0) setSelectedId(cells[idx - 1].id)
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, editingId, cells, runCell, insertCell, deleteCell, undoDelete, findIndex, setSelectedId, setEditingId])
}
```

- [ ] **Step 2: Add script tag to index.html**

Add after `hooks/useCellManager.js`:

```html
<script src="hooks/useKeyboard.js"></script>
```

- [ ] **Step 3: Wire into App**

Replace the entire `useEffect` keyboard handler block (lines ~1815-1919) with:

```javascript
useKeyboard({
  selectedId,
  editingId,
  cells,
  findIndex,
  runCell,
  insertCell,
  deleteCell,
  undoDelete,
  setSelectedId,
  setEditingId,
})
```

- [ ] **Step 4: Verify keyboard shortcuts work**

Test: j/k navigation, Enter to edit, Escape to exit edit, Shift+Enter to run, A/B to insert, DD to delete, Z to undo.

- [ ] **Step 5: Commit**

```bash
git add hooks/useKeyboard.js notebook.jsx index.html
git commit -m "refactor: extract keyboard handling into useKeyboard hook"
```

---

## Task 6: Extract components — ChordDiagram, CodeEditor, MarkdownCell

Move the three simplest self-contained components out of notebook.jsx.

**Files:**
- Create: `components/ChordDiagram.jsx`
- Create: `components/CodeEditor.jsx`
- Create: `components/MarkdownCell.jsx`
- Modify: `notebook.jsx` (remove moved code)
- Modify: `index.html` (add script tags)

- [ ] **Step 1: Create components/ChordDiagram.jsx**

Move the following from notebook.jsx into this file (lines 212-662):
- `getChordIntervals`
- `detectChordQuality`
- `GUITAR_SHAPES`
- `GuitarDiagram`
- `PianoDiagram`
- `ChordDiagram`

All functions are defined at global scope, so they remain accessible. Wrap in a comment header:

```javascript
// components/ChordDiagram.jsx — Guitar and Piano chord diagram SVGs
```

The entire content is the exact code from lines 212-662 of notebook.jsx, unchanged.

- [ ] **Step 2: Create components/CodeEditor.jsx**

Move lines 17-72 from notebook.jsx:

```javascript
// components/CodeEditor.jsx — Syntax-highlighted code editor
```

The `CodeEditor` component with `React.forwardRef`, unchanged.

- [ ] **Step 3: Create components/MarkdownCell.jsx**

Move lines 78-164 from notebook.jsx:

```javascript
// components/MarkdownCell.jsx — Markdown rendering (marked → React)
```

Contains `renderMdInline`, `renderMdBlock`, and `MarkdownContent`, unchanged.

- [ ] **Step 4: Remove moved code from notebook.jsx**

Delete the corresponding sections from notebook.jsx. Keep their usages — they'll be globals loaded from the new files.

- [ ] **Step 5: Add script tags to index.html**

Add before `notebook.jsx`, after hooks:

```html
<script type="text/babel" src="components/ChordDiagram.jsx"></script>
<script type="text/babel" src="components/CodeEditor.jsx"></script>
<script type="text/babel" src="components/MarkdownCell.jsx"></script>
```

- [ ] **Step 6: Verify app renders and all components display correctly**

Test: markdown cells render, code cells have syntax highlighting, chord diagrams appear after running a cell.

- [ ] **Step 7: Commit**

```bash
git add components/ChordDiagram.jsx components/CodeEditor.jsx components/MarkdownCell.jsx notebook.jsx index.html
git commit -m "refactor: extract ChordDiagram, CodeEditor, MarkdownCell into component files"
```

---

## Task 7: Extract components — MusicOutput, Toolbar, StatusBar, Sidebar, Cell, ChordBrowser

Move the remaining components out of notebook.jsx.

**Files:**
- Create: `components/MusicOutput.jsx`
- Create: `components/Toolbar.jsx`
- Create: `components/StatusBar.jsx`
- Create: `components/Sidebar.jsx`
- Create: `components/Cell.jsx`
- Create: `components/ChordBrowser.jsx`
- Modify: `notebook.jsx`
- Modify: `index.html`

- [ ] **Step 1: Create components/MusicOutput.jsx**

Move `themeColors`, `formatTime`, `MusicOutput`, and `prettyBeats` from notebook.jsx. This includes the already-fixed playback integration from Task 3.

- [ ] **Step 2: Create components/Toolbar.jsx**

Move the `Toolbar` function from notebook.jsx (lines ~1190-1289).

- [ ] **Step 3: Create components/StatusBar.jsx**

Extract the status bar JSX from App's render into a component:

```javascript
// components/StatusBar.jsx
function StatusBar({ editingId }) {
  return (
    <footer className="status-bar">
      <span className="sb-item">Composer.nb</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">MusicKernel | Idle</span>
      <span className="sb-sep">|</span>
      <span className="sb-item">Mode: {editingId ? "Edit" : "Command"}</span>
      <span className="sb-spacer" />
      <span className="sb-item sb-dim sb-shortcuts" title="Shift+Enter run · Esc exit edit · A/B insert · DD delete · Z undo">
        Shift+Enter run · Esc exit edit · A/B insert · DD delete · Z undo
      </span>
    </footer>
  )
}
```

- [ ] **Step 4: Create components/Sidebar.jsx**

Move the sidebar/LHS nav from App render:

```javascript
// components/Sidebar.jsx
const SIDE_TABS = [
  { id: "notebook", label: "Notebook", hint: "Cells & playback" },
  { id: "chords", label: "Chord library", hint: "Browse chord shapes" },
]

function Sidebar({ sideTab, onTabChange }) {
  return (
    <aside className="app-lhs" aria-label="Workspace">
      <div className="lhs-brand">
        <span className="lhs-brand-title">Composer</span>
        <span className="lhs-brand-ext">.nb</span>
      </div>
      <nav className="lhs-nav">
        {SIDE_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={"lhs-tab" + (sideTab === tab.id ? " lhs-tab-active" : "")}
            onClick={() => onTabChange(tab.id)}
            title={tab.hint}
          >
            <span className="lhs-tab-label">{tab.label}</span>
            <span className="lhs-tab-hint">{tab.hint}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 5: Create components/Cell.jsx**

Move `CellMenu` and `Cell` from notebook.jsx (lines ~946-1184).

- [ ] **Step 6: Create components/ChordBrowser.jsx**

Move `chordStubFromLabel`, `CHORD_SAMPLE_ESSENTIALS`, `sampleItems`, and `ChordBrowserPanel` from notebook.jsx (lines ~1415-1576).

- [ ] **Step 7: Add script tags to index.html**

Add before `notebook.jsx`, in dependency order:

```html
<script type="text/babel" src="components/MusicOutput.jsx"></script>
<script type="text/babel" src="components/Toolbar.jsx"></script>
<script type="text/babel" src="components/StatusBar.jsx"></script>
<script type="text/babel" src="components/Sidebar.jsx"></script>
<script type="text/babel" src="components/Cell.jsx"></script>
<script type="text/babel" src="components/ChordBrowser.jsx"></script>
```

- [ ] **Step 8: Clean up notebook.jsx**

After extraction, notebook.jsx should contain only:
- `App` function (~300-400 lines)
- `NotebookTweaks` component (small, keep here)
- `ReactDOM.createRoot(...).render(<App />)`

- [ ] **Step 9: Verify the entire app works**

Test all features: run cells, playback, chord library, theme switching, keyboard shortcuts, cell creation/deletion/undo, WAV export, markdown editing.

- [ ] **Step 10: Commit**

```bash
git add components/ notebook.jsx index.html
git commit -m "refactor: extract all components from notebook.jsx into individual files"
```

---

## Task 8: Visual polish — CSS tightening

Apply the hybrid minimal aesthetic: thinner borders, tighter spacing, refined typography.

**Files:**
- Modify: `index.html` (CSS changes)

- [ ] **Step 1: Tighten cell borders and selection**

Replace cell border styles:

```css
.cell {
  display: grid;
  grid-template-columns: 64px 1fr;
  margin: var(--cell-pad-y) 0;
  background: var(--paper);
  border: 1px solid transparent;
  border-radius: 3px;
  position: relative;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.cell:hover {
  border-color: var(--border-soft);
}
.cell-selected {
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: -2px 0 0 0 var(--accent);
}
.cell-editing.cell-selected {
  border-color: color-mix(in srgb, var(--editing-bar) 40%, transparent);
  box-shadow: -2px 0 0 0 var(--editing-bar);
}
.cell-running.cell-selected {
  border-color: color-mix(in srgb, var(--busy-bar) 40%, transparent);
  box-shadow: -2px 0 0 0 var(--busy-bar);
}
```

Key changes: grid column `78px` → `64px`, border-radius `2px` → `3px`, selection bar `3px` → `2px`, softer selection border using `color-mix`.

- [ ] **Step 2: Tighten the gutter/prompt**

```css
.cell-prompt {
  font-family: var(--font-mono);
  color: var(--text-mute);
  font-size: 11px;
  padding: 10px 6px 0 6px;
  text-align: right;
  user-select: none;
  letter-spacing: -0.02em;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
```

Changes: color from `accent-prompt` → `text-mute` (less distracting), font-size `12.5px` → `11px`, padding shrunk.

- [ ] **Step 3: Tighten code editor line height**

```css
.code-hl,
.code-area {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.45;
  padding: var(--code-pad-y) var(--code-pad-x);
  margin: 0;
  border: none;
  white-space: pre-wrap;
  overflow-wrap: normal;
  word-break: normal;
  tab-size: 2;
}
```

Change: line-height `1.55` → `1.45`.

- [ ] **Step 4: Slim down the waveform player**

```css
.music-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px 4px 4px;
}
.music-row-controls {
  padding-top: 6px;
}

.play-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--paper);
  color: var(--accent);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: all 120ms ease;
}
```

Changes: play button `36px` → `30px`, row gap `10px` → `8px`, reduced padding.

- [ ] **Step 5: Compact music meta pills**

```css
.music-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  align-self: center;
}
.meta-pill {
  background: var(--pill-bg);
  color: var(--pill-fg);
  padding: 1px 5px;
  border-radius: 2px;
  letter-spacing: 0.02em;
  display: inline-block;
  font-size: 10px;
}
```

Changes: vertical stack → horizontal wrap, reduced sizes.

- [ ] **Step 6: Reduce toolbar visual weight**

```css
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 12px;
  background: var(--tb-bg);
  border-bottom: 1px solid var(--border-soft);
  position: sticky;
  top: 0;
  z-index: 20;
}
.tb-btn {
  appearance: none;
  background: transparent;
  border: none;
  border-right: 1px solid var(--border-soft);
  color: var(--text-dim);
  padding: 4px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
}
```

Changes: toolbar padding `6px` → `4px`, button height `28px` → `26px`, border uses `border-soft`.

- [ ] **Step 7: Add smooth transitions for theme switching and cell output**

Add to the root styles:

```css
:root {
  /* existing vars... */
  color-scheme: light;
}
[data-theme="dark"] {
  color-scheme: dark;
}

/* Smooth theme transition */
html {
  transition: background-color 200ms ease, color 200ms ease;
}

/* Cell output fade-in */
.cell-output {
  display: grid;
  grid-template-columns: 62px 1fr;
  margin-top: 4px;
  animation: fadeIn 200ms ease;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Out prompt — muted */
.out-prompt {
  font-family: var(--font-mono);
  color: var(--text-mute);
  font-size: 11px;
  text-align: right;
  padding: 8px 6px 0 0;
  user-select: none;
}
```

- [ ] **Step 8: Compact chord strip**

```css
.chord-strip {
  display: flex;
  gap: 3px;
  padding: 4px 4px 0 4px;
  flex-wrap: wrap;
}
.chord-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  background: var(--pill-bg);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 10px;
  min-width: 100px;
  border-top: 2px solid transparent;
  position: relative;
  align-items: center;
}
.chord-label {
  font-weight: 600;
  color: var(--text);
  font-size: 11px;
  align-self: flex-start;
}
.chord-notes {
  color: var(--text-mute);
  font-size: 9px;
  letter-spacing: -0.02em;
  word-break: break-all;
  align-self: flex-start;
}
```

- [ ] **Step 9: Reduce chord diagram sizes**

Scale diagrams down ~40% via CSS transform:

```css
.chord-diagram-guitar {
  transform: scale(0.7);
  transform-origin: top center;
  margin-bottom: -20px;
}
.chord-diagram-piano {
  transform: scale(0.65);
  transform-origin: top center;
  margin-bottom: -14px;
}
```

The negative margin-bottom compensates for the space the original element reserves. This avoids touching the SVG viewBox calculations.

- [ ] **Step 10: Verify visual changes across all three themes**

Check light, dark, and retro themes. Verify nothing is broken, spacing looks intentional, and the app feels cleaner.

- [ ] **Step 11: Commit**

```bash
git add index.html
git commit -m "style: visual polish — tighter spacing, thinner borders, minimal aesthetic"
```

---

## Task 9: Visual polish — StatusBar keyboard hints as tooltip

**Files:**
- Modify: `index.html` (CSS)
- Modify: `components/StatusBar.jsx` (if already extracted, else `notebook.jsx`)

- [ ] **Step 1: Update StatusBar to use tooltip for shortcuts**

The shortcuts text gets a `title` attribute (already added in Task 7 extraction). Now hide the text by default and show on hover of the status bar:

```css
.sb-shortcuts {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-width 200ms ease, opacity 200ms ease;
  white-space: nowrap;
}
.status-bar:hover .sb-shortcuts {
  max-width: 500px;
  opacity: 1;
}
```

- [ ] **Step 2: Verify the shortcuts appear on status bar hover**

Hover over the status bar — shortcut hints should slide in. Moving away should hide them.

- [ ] **Step 3: Commit**

```bash
git add index.html components/StatusBar.jsx
git commit -m "style: hide keyboard shortcuts in status bar, show on hover"
```

---

## Task 10: Workflow friction — cell run feedback

Add a visual pulse animation to the cell while it's rendering (currently the UI just freezes).

**Files:**
- Modify: `index.html` (CSS)

- [ ] **Step 1: Add running cell animation**

```css
.cell-running .code-input {
  position: relative;
}
.cell-running .code-input::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: renderPulse 1.2s ease-in-out infinite;
}
@keyframes renderPulse {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

This adds a subtle scanning line across the top of the code input while the cell renders.

- [ ] **Step 2: Verify the animation appears during cell rendering**

Run a cell — the code editor should show a subtle animated bar while rendering is in progress.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style: add render progress indicator for running cells"
```

---

## Task 11: Final cleanup and verification

Do a full sweep: remove dead code, verify all features work end-to-end.

**Files:**
- Modify: `notebook.jsx` (remove any remaining dead code)
- Modify: `index.html` (verify script order)

- [ ] **Step 1: Remove dead code from notebook.jsx**

Check for:
- Unused imports/variables
- The old `STARTER` array (should be in constants.js now)
- Old `_cid`/`cellId` (should be in useCellManager now)
- Old `TWEAK_DEFAULTS`, `ACCENT_OPTIONS`, `MONO_FONTS` (should use `APP_CONSTANTS`)
- The dead edit mode protocol references (`__activate_edit_mode`, etc.) — leave in tweaks-panel.jsx as that file isn't being modified
- Any `playingId` references that should now be `focusedCellId`

- [ ] **Step 2: Verify final script load order in index.html**

The order should be:

```html
<!-- CDN libs (React, Tone, WaveSurfer, Tonal, Marked, Babel) -->
<script src="music-engine.js"></script>
<script src="chord-lookup.js"></script>
<script src="highlight.js"></script>
<script src="shared/constants.js"></script>
<script src="hooks/usePlayback.js"></script>
<script src="hooks/useCellManager.js"></script>
<script src="hooks/useKeyboard.js"></script>
<script type="text/babel" src="tweaks-panel.jsx"></script>
<script type="text/babel" src="components/ChordDiagram.jsx"></script>
<script type="text/babel" src="components/CodeEditor.jsx"></script>
<script type="text/babel" src="components/MarkdownCell.jsx"></script>
<script type="text/babel" src="components/MusicOutput.jsx"></script>
<script type="text/babel" src="components/Toolbar.jsx"></script>
<script type="text/babel" src="components/StatusBar.jsx"></script>
<script type="text/babel" src="components/Sidebar.jsx"></script>
<script type="text/babel" src="components/Cell.jsx"></script>
<script type="text/babel" src="components/ChordBrowser.jsx"></script>
<script type="text/babel" src="notebook.jsx"></script>
```

- [ ] **Step 3: Full end-to-end test**

Test every feature:
1. App loads without console errors
2. Markdown cells render and are editable
3. Code cells have syntax highlighting
4. Run cell → waveform appears with chord strip and diagrams
5. Play/pause/resume works correctly
6. Playing one cell stops the other
7. Re-running a cell while playing works cleanly
8. Let playback finish → returns to idle
9. WAV export downloads a file
10. Chord library loads and search works
11. Theme switching (light/dark/retro) transitions smoothly
12. Keyboard shortcuts: j/k nav, Enter edit, Escape exit, Shift+Enter run, A/B insert, DD delete, Z undo
13. Status bar shows shortcuts on hover
14. Running cell shows progress indicator
15. All three themes look correct with new visual polish

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final cleanup — remove dead code, verify script load order"
```
