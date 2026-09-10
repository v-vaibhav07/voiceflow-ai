/**
 * Voice Controller
 *
 * REST endpoints for voice-related operations that don't require WebSocket.
 * Real-time voice happens over WebSocket in server.js.
 */

const { getPublicRimeInfo } = require('../config/rime');

class VoiceController {
  constructor({ rimeService, config }) {
    this.rime = rimeService;
    this.config = config;
  }

  /**
   * GET /api/voice/config
   * Return safe, public Rime configuration for frontend display.
   */
  getConfig = (req, res) => {
    res.json({
      rime: getPublicRimeInfo(this.config),
      llm: {
        model: this.config.openai.model,
        configured: !!this.config.openai.apiKey,
      },
    });
  };

  /**
   * POST /api/voice/synthesize
   * On-demand TTS synthesis via Rime (used for tests and evaluation).
   * Body: { text, voice?, model? }
   */
  synthesize = async (req, res, next) => {
    try {
      const { text, voice, model } = req.body || {};
      if (!text) return res.status(400).json({ error: { message: 'text is required' } });

      const result = await this.rime.synthesize(text, {
        overrides: { voice, model },
      });

      res.json({
        audio: result.audio,
        mimeType: result.mimeType,
        format: result.format,
        durationMs: result.durationMs,
        latencyMs: result.latencyMs,
        provider: result.provider,
        model: result.model,
        voice: result.voice,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/voice/health
   * Check Rime service health.
   */
  health = async (req, res) => {
    try {
      const health = await this.rime.healthCheck();
      res.json({ rime: health });
    } catch (err) {
      res.status(500).json({ rime: { ok: false, error: err.message } });
    }
  };
}

module.exports = { VoiceController };