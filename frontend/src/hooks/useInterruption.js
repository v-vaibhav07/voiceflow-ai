/**
 * useInterruption hook
 *
 * Provides the timing primitives used by the voice engine to
 * measure interruption detection latency and audio stop latency.
 *
 * The hook itself does NOT decide when to interrupt — that
 * decision lives in useVoice, which combines speech events and
 * audio playback state. This hook is purely a stopwatch + record.
 */

import { useCallback, useRef, useState } from 'react';

export function useInterruption() {
  const [history, setHistory] = useState([]);
  const currentRef = useRef(null); // { detectedAt, audioStoppedAt, oldGeneration, ... }

  const markDetected = useCallback((meta = {}) => {
    currentRef.current = {
      detectedAt: performance.now(),
      audioStoppedAt: null,
      newAudioAt: null,
      ...meta,
    };
    return currentRef.current;
  }, []);

  const markAudioStopped = useCallback(() => {
    const cur = currentRef.current;
    if (!cur) return null;
    cur.audioStoppedAt = performance.now();
    cur.audioStopLatencyMs = Math.max(0, cur.audioStoppedAt - cur.detectedAt);
    return cur;
  }, []);

  const markRecovered = useCallback((extra = {}) => {
    const cur = currentRef.current;
    if (!cur) return null;
    cur.newAudioAt = performance.now();
    cur.recoveryLatencyMs = Math.max(0, cur.newAudioAt - cur.detectedAt);
    Object.assign(cur, extra);
    setHistory((prev) => [...prev, { ...cur, id: prev.length + 1 }]);
    const finished = cur;
    currentRef.current = null;
    return finished;
  }, []);

  const current = () => currentRef.current;

  const reset = useCallback(() => {
    currentRef.current = null;
    setHistory([]);
  }, []);

  return {
    markDetected,
    markAudioStopped,
    markRecovered,
    current,
    history,
    reset,
  };
}