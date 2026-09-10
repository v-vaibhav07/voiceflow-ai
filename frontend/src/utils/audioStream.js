/**
 * Chunked Audio Playback Manager
 *
 * Plays a sequence of audio chunks (sentences) seamlessly.
 * Each chunk arrives over WebSocket as a separate base64 payload.
 * The first chunk starts playing immediately; subsequent chunks
 * are queued and played in order.
 *
 * This dramatically reduces perceived time-to-first-audio because
 * the user hears the first sentence while the rest are still
 * being synthesized by Rime.
 */

import { DEBUG } from './constants';

function log(...args) {
  if (DEBUG) console.log('[audioStream]', ...args);
}

export class ChunkedAudioPlayer {
  constructor() {
    this.queue = [];           // { base64, mimeType, seq, generation, messageId }
    this.currentAudio = null;  // HTMLAudioElement
    this.currentUrl = null;
    this.isPlaying = false;
    this.currentGeneration = null;
    this.expectedSeq = 0;
    this.isComplete = false;   // Server says no more chunks
    this.listeners = new Set();
    this._resolveWait = null;

    this._boundEnded = this._onChunkEnded.bind(this);
    this._boundError = this._onChunkError.bind(this);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(event) {
    for (const fn of this.listeners) {
      try { fn(event); } catch (e) { console.error('chunk listener error', e); }
    }
  }

  /**
   * Add a chunk to the playback queue.
   * If nothing is currently playing, start immediately.
   */
  enqueue({ base64, mimeType = 'audio/mpeg', seq = 0, generation, messageId, isLast = false }) {
    // Stale check
    if (this.currentGeneration != null && generation < this.currentGeneration) {
      log('chunk discarded — stale generation', { seq, generation, current: this.currentGeneration });
      return;
    }

    this.currentGeneration = generation;

    if (isLast) {
      this.isComplete = true;
      log('last chunk received', { seq });
    }

    this.queue.push({ base64, mimeType, seq, generation, messageId });
    // Sort by sequence number in case of out-of-order delivery
    this.queue.sort((a, b) => a.seq - b.seq);

    log('chunk enqueued', { seq, queueLength: this.queue.length, isPlaying: this.isPlaying });

    if (!this.isPlaying) {
      this._playNext();
    }
  }

  /**
   * Play the next chunk in the queue.
   */
  async _playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      if (this.isComplete) {
        this._emit({ type: 'all_complete', generation: this.currentGeneration });
      } else {
        this._emit({ type: 'queue_empty', generation: this.currentGeneration });
      }
      return;
    }

    const chunk = this.queue.shift();
    this.isPlaying = true;
    this.expectedSeq = chunk.seq + 1;

    // Stale check right before playing
    if (this.currentGeneration != null && chunk.generation < this.currentGeneration) {
      log('chunk skipped at play time — stale', chunk.seq);
      this._playNext();
      return;
    }

    this._cleanupAudio();

    const blob = this._base64ToBlob(chunk.base64, chunk.mimeType);
    const url = URL.createObjectURL(blob);
    this.currentUrl = url;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    audio.addEventListener('ended', this._boundEnded);
    audio.addEventListener('error', this._boundError);
    this.currentAudio = audio;

    this._emit({
      type: 'chunk_start',
      seq: chunk.seq,
      generation: chunk.generation,
      messageId: chunk.messageId,
    });

    try {
      await audio.play();
    } catch (err) {
      log('play() rejected', err?.message);
      this._onChunkError(err);
    }
  }

  _onChunkEnded() {
    log('chunk ended', this.expectedSeq - 1);
    this._emit({
      type: 'chunk_end',
      seq: this.expectedSeq - 1,
      generation: this.currentGeneration,
    });
    this._playNext();
  }

  _onChunkError(err) {
    log('chunk error', err?.message || err);
    this._emit({
      type: 'chunk_error',
      error: err?.message || 'audio error',
      generation: this.currentGeneration,
    });
    // Try to continue with next chunk
    this._playNext();
  }

  /**
   * Stop all playback and clear the queue immediately.
   * Returns stop latency in ms.
   */
  stop() {
    const start = performance.now();

    this._cleanupAudio();
    this.queue = [];
    this.isPlaying = false;
    this.isComplete = false;
    this.expectedSeq = 0;
    this.currentGeneration = null;

    const latency = performance.now() - start;
    log('stopped', { latencyMs: latency });
    this._emit({ type: 'stopped', latencyMs: latency });
    return latency;
  }

  /**
   * Reset for a new generation (called on interruption).
   */
  resetForGeneration(generation) {
    this.stop();
    this.currentGeneration = generation;
  }

  _cleanupAudio() {
    if (this.currentAudio) {
      this.currentAudio.removeEventListener('ended', this._boundEnded);
      this.currentAudio.removeEventListener('error', this._boundError);
      try {
        this.currentAudio.pause();
        this.currentAudio.removeAttribute('src');
        this.currentAudio.load();
      } catch {}
      this.currentAudio = null;
    }
    if (this.currentUrl) {
      try { URL.revokeObjectURL(this.currentUrl); } catch {}
      this.currentUrl = null;
    }
  }

  destroy() {
    this.stop();
    this.listeners.clear();
  }

  _base64ToBlob(base64, mimeType) {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }
}

export default ChunkedAudioPlayer;