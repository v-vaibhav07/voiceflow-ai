/**
 * Speech Service
 *
 * Note: Speech-to-text is performed on the frontend using the Web Speech API.
 * This service normalizes and validates transcriptions received from the frontend.
 */

const logger = require('../utils/logger');

class SpeechService {
  constructor() {
    this.log = logger.child({ service: 'speech' });
  }

  /**
   * Normalize a raw transcription from the frontend.
   */
  normalize(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    return rawText.trim().replace(/\s+/g, ' ');
  }

  /**
   * Validate that a transcription looks like real user speech.
   */
  isValidTranscription(text) {
    const normalized = this.normalize(text);
    if (normalized.length < 2) return false;
    if (normalized.length > 2000) return false;
    return true;
  }

  /**
   * Detect if this transcription looks like an interruption
   * (heuristic based on short, corrective phrases).
   */
  looksLikeInterruption(text) {
    const normalized = this.normalize(text).toLowerCase();
    const interruptionPhrases = [
      'wait',
      'actually',
      'no,',
      'stop',
      'hold on',
      'never mind',
      'cancel',
      'instead',
      'only',
    ];
    return interruptionPhrases.some((phrase) => normalized.startsWith(phrase));
  }
}

module.exports = { SpeechService };