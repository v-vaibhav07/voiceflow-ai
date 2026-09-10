// /**
//  * Rime TTS Service
//  *
//  * Primary spoken output for VoiceFlow.
//  * All AI responses are synthesized through this service.
//  */

// const axios = require('axios');
// const { getRimeHeaders, getRimeBody } = require('../config/rime');
// const { bufferToBase64, estimateAudioDurationMs, getMimeType } = require('../utils/audioUtils');
// const { LatencyTimer } = require('../utils/latencyUtils');
// const logger = require('../utils/logger');

// class RimeService {
//   constructor(config) {
//     this.config = config;
//     this.log = logger.child({ service: 'rime' });
//     this.timeout = 30000;
//     this.maxRetries = 2;
//   }

//   /**
//    * Synthesize text to audio via Rime TTS.
//    *
//    * @param {string} text - Text to synthesize
//    * @param {object} options - Options: { signal, overrides, generation }
//    * @returns {Promise<{audio, latencyMs, format, mimeType, durationMs, provider, model, voice}>}
//    */
//   async synthesize(text, options = {}) {
//     const { signal, overrides = {}, generation = null } = options;

//     if (!text || typeof text !== 'string') {
//       throw new Error('RimeService.synthesize: text is required');
//     }

//     if (!this.config.rime.apiKey) {
//       throw new Error('RIME_API_KEY not configured');
//     }

//     const timer = new LatencyTimer('rime_synthesis').start();
//     const body = getRimeBody(text, this.config, overrides);
//     const headers = getRimeHeaders(this.config);
//     const endpoint = this.config.rime.endpoint;

//     this.log.info('Rime synthesis started', {
//       textLength: text.length,
//       model: body.modelId,
//       voice: body.speaker,
//       generation,
//     });

//     let lastError = null;

//     for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
//       // Check for abort between retries
//       if (signal?.aborted) {
//         this.log.info('Rime synthesis aborted', { generation });
//         throw new Error('Rime synthesis aborted');
//       }

//       try {
//         const response = await axios.post(endpoint, body, {
//           headers,
//           responseType: 'arraybuffer',
//           timeout: this.timeout,
//           signal,
//           validateStatus: (s) => s >= 200 && s < 300,
//         });

//         const latencyMs = timer.stop();
//         const audioBuffer = Buffer.from(response.data);
//         const format = this.config.rime.audioFormat;

//         this.log.info('Rime synthesis completed', {
//           latencyMs: Math.round(latencyMs),
//           byteLength: audioBuffer.length,
//           generation,
//           attempt,
//         });

//         return {
//           audio: bufferToBase64(audioBuffer),
//           audioBuffer,
//           latencyMs: Math.round(latencyMs),
//           format,
//           mimeType: getMimeType(format),
//           durationMs: estimateAudioDurationMs(audioBuffer.length, format, this.config.rime.sampleRate),
//           provider: 'rime',
//           model: body.modelId,
//           voice: body.speaker,
//           generation,
//         };
//       } catch (error) {
//         lastError = error;

//         // Don't retry on abort
//         if (axios.isCancel(error) || error.name === 'AbortError' || error.name === 'CanceledError') {
//           this.log.info('Rime synthesis cancelled', { generation });
//           throw new Error('Rime synthesis cancelled');
//         }

//         // Don't retry on 4xx errors (except 429)
//         const status = error.response?.status;
//         if (status && status >= 400 && status < 500 && status !== 429) {
//           this.log.error('Rime API client error', {
//             status,
//             message: error.message,
//             body: error.response?.data ? Buffer.from(error.response.data).toString('utf8').slice(0, 500) : null,
//           });
//           break;
//         }

//         this.log.warn('Rime synthesis attempt failed', {
//           attempt,
//           error: error.message,
//           status,
//         });

//         // Backoff before retry
//         if (attempt < this.maxRetries) {
//           await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
//         }
//       }
//     }

//     this.log.error('Rime synthesis failed after retries', {
//       error: lastError?.message,
//       generation,
//     });
//     throw lastError || new Error('Rime synthesis failed');
//   }

//   /**
//    * Check Rime health / configuration.
//    */
//   async healthCheck() {
//     try {
//       const testText = 'Health check.';
//       const result = await this.synthesize(testText);
//       return { ok: true, latencyMs: result.latencyMs };
//     } catch (error) {
//       return { ok: false, error: error.message };
//     }
//   }
// }

// module.exports = { RimeService };













/**
 * Rime TTS Service (v2)
 *
 * Primary spoken output for VoiceFlow.
 *
 * Supports:
 *   1. Single-shot TTS synthesis
 *   2. Sentence-level streaming synthesis
 *
 * Sentence-level streaming allows the frontend to start playing
 * audio before the complete AI response has been synthesized.
 */

const axios = require('axios');

const {
  getRimeHeaders,
  getRimeBody,
} = require('../config/rime');

const {
  bufferToBase64,
  estimateAudioDurationMs,
  getMimeType,
} = require('../utils/audioUtils');

const {
  LatencyTimer,
} = require('../utils/latencyUtils');

const logger = require('../utils/logger');

class RimeService {
  constructor(config) {
    this.config = config;

    this.log = logger.child({
      service: 'rime',
    });

    this.timeout = 30000;

    this.maxRetries = 2;
  }

  /**
   * Split text into sentences for streaming synthesis.
   *
   * Preserves the complete input text, including trailing text
   * that does not end with punctuation.
   *
   * @param {string} text
   * @returns {string[]}
   */
  splitIntoSentences(text) {
    if (
      !text ||
      typeof text !== 'string'
    ) {
      return [];
    }

    const normalized = text
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return [];
    }

    /*
     * Split at sentence-ending punctuation while preserving
     * punctuation and any final text without punctuation.
     */
    const raw =
      normalized.match(
        /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g
      ) || [normalized];

    const merged = [];

    let buffer = '';

    for (
      let i = 0;
      i < raw.length;
      i++
    ) {
      const fragment =
        raw[i].trim();

      if (!fragment) {
        continue;
      }

      buffer = buffer
        ? `${buffer} ${fragment}`
        : fragment;

      const isLast =
        i === raw.length - 1;

      /*
       * Keep very short fragments together.
       * This avoids sending unnatural tiny requests
       * to the TTS provider.
       */
      if (
        buffer.length >= 15 ||
        isLast
      ) {
        merged.push(
          buffer.trim()
        );

        buffer = '';
      }
    }

    if (buffer.trim()) {
      merged.push(
        buffer.trim()
      );
    }

    return merged.filter(
      Boolean
    );
  }

  /**
   * Synthesize text as a stream of sentence-level audio chunks.
   *
   * Each sentence is synthesized independently and passed to
   * onChunk() as soon as it is ready.
   *
   * @param {string} text
   * @param {object} options
   * @param {AbortSignal} options.signal
   * @param {object} options.overrides
   * @param {string|number|null} options.generation
   * @param {function} options.onChunk
   *
   * @returns {Promise<{
   *   sentences: number,
   *   totalLatencyMs: number
   * }>}
   */
  async synthesizeStream(
    text,
    options = {}
  ) {
    const {
      signal,
      overrides = {},
      generation = null,
      onChunk = () => {},
    } = options;

    const sentences =
      this.splitIntoSentences(
        text
      );

    if (
      sentences.length === 0
    ) {
      throw new Error(
        'No text to synthesize'
      );
    }

    /*
     * If the generation is already cancelled,
     * do not make any Rime request.
     */
    if (signal?.aborted) {
      this.log.info(
        'Rime stream already aborted',
        {
          generation,
        }
      );

      throw new Error(
        'Rime synthesis cancelled'
      );
    }

    this.log.info(
      'Rime streaming synthesis started',
      {
        sentences:
          sentences.length,

        textLength:
          text.length,

        generation,
      }
    );

    const totalTimer =
      new LatencyTimer(
        'rime_stream'
      ).start();

    let completedSentences = 0;

    for (
      let i = 0;
      i < sentences.length;
      i++
    ) {
      /*
       * Check cancellation before every sentence.
       */
      if (signal?.aborted) {
        this.log.info(
          'Rime stream aborted',
          {
            generation,
            sentence: i,
          }
        );

        throw new Error(
          'Rime synthesis cancelled'
        );
      }

      const isLast =
        i ===
        sentences.length - 1;

      const sentenceTimer =
        new LatencyTimer(
          `sentence_${i}`
        ).start();

      try {
        const result =
          await this.synthesize(
            sentences[i],
            {
              signal,
              overrides,
              generation,
            }
          );

        const sentenceLatency =
          sentenceTimer.stop();

        /*
         * Check again after the network request.
         *
         * This prevents an old generation from emitting
         * audio after an interruption occurred while Rime
         * was synthesizing the sentence.
         */
        if (signal?.aborted) {
          this.log.info(
            'Rime stream aborted before chunk emission',
            {
              generation,
              sentence: i,
            }
          );

          throw new Error(
            'Rime synthesis cancelled'
          );
        }

        this.log.info(
          'Rime sentence synthesized',
          {
            seq: i,

            sentences:
              sentences.length,

            latencyMs:
              Math.round(
                sentenceLatency
              ),

            generation,
          }
        );

        /*
         * Emit the completed sentence immediately.
         */
        onChunk({
          audio:
            result.audio,

          mimeType:
            result.mimeType,

          format:
            result.format,

          seq: i,

          isLast,

          sentenceText:
            sentences[i],

          durationMs:
            result.durationMs,

          latencyMs:
            Math.round(
              sentenceLatency
            ),

          provider:
            result.provider,

          model:
            result.model,

          voice:
            result.voice,

          generation,
        });

        completedSentences++;
      } catch (err) {
        /*
         * Cancellation must stop the complete stream.
         */
        if (
          err?.message ===
            'Rime synthesis cancelled' ||
          err?.message ===
            'Rime synthesis aborted' ||
          signal?.aborted
        ) {
          throw new Error(
            'Rime synthesis cancelled'
          );
        }

        this.log.error(
          'Rime sentence failed',
          {
            seq: i,

            error:
              err?.message,

            generation,
          }
        );

        /*
         * Send an error chunk so the caller knows which
         * sentence failed, then continue with remaining
         * sentences.
         */
        onChunk({
          audio: null,

          error:
            err?.message ||
            'Rime sentence synthesis failed',

          seq: i,

          isLast,

          generation,
        });
      }
    }

    /*
     * If the stream was cancelled after the last sentence,
     * do not report a successful stream completion.
     */
    if (signal?.aborted) {
      throw new Error(
        'Rime synthesis cancelled'
      );
    }

    const totalLatency =
      totalTimer.stop();

    this.log.info(
      'Rime streaming synthesis complete',
      {
        sentences:
          sentences.length,

        completedSentences,

        totalLatencyMs:
          Math.round(
            totalLatency
          ),

        generation,
      }
    );

    return {
      sentences:
        sentences.length,

      totalLatencyMs:
        Math.round(
          totalLatency
        ),
    };
  }

  /**
   * Synthesize text to audio via Rime TTS.
   *
   * Original single-shot synthesis.
   *
   * @param {string} text
   * @param {object} options
   *
   * @returns {Promise<{
   *   audio: string,
   *   audioBuffer: Buffer,
   *   latencyMs: number,
   *   format: string,
   *   mimeType: string,
   *   durationMs: number,
   *   provider: string,
   *   model: string,
   *   voice: string,
   *   generation: string|number|null
   * }>}
   */
  async synthesize(
    text,
    options = {}
  ) {
    const {
      signal,
      overrides = {},
      generation = null,
    } = options;

    if (
      !text ||
      typeof text !== 'string'
    ) {
      throw new Error(
        'RimeService.synthesize: text is required'
      );
    }

    if (
      !this.config?.rime?.apiKey
    ) {
      throw new Error(
        'RIME_API_KEY not configured'
      );
    }

    /*
     * Never start a request for an already stale
     * generation.
     */
    if (signal?.aborted) {
      this.log.info(
        'Rime synthesis skipped — generation already aborted',
        {
          generation,
        }
      );

      throw new Error(
        'Rime synthesis cancelled'
      );
    }

    const timer =
      new LatencyTimer(
        'rime_synthesis'
      ).start();

    const body =
      getRimeBody(
        text,
        this.config,
        overrides
      );

    const headers =
      getRimeHeaders(
        this.config
      );

    const endpoint =
      this.config.rime.endpoint;

    this.log.info(
      'Rime synthesis started',
      {
        textLength:
          text.length,

        model:
          body.modelId,

        voice:
          body.speaker,

        generation,
      }
    );

    let lastError = null;

    for (
      let attempt = 0;
      attempt <= this.maxRetries;
      attempt++
    ) {
      /*
       * Check cancellation between retries.
       */
      if (signal?.aborted) {
        this.log.info(
          'Rime synthesis aborted',
          {
            generation,
          }
        );

        throw new Error(
          'Rime synthesis cancelled'
        );
      }

      try {
        const response =
          await axios.post(
            endpoint,
            body,
            {
              headers,

              responseType:
                'arraybuffer',

              timeout:
                this.timeout,

              signal,

              validateStatus:
                (status) =>
                  status >= 200 &&
                  status < 300,
            }
          );

        /*
         * Check immediately after the request.
         * The generation may have become stale while
         * the request was running.
         */
        if (signal?.aborted) {
          throw new Error(
            'Rime synthesis cancelled'
          );
        }

        const latencyMs =
          timer.stop();

        const audioBuffer =
          Buffer.from(
            response.data
          );

        const format =
          this.config.rime.audioFormat;

        const mimeType =
          getMimeType(format);

        const durationMs =
          estimateAudioDurationMs(
            audioBuffer.length,
            format,
            this.config.rime.sampleRate
          );

        this.log.info(
          'Rime synthesis completed',
          {
            latencyMs:
              Math.round(
                latencyMs
              ),

            byteLength:
              audioBuffer.length,

            generation,

            attempt,
          }
        );

        return {
          audio:
            bufferToBase64(
              audioBuffer
            ),

          audioBuffer,

          latencyMs:
            Math.round(
              latencyMs
            ),

          format,

          mimeType,

          durationMs,

          provider:
            'rime',

          model:
            body.modelId,

          voice:
            body.speaker,

          generation,
        };
      } catch (error) {
        lastError = error;

        /*
         * Never retry an aborted request.
         */
        if (
          axios.isCancel(error) ||
          error?.name ===
            'AbortError' ||
          error?.name ===
            'CanceledError' ||
          error?.code ===
            'ERR_CANCELED' ||
          signal?.aborted
        ) {
          this.log.info(
            'Rime synthesis cancelled',
            {
              generation,
            }
          );

          throw new Error(
            'Rime synthesis cancelled'
          );
        }

        const status =
          error.response?.status;

        /*
         * Do not retry normal 4xx client errors,
         * except 429 rate limiting.
         */
        if (
          status &&
          status >= 400 &&
          status < 500 &&
          status !== 429
        ) {
          let responseBody =
            null;

          try {
            if (
              error.response?.data
            ) {
              responseBody =
                Buffer.from(
                  error.response.data
                )
                  .toString(
                    'utf8'
                  )
                  .slice(0, 500);
            }
          } catch {
            responseBody = null;
          }

          this.log.error(
            'Rime API client error',
            {
              status,

              message:
                error.message,

              body:
                responseBody,
            }
          );

          break;
        }

        this.log.warn(
          'Rime synthesis attempt failed',
          {
            attempt,

            error:
              error.message,

            status,

            generation,
          }
        );

        /*
         * Backoff before retry.
         */
        if (
          attempt <
          this.maxRetries
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                500 *
                  (attempt + 1)
              )
          );
        }
      }
    }

    this.log.error(
      'Rime synthesis failed after retries',
      {
        error:
          lastError?.message,

        generation,
      }
    );

    throw (
      lastError ||
      new Error(
        'Rime synthesis failed'
      )
    );
  }

  /**
   * Check Rime health / configuration.
   */
  async healthCheck() {
    try {
      const testText =
        'Health check.';

      const result =
        await this.synthesize(
          testText
        );

      return {
        ok: true,

        latencyMs:
          result.latencyMs,
      };
    } catch (error) {
      return {
        ok: false,

        error:
          error.message,
      };
    }
  }
}

module.exports = {
  RimeService,
};