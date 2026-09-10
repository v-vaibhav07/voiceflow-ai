/**
 * Audio Capture Utility
 *
 * Manages a single getUserMedia stream that is shared between:
 *   1. VAD (Voice Activity Detection)
 *   2. Server-side STT (streaming PCM to backend via WebSocket)
 *   3. Browser SpeechRecognition (as fallback)
 *
 * This avoids requesting mic permission multiple times and ensures
 * all audio features use the same stream.
 */

import { DEBUG } from './constants';

function log(...args) {
  if (DEBUG) console.log('[audioCapture]', ...args);
}

export class AudioCapture {
  constructor() {
    this.stream = null;
    this.audioContext = null;
    this.processor = null;
    this.source = null;
    this.isCapturing = false;

    // Callbacks
    this.onAudioChunk = null; // (pcmBuffer: Int16Array) => void
    this.onStreamReady = null; // (stream: MediaStream) => void

    // Config
    this.sampleRate = 16000; // 16kHz for Deepgram/Whisper
    this.bufferSize = 4096;  // ~256ms at 16kHz
  }

  /**
   * Request mic access and start capturing audio.
   * Returns the MediaStream for sharing with VAD.
   */
  async start({ onAudioChunk, onStreamReady } = {}) {
    if (this.isCapturing) return this.stream;

    this.onAudioChunk = onAudioChunk || this.onAudioChunk;
    this.onStreamReady = onStreamReady || this.onStreamReady;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: this.sampleRate },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      log('mic stream acquired', this.stream.getAudioTracks()[0]?.getSettings());

      // Set up audio processing for PCM extraction
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate,
      });

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.source = this.audioContext.createMediaStreamSource(this.stream);

      // Use ScriptProcessorNode for PCM extraction
      // (AudioWorklet would be better but ScriptProcessor is simpler and widely supported)
      this.processor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);

      this.processor.onaudioprocess = (event) => {
        if (!this.isCapturing || !this.onAudioChunk) return;

        const float32 = event.inputBuffer.getChannelData(0);
        const int16 = this._float32ToInt16(float32);
        this.onAudioChunk(int16);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.isCapturing = true;
      this.onStreamReady?.(this.stream);

      return this.stream;
    } catch (err) {
      console.error('AudioCapture: failed to start', err);
      throw err;
    }
  }

  /**
   * Stop capturing and release all audio resources.
   */
  stop() {
    this.isCapturing = false;

    if (this.processor) {
      try { this.processor.disconnect(); } catch {}
      this.processor = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Stop all tracks on the stream
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    log('stopped');
  }

  /**
   * Get the current MediaStream (for sharing with VAD).
   */
  getStream() {
    return this.stream;
  }

  /**
   * Convert Float32Array (-1 to 1) to Int16Array (-32768 to 32767).
   * This is the format Deepgram and most STT APIs expect.
   */
  _float32ToInt16(float32) {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }
}

export default AudioCapture;