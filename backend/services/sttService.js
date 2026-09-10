/**
 * Server-Side Speech-to-Text Service
 *
 * Primary: Deepgram (streaming, low latency, high accuracy)
 * Fallback: OpenAI Whisper (batch, higher latency)
 *
 * When Deepgram is configured, the frontend streams raw PCM audio
 * over WebSocket and this service pipes it to Deepgram's streaming
 * API, returning interim and final transcripts in real time.
 *
 * When Deepgram is NOT configured, the system falls back to
 * browser-based SpeechRecognition (no server STT needed).
 */

const https = require('https');
const http = require('http');
const logger = require('../utils/logger');

class STTService {
  constructor(config) {
    this.config = config;
    this.log = logger.child({ service: 'stt' });
    this.deepgramKey = config.deepgram?.apiKey || process.env.DEEPGRAM_API_KEY;
    this.isConfigured = !!this.deepgramKey;

    if (this.isConfigured) {
      this.log.info('Deepgram STT configured');
    } else {
      this.log.info('Deepgram not configured — server STT disabled, using browser fallback');
    }
  }

  /**
   * Check if server-side STT is available.
   */
  isAvailable() {
    return this.isConfigured;
  }

  /**
   * Create a streaming STT session.
   * Returns an object with methods to feed audio and receive transcripts.
   *
   * @param {object} options
   * @param {function} options.onTranscript - Called with { text, isFinal, confidence }
   * @param {function} options.onError      - Called on errors
   * @param {function} options.onClose      - Called when session ends
   * @param {string}   options.language     - Language code (default: 'en-US')
   * @param {AbortSignal} options.signal    - For cancellation
   */
  createStreamingSession(options = {}) {
    if (!this.isConfigured) {
      throw new Error('Server STT not configured. Set DEEPGRAM_API_KEY.');
    }

    const {
      onTranscript = () => {},
      onError = () => {},
      onClose = () => {},
      language = 'en-US',
      signal = null,
    } = options;

    // Deepgram streaming WebSocket URL
    const params = new URLSearchParams({
      model: 'nova-2',
      language,
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      endpointing: '300', // 300ms silence = end of utterance
      utterance_end_ms: '1000',
    });

    const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    let dgWs = null;
    let isClosed = false;

    const close = (reason = 'client') => {
      if (isClosed) return;
      isClosed = true;
      if (dgWs) {
        try {
          dgWs.send(JSON.stringify({ type: 'CloseStream' }));
          dgWs.close();
        } catch {}
        dgWs = null;
      }
      this.log.info('STT session closed', { reason });
      onClose(reason);
    };

    try {
      // Use the 'ws' package (already a dependency)
      const WebSocket = require('ws');
      dgWs = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Token ${this.deepgramKey}`,
        },
      });

      dgWs.on('open', () => {
        this.log.info('Deepgram streaming session opened');
      });

      dgWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
            const alt = msg.channel.alternatives[0];
            const text = alt.transcript?.trim();
            if (text) {
              onTranscript({
                text,
                isFinal: msg.is_final === true || msg.speech_final === true,
                confidence: alt.confidence || 0,
                words: alt.words || [],
              });
            }
          }

          if (msg.type === 'UtteranceEnd') {
            this.log.debug('Deepgram utterance end');
          }

          if (msg.type === 'Metadata') {
            this.log.debug('Deepgram metadata', {
              channels: msg.channels,
              model: msg.model_uuid,
            });
          }
        } catch (err) {
          this.log.error('Failed to parse Deepgram message', { error: err.message });
        }
      });

      dgWs.on('error', (err) => {
        this.log.error('Deepgram WebSocket error', { error: err.message });
        onError(err);
      });

      dgWs.on('close', (code, reason) => {
        this.log.info('Deepgram WebSocket closed', { code, reason: reason?.toString() });
        close('server');
      });

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => close('aborted'), { once: true });
      }
    } catch (err) {
      this.log.error('Failed to create Deepgram session', { error: err.message });
      onError(err);
      return { feedAudio: () => {}, close: () => {} };
    }

    return {
      /**
       * Feed a PCM Int16 audio chunk to the STT engine.
       * @param {Buffer|Int16Array} pcmData
       */
      feedAudio: (pcmData) => {
        if (isClosed || !dgWs || dgWs.readyState !== 1) return;
        try {
          const buffer = Buffer.isBuffer(pcmData) ? pcmData : Buffer.from(pcmData.buffer);
          dgWs.send(buffer);
        } catch (err) {
          this.log.error('Failed to send audio to Deepgram', { error: err.message });
        }
      },

      /**
       * Close the STT session.
       */
      close,

      /**
       * Check if the session is active.
       */
      get isActive() {
        return !isClosed && dgWs?.readyState === 1;
      },
    };
  }

  /**
   * Batch transcription via OpenAI Whisper (fallback).
   * Not streaming — receives complete audio, returns final text.
   *
   * @param {Buffer} audioBuffer - Complete audio buffer (WAV/MP3)
   * @param {string} format - Audio format
   */
  async transcribeBatch(audioBuffer, format = 'wav') {
    const openaiKey = this.config.openai?.apiKey;
    if (!openaiKey) throw new Error('OpenAI API key required for Whisper fallback');

    const FormData = require('form-data') || null;

    // For simplicity, use axios with multipart form
    const axios = require('axios');
    const form = new (require('form-data') || Object)();

    // This is a simplified implementation — in production you'd
    // construct the multipart form properly
    this.log.warn('Batch Whisper transcription not fully implemented — use Deepgram streaming');
    throw new Error('Use Deepgram streaming STT instead');
  }
}

module.exports = { STTService };