/**
 * Audio playback utilities
 *
 * Manages a single Audio element that can be stopped instantly on
 * interruption. Every played chunk carries a `generation` tag so
 * we can refuse to play stale audio if it arrives late.
 */

import { DEBUG } from './constants';

function log(...args) {
  if (DEBUG) console.log('[audio]', ...args);
}

export class AudioPlaybackManager {
  constructor() {
    this.audioEl = null;
    this.currentUrl = null;
    this.currentGeneration = null;
    this.currentMessageId = null;
    this.isPlaying = false;
    this.playedDurationMs = 0;
    this.playStartTime = null;
    this.listeners = new Set();
    this._boundHandleEnded = this._handleEnded.bind(this);
    this._boundHandleError = this._handleError.bind(this);
    this._boundHandlePlay = this._handlePlay.bind(this);
    this._boundHandlePause = this._handlePause.bind(this);
  }

  _ensureElement() {
    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.preload = 'auto';
      this.audioEl.addEventListener('ended', this._boundHandleEnded);
      this.audioEl.addEventListener('error', this._boundHandleError);
      this.audioEl.addEventListener('play', this._boundHandlePlay);
      this.audioEl.addEventListener('pause', this._boundHandlePause);
    }
    return this.audioEl;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(event) {
    for (const fn of this.listeners) {
      try { fn(event); } catch (e) { console.error('audio listener error', e); }
    }
  }

  _handleEnded() {
    log('ended');
    this.isPlaying = false;
    if (this.playStartTime) {
      this.playedDurationMs += Date.now() - this.playStartTime;
      this.playStartTime = null;
    }
    this._emit({ type: 'ended', generation: this.currentGeneration, messageId: this.currentMessageId, playedDurationMs: this.playedDurationMs });
    this._cleanup();
  }

  _handleError(e) {
    log('error', e);
    this.isPlaying = false;
    this._emit({ type: 'error', error: e?.message || 'audio error', generation: this.currentGeneration });
    this._cleanup();
  }

  _handlePlay() {
    this.isPlaying = true;
    this.playStartTime = Date.now();
    this._emit({ type: 'play', generation: this.currentGeneration, messageId: this.currentMessageId });
  }

  _handlePause() {
    if (this.playStartTime) {
      this.playedDurationMs += Date.now() - this.playStartTime;
      this.playStartTime = null;
    }
    this._emit({ type: 'pause', generation: this.currentGeneration, messageId: this.currentMessageId, playedDurationMs: this.playedDurationMs });
  }

  _cleanup() {
    if (this.currentUrl) {
      try { URL.revokeObjectURL(this.currentUrl); } catch {}
      this.currentUrl = null;
    }
    this.currentGeneration = null;
    this.currentMessageId = null;
    this.playedDurationMs = 0;
    this.playStartTime = null;
  }

  /**
   * Play a base64-encoded audio chunk.
   * @param {object} params
   * @param {string} params.base64 - Base64-encoded audio
   * @param {string} params.mimeType - MIME type (e.g. "audio/mpeg")
   * @param {number} params.generation - Generation ID for stale checking
   * @param {string} params.messageId - Message ID (for tracking)
   * @param {function} params.isStale - Callback returning true if generation is stale
   * @returns {Promise<{playedDurationMs: number, stopped: boolean}>}
   */
  async play({ base64, mimeType = 'audio/mpeg', generation, messageId, isStale }) {
    // STALE CHECK before we even build the audio element
    if (isStale && isStale(generation)) {
      log('play blocked — stale generation', generation);
      return { playedDurationMs: 0, stopped: true, blockedAsStale: true };
    }

    // Stop anything currently playing
    this.stop();

    const el = this._ensureElement();
    const blob = base64ToBlob(base64, mimeType);
    const url = URL.createObjectURL(blob);

    this.currentUrl = url;
    this.currentGeneration = generation;
    this.currentMessageId = messageId;
    this.playedDurationMs = 0;
    el.src = url;

    try {
      // FINAL STALE CHECK before actually playing
      if (isStale && isStale(generation)) {
        log('play blocked at final check — stale');
        this._cleanup();
        return { playedDurationMs: 0, stopped: true, blockedAsStale: true };
      }
      await el.play();
    } catch (err) {
      log('play() rejected', err?.message);
      this._cleanup();
      throw err;
    }

    // Wait for playback to finish (or be stopped)
    return await new Promise((resolve) => {
      const onFinish = (event) => {
        if (event.type === 'ended' || event.type === 'pause' || event.type === 'error') {
          this.listeners.delete(onFinish);
          resolve({
            playedDurationMs: event.playedDurationMs || this.playedDurationMs,
            stopped: event.type !== 'ended',
          });
        }
      };
      this.listeners.add(onFinish);
    });
  }

  /**
   * Stop currently playing audio IMMEDIATELY.
   * Returns the number of ms it took (for latency measurement).
   */
  stop() {
    if (!this.audioEl) return 0;
    const start = performance.now();

    try {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
      this.audioEl.removeAttribute('src');
      this.audioEl.load(); // release the audio resource
    } catch (err) {
      log('stop error', err?.message);
    }

    const latency = performance.now() - start;
    if (this.playStartTime) {
      this.playedDurationMs += Date.now() - this.playStartTime;
      this.playStartTime = null;
    }
    this.isPlaying = false;
    log('stop', { latencyMs: latency, playedDurationMs: this.playedDurationMs });
    this._emit({ type: 'stopped', generation: this.currentGeneration, playedDurationMs: this.playedDurationMs, latencyMs: latency });

    this._cleanup();
    return latency;
  }

  /**
   * Destroy the audio manager entirely.
   */
  destroy() {
    this.stop();
    if (this.audioEl) {
      this.audioEl.removeEventListener('ended', this._boundHandleEnded);
      this.audioEl.removeEventListener('error', this._boundHandleError);
      this.audioEl.removeEventListener('play', this._boundHandlePlay);
      this.audioEl.removeEventListener('pause', this._boundHandlePause);
      this.audioEl = null;
    }
    this.listeners.clear();
  }
}

/**
 * Fallback TTS using browser SpeechSynthesis API.
 * Only used if Rime is unavailable.
 */
export class FallbackTTS {
  constructor() {
    this.utterance = null;
  }

  isAvailable() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  speak(text) {
    if (!this.isAvailable()) return Promise.reject(new Error('SpeechSynthesis unavailable'));
    return new Promise((resolve, reject) => {
      this.stop();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.onend = () => resolve();
      u.onerror = (e) => reject(new Error(e?.error || 'speech error'));
      this.utterance = u;
      window.speechSynthesis.speak(u);
    });
  }

  stop() {
    if (this.isAvailable()) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    this.utterance = null;
  }
}

/**
 * Convert base64 string to Blob.
 */
function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}