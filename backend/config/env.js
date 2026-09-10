// /**
//  * Environment configuration loader
//  * Validates required environment variables on startup
//  */

// const path = require('path');
// const dotenv = require('dotenv');

// // Load .env file
// dotenv.config({
//   path: path.resolve(__dirname, '..', '.env'),
// });

// const requiredVars = [
//   'RIME_API_KEY',
//   'OPENROUTER_API_KEY',
//   'SUPABASE_URL',
//   'SUPABASE_ANON_KEY',
//   'SUPABASE_SERVICE_ROLE_KEY',
// ];

// const optionalVars = {
//   // ── Rime TTS Configuration ─────────────────
//   RIME_MODEL: 'mist',
//   RIME_VOICE: 'grove',
//   RIME_LANGUAGE: 'en',
//   RIME_ENDPOINT: 'https://users.rime.ai/v1/rime-tts',
//   RIME_AUDIO_FORMAT: 'mp3',
//   RIME_REGION: 'us',
//   RIME_TRANSPORT: 'rest',
//   RIME_SAMPLE_RATE: '22050',

//   // ── OpenRouter LLM Configuration ───────────
//   OPENROUTER_MODEL: 'openai/gpt-4o-mini',
//   OPENROUTER_MAX_TOKENS: '500',
//   OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
//   OPENROUTER_SITE_URL: 'http://localhost:5173',
//   OPENROUTER_SITE_NAME: 'DataForge Rime Project',

//   // ── Server Configuration ───────────────────
//   PORT: '3001',
//   NODE_ENV: 'development',
//   CORS_ORIGIN: 'http://localhost:5173',
//   LOG_LEVEL: 'info',

//   // ── Rate Limiting ──────────────────────────
//   RATE_LIMIT_WINDOW_MS: '60000',
//   RATE_LIMIT_MAX_REQUESTS: '100',

//   // ── Tool Configuration ─────────────────────
//   DEFAULT_TOOL_DELAY_MS: '0',
//   MAX_TOOL_DELAY_MS: '10000',
// };

// function loadConfig() {
//   const missing = [];

//   // Validate required environment variables
//   for (const key of requiredVars) {
//     if (!process.env[key]) {
//       missing.push(key);
//     }
//   }

//   // Stop startup if required variables are missing
//   if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
//     console.error(
//       `❌ Missing required environment variables: ${missing.join(', ')}`
//     );

//     console.error(
//       '   Copy .env.example to .env and fill in your credentials.'
//     );

//     process.exit(1);
//   }

//   // Apply defaults for optional variables
//   for (const [key, defaultValue] of Object.entries(optionalVars)) {
//     if (!process.env[key]) {
//       process.env[key] = defaultValue;
//     }
//   }

//   return {
//     // ── Rime Configuration ───────────────────
//     rime: {
//       apiKey: process.env.RIME_API_KEY,
//       model: process.env.RIME_MODEL,
//       voice: process.env.RIME_VOICE,
//       language: process.env.RIME_LANGUAGE,
//       endpoint: process.env.RIME_ENDPOINT,
//       audioFormat: process.env.RIME_AUDIO_FORMAT,
//       region: process.env.RIME_REGION,
//       transport: process.env.RIME_TRANSPORT,
//       sampleRate: parseInt(process.env.RIME_SAMPLE_RATE, 10),
//     },

//     // ── OpenRouter Configuration ──────────────
//     openrouter: {
//       apiKey: process.env.OPENROUTER_API_KEY,
//       model: process.env.OPENROUTER_MODEL,
//       maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS, 10),
//       baseUrl: process.env.OPENROUTER_BASE_URL,
//       siteUrl: process.env.OPENROUTER_SITE_URL,
//       siteName: process.env.OPENROUTER_SITE_NAME,
//     },

//     // ── OpenAI Compatibility Configuration ───
//     // Existing project files may still use config.openai.
//     // These values actually point to OpenRouter.
//     openai: {
//       apiKey: process.env.OPENROUTER_API_KEY,
//       model: process.env.OPENROUTER_MODEL,
//       maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS, 10),
//       baseUrl: process.env.OPENROUTER_BASE_URL,
//     },

//     // ── Supabase Configuration ────────────────
//     supabase: {
//       url: process.env.SUPABASE_URL,
//       anonKey: process.env.SUPABASE_ANON_KEY,
//       serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
//     },

//     // ── Server Configuration ──────────────────
//     server: {
//       port: parseInt(process.env.PORT, 10),
//       nodeEnv: process.env.NODE_ENV,
//       corsOrigin: process.env.CORS_ORIGIN,
//       logLevel: process.env.LOG_LEVEL,
//     },

//     // ── Rate Limit Configuration ──────────────
//     rateLimit: {
//       windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10),
//       maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10),
//     },

//     // ── Tool Configuration ────────────────────
//     tools: {
//       defaultDelayMs: parseInt(process.env.DEFAULT_TOOL_DELAY_MS, 10),
//       maxDelayMs: parseInt(process.env.MAX_TOOL_DELAY_MS, 10),
//     },
//   };
// }

// module.exports = {
//   loadConfig,
// };

/**
 * Environment configuration loader
 * Validates required environment variables on startup
 */

const path = require('path');
const dotenv = require('dotenv');

// Load .env file
dotenv.config({
  path: path.resolve(__dirname, '..', '.env'),
});

const requiredVars = [
  'RIME_API_KEY',
  'OPENROUTER_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const optionalVars = {
  // ── Rime TTS Configuration ─────────────────
  RIME_MODEL: 'mist',
  RIME_VOICE: 'grove',
  RIME_LANGUAGE: 'en',
  RIME_ENDPOINT: 'https://users.rime.ai/v1/rime-tts',
  RIME_AUDIO_FORMAT: 'mp3',
  RIME_REGION: 'us',
  RIME_TRANSPORT: 'rest',
  RIME_SAMPLE_RATE: '22050',

  // ── OpenRouter LLM Configuration ───────────
  OPENROUTER_MODEL: 'openai/gpt-4o-mini',
  OPENROUTER_MAX_TOKENS: '500',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_SITE_URL: 'http://localhost:5173',
  OPENROUTER_SITE_NAME: 'DataForge Rime Project',

  // ── Deepgram STT Configuration ─────────────
  DEEPGRAM_API_KEY: '',
  STT_LANGUAGE: 'en-US',
  STT_MODEL: 'nova-2',

  // ── Streaming TTS Configuration ────────────
  ENABLE_STREAMING_TTS: 'true',

  // ── Server Configuration ───────────────────
  PORT: '3001',
  NODE_ENV: 'development',
  CORS_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'info',

  // ── Rate Limiting ──────────────────────────
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX_REQUESTS: '100',

  // ── Tool Configuration ─────────────────────
  DEFAULT_TOOL_DELAY_MS: '0',
  MAX_TOOL_DELAY_MS: '10000',
};

function loadConfig() {
  const missing = [];

  // Validate required environment variables
  for (const key of requiredVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Stop startup if required variables are missing
  if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    console.error(
      `❌ Missing required environment variables: ${missing.join(', ')}`
    );

    console.error(
      '   Copy .env.example to .env and fill in your credentials.'
    );

    process.exit(1);
  }

  // Apply defaults for optional variables
  for (const [key, defaultValue] of Object.entries(optionalVars)) {
    if (!process.env[key]) {
      process.env[key] = defaultValue;
    }
  }

  return {
    // ── Rime Configuration ───────────────────
    rime: {
      apiKey: process.env.RIME_API_KEY,
      model: process.env.RIME_MODEL,
      voice: process.env.RIME_VOICE,
      language: process.env.RIME_LANGUAGE,
      endpoint: process.env.RIME_ENDPOINT,
      audioFormat: process.env.RIME_AUDIO_FORMAT,
      region: process.env.RIME_REGION,
      transport: process.env.RIME_TRANSPORT,
      sampleRate: parseInt(process.env.RIME_SAMPLE_RATE, 10),
    },

    // ── OpenRouter Configuration ──────────────
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL,
      maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS, 10),
      baseUrl: process.env.OPENROUTER_BASE_URL,
      siteUrl: process.env.OPENROUTER_SITE_URL,
      siteName: process.env.OPENROUTER_SITE_NAME,
    },

    // ── OpenAI Compatibility Configuration ───
    // Existing project files may still use config.openai.
    // These values actually point to OpenRouter.
    openai: {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL,
      maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS, 10),
      baseUrl: process.env.OPENROUTER_BASE_URL,
    },

    // ── Supabase Configuration ────────────────
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },

    // ── Deepgram STT Configuration ────────────
    deepgram: {
      apiKey: process.env.DEEPGRAM_API_KEY || '',
      language: process.env.STT_LANGUAGE,
      model: process.env.STT_MODEL,
    },

    // ── Streaming TTS Configuration ───────────
    streaming: {
      enabled: process.env.ENABLE_STREAMING_TTS === 'true',
    },

    // ── Server Configuration ──────────────────
    server: {
      port: parseInt(process.env.PORT, 10),
      nodeEnv: process.env.NODE_ENV,
      corsOrigin: process.env.CORS_ORIGIN,
      logLevel: process.env.LOG_LEVEL,
    },

    // ── Rate Limit Configuration ──────────────
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10),
    },

    // ── Tool Configuration ────────────────────
    tools: {
      defaultDelayMs: parseInt(
        process.env.DEFAULT_TOOL_DELAY_MS,
        10
      ),
      maxDelayMs: parseInt(
        process.env.MAX_TOOL_DELAY_MS,
        10
      ),
    },
  };
}

module.exports = {
  loadConfig,
};