/**
 * useVAD — React hook for Voice Activity Detection
 *
 * Wraps VoiceActivityDetector and shares a single getUserMedia stream
 * with the server-side STT (audioCapture). This avoids requesting
 * mic permission twice.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceActivityDetector, VAD_PRESETS } from '../utils/vad';
import { DEBUG } from '../utils/constants';

function log(...args) {
  if (DEBUG) console.log('[vad]', ...args);
}

export function useVAD({
  stream = null,          // Shared MediaStream (from useAudioCapture)
  enabled = false,        // Only run VAD when AI is speaking
  sensitivity = 'medium', // 'low' | 'medium' | 'high'
  onSpeechStart = null,
  onSpeechEnd = null,
} = {}) {
  const vadRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [energy, setEnergy] = useState(0);

  // Stable callback refs to avoid re-creating VAD on every render
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;

  useEffect(() => {
    if (!stream || !enabled) {
      if (vadRef.current) {
        vadRef.current.stop();
        vadRef.current = null;
        setIsSpeaking(false);
      }
      return;
    }

    const preset = VAD_PRESETS[sensitivity] || VAD_PRESETS.medium;

    const vad = new VoiceActivityDetector({
      ...preset,
      onSpeechStart: (info) => {
        log('speech start', info);
        setIsSpeaking(true);
        onSpeechStartRef.current?.(info);
      },
      onSpeechEnd: (info) => {
        log('speech end', info);
        setIsSpeaking(false);
        onSpeechEndRef.current?.(info);
      },
      onEnergy: (e) => setEnergy(e),
    });

    vad.start(stream).catch((err) => {
      console.error('VAD start failed:', err);
    });

    vadRef.current = vad;

    return () => {
      vad.stop();
      vadRef.current = null;
      setIsSpeaking(false);
    };
  }, [stream, enabled, sensitivity]);

  const setThreshold = useCallback((value) => {
    vadRef.current?.setThreshold(value);
  }, []);

  return {
    isSpeaking,
    energy,
    setThreshold,
    isActive: !!vadRef.current,
  };
}

export default useVAD;