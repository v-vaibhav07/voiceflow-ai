/**
 * Voice Activity Detection (VAD) via Web Audio API
 *
 * Computes RMS energy from a live microphone stream and fires
 * callbacks when speech starts or stops. This is ~5-10× faster
 * than waiting for SpeechRecognition.onresult because it works
 * directly on raw audio frames (~20ms latency per frame).
 *
 * Usage:
 *   const vad = new VoiceActivityDetector({ onSpeechStart, onSpeechEnd });
 *   await vad.start(stream);   // stream from getUserMedia
 *   vad.stop();
 */

export class VoiceActivityDetector {
  /**
   * @param {object} options
   * @param {function} options.onSpeechStart  - Called when speech is detected
   * @param {function} options.onSpeechEnd    - Called when speech ends
   * @param {number}   options.threshold      - RMS energy threshold (0-1). Default 0.015
   * @param {number}   options.speechFrames   - Consecutive frames above threshold to confirm speech. Default 3
   * @param {number}   options.silenceFrames  - Consecutive frames below threshold to confirm silence. Default 15
   * @param {number}   options.fftSize        - AnalyserNode FFT size. Default 512
   * @param {function} options.onEnergy       - Optional callback for real-time energy values (for UI)
   */
  constructor(options = {}) {
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onEnergy = options.onEnergy || null;

    this.threshold = options.threshold ?? 0.015;
    this.speechFramesRequired = options.speechFrames ?? 3;
    this.silenceFramesRequired = options.silenceFrames ?? 15;
    this.fftSize = options.fftSize ?? 512;

    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.processor = null;
    this.stream = null;

    this.isSpeaking = false;
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.running = false;
    this._animFrameId = null;
    this._dataArray = null;
  }

  /**
   * Start VAD on an existing MediaStream.
   * The stream should already have an audio track (from getUserMedia).
   */
  async start(stream) {
    if (this.running) return;

    this.stream = stream;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000, // 16kHz is optimal for speech
    });

    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0.3;

    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);

    this._dataArray = new Float32Array(this.analyser.fftSize);
    this.running = true;
    this.isSpeaking = false;
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;

    this._tick();
  }

  /**
   * Stop VAD and release audio resources.
   * Does NOT stop the underlying MediaStream (caller manages that).
   */
  stop() {
    this.running = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }
    if (this.analyser) {
      this.analyser = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this._dataArray = null;
  }

  /**
   * Update threshold at runtime (e.g., from a sensitivity slider).
   */
  setThreshold(value) {
    this.threshold = Math.max(0.001, Math.min(1, value));
  }

  /**
   * Get current RMS energy (0-1). Useful for UI meters.
   */
  getCurrentEnergy() {
    if (!this.analyser || !this._dataArray) return 0;
    this.analyser.getFloatTimeDomainData(this._dataArray);
    return this._computeRMS(this._dataArray);
  }

  // ─── Internal ───

  _tick() {
    if (!this.running) return;

    const energy = this.getCurrentEnergy();

    if (this.onEnergy) {
      this.onEnergy(energy);
    }

    if (energy > this.threshold) {
      this.silenceFrameCount = 0;
      this.speechFrameCount++;

      if (!this.isSpeaking && this.speechFrameCount >= this.speechFramesRequired) {
        this.isSpeaking = true;
        this.onSpeechStart({ energy, timestamp: performance.now() });
      }
    } else {
      this.speechFrameCount = 0;
      this.silenceFrameCount++;

      if (this.isSpeaking && this.silenceFrameCount >= this.silenceFramesRequired) {
        this.isSpeaking = false;
        this.onSpeechEnd({ energy, timestamp: performance.now() });
      }
    }

    // ~60fps check rate (every animation frame ≈ 16ms)
    this._animFrameId = requestAnimationFrame(() => this._tick());
  }

  _computeRMS(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }
}

/**
 * Preset sensitivity profiles.
 */
export const VAD_PRESETS = {
  low: { threshold: 0.03, speechFrames: 5, silenceFrames: 25, label: 'Low (quiet environments)' },
  medium: { threshold: 0.015, speechFrames: 3, silenceFrames: 15, label: 'Medium (default)' },
  high: { threshold: 0.008, speechFrames: 2, silenceFrames: 10, label: 'High (noisy environments)' },
};

export default VoiceActivityDetector;