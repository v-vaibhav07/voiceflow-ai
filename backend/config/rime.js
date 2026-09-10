/**
 * Rime TTS configuration and validation
 */

function validateRimeConfig(config) {
  const errors = [];

  if (!config.rime.apiKey) errors.push('RIME_API_KEY is required');
  if (!config.rime.endpoint) errors.push('RIME_ENDPOINT is required');
  if (!config.rime.model) errors.push('RIME_MODEL is required');
  if (!config.rime.voice) errors.push('RIME_VOICE is required');

  if (errors.length > 0) {
    console.warn('⚠️  Rime configuration warnings:');
    errors.forEach((e) => console.warn(`   - ${e}`));
  }

  return errors.length === 0;
}

function getRimeHeaders(config) {
  return {
    Accept: getAcceptHeader(config.rime.audioFormat),
    Authorization: `Bearer ${config.rime.apiKey}`,
    'Content-Type': 'application/json',
  };
}

function getAcceptHeader(format) {
  const map = {
    mp3: 'audio/mp3',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pcm: 'audio/pcm',
    mulaw: 'audio/x-mulaw',
  };
  return map[format] || 'audio/mp3';
}

function getRimeBody(text, config, overrides = {}) {
  return {
    speaker: overrides.voice || config.rime.voice,
    text,
    modelId: overrides.model || config.rime.model,
    lang: overrides.language || config.rime.language,
    audioFormat: overrides.audioFormat || config.rime.audioFormat,
    samplingRate: overrides.sampleRate || config.rime.sampleRate,
    ...overrides.extra,
  };
}

function getPublicRimeInfo(config) {
  return {
    model: config.rime.model,
    voice: config.rime.voice,
    language: config.rime.language,
    endpoint: config.rime.endpoint,
    audioFormat: config.rime.audioFormat,
    region: config.rime.region,
    transport: config.rime.transport,
    sampleRate: config.rime.sampleRate,
    configured: !!config.rime.apiKey,
  };
}

module.exports = {
  validateRimeConfig,
  getRimeHeaders,
  getAcceptHeader,
  getRimeBody,
  getPublicRimeInfo,
};