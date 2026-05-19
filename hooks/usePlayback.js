/* usePlayback hook — playback state machine
   Fixes 4 bugs in the current playback system:
   1. Can't resume from pause — clicking pause calls onPlaybackEnd, clearing playingId
   2. Race condition on re-run — WaveSurfer cleanup fires onPlaybackEnd after new instance
   3. Silent play failures — ws.play().catch(() => {}) swallows errors
   4. Player ref deleted while playing — cleanup removes player ref without stopping

   State machine:
   IDLE ──[play]──> PLAYING
   PLAYING ──[pause]──> PAUSED  (focusedCellId kept)
   PAUSED ──[play same]──> PLAYING  (resume)
   PAUSED ──[play other]──> PLAYING (new cell)
   PLAYING ──[finish]──> IDLE
   PLAYING/PAUSED ──[stop]──> IDLE
*/

window.usePlayback = function usePlayback(armAudio) {
  const { useState, useRef, useCallback } = React

  // State: split single playingId into two values
  const [focusedCellId, setFocusedCellId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // Refs
  const playersRef = useRef({})

  // Register a player API for a cell
  const registerPlayer = useCallback((cellId, playerApi) => {
    playersRef.current[cellId] = playerApi
  }, [])

  // Unregister a player API
  const unregisterPlayer = useCallback((cellId) => {
    delete playersRef.current[cellId]
  }, [])

  // Play a specific cell (stops previous if different)
  const playCell = useCallback(async (id) => {
    await armAudio()

    // Stop different cell if playing
    if (focusedCellId && focusedCellId !== id) {
      const prevPlayer = playersRef.current[focusedCellId]
      if (prevPlayer) prevPlayer.stop()
    }

    setFocusedCellId(id)
    setIsPlaying(true)
  }, [armAudio, focusedCellId])

  // Pause the focused cell
  const pauseCell = useCallback(() => {
    setIsPlaying(false)
  }, [])

  // Smart toggle: play/pause/switch
  const togglePlayback = useCallback(async (id) => {
    await armAudio()

    if (focusedCellId === id) {
      // Same cell: toggle play/pause
      setIsPlaying((prev) => !prev)
    } else {
      // Different cell: stop previous, play new
      if (focusedCellId && playersRef.current[focusedCellId]) {
        playersRef.current[focusedCellId].stop()
      }
      setFocusedCellId(id)
      setIsPlaying(true)
    }
  }, [armAudio, focusedCellId])

  // Stop a specific cell and clear focus if it matches
  const stopCell = useCallback((id) => {
    const player = playersRef.current[id]
    if (player) player.stop()

    setFocusedCellId((cur) => {
      if (cur === id) {
        setIsPlaying(false)
        return null
      }
      return cur
    })
  }, [])

  // Stop all playback
  const stopAll = useCallback(() => {
    if (focusedCellId && playersRef.current[focusedCellId]) {
      playersRef.current[focusedCellId].stop()
    }
    setFocusedCellId(null)
    setIsPlaying(false)
  }, [focusedCellId])

  // Called when WaveSurfer reaches end
  const onPlaybackFinished = useCallback((id) => {
    setFocusedCellId((cur) => {
      if (cur === id) {
        setIsPlaying(false)
        return null
      }
      return cur
    })
  }, [])

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
