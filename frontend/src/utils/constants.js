// /**
//  * Application-wide constants
//  */

// export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
// export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';
// export const ENABLE_FALLBACK_TTS = import.meta.env.VITE_ENABLE_FALLBACK_TTS !== 'false';
// export const DEBUG = import.meta.env.VITE_ENABLE_DEBUG_LOGGING === 'true';

// /**
//  * Voice Interface State Machine
//  */
// export const VOICE_STATE = {
//   IDLE: 'IDLE',
//   LISTENING: 'LISTENING',
//   PROCESSING: 'PROCESSING',
//   TOOL_RUNNING: 'TOOL_RUNNING',
//   SPEAKING: 'SPEAKING',
//   INTERRUPTED: 'INTERRUPTED',
//   RECOVERING: 'RECOVERING',
//   COMPLETED: 'COMPLETED',
//   ERROR: 'ERROR',
// };

// export const STATE_LABELS = {
//   IDLE: 'Ready',
//   LISTENING: 'Listening',
//   PROCESSING: 'Processing',
//   TOOL_RUNNING: 'Running Tool',
//   SPEAKING: 'AI Speaking',
//   INTERRUPTED: 'Interrupted',
//   RECOVERING: 'Recovering',
//   COMPLETED: 'Ready',
//   ERROR: 'Error',
// };

// export const STATE_COLORS = {
//   IDLE: 'neutral',
//   LISTENING: 'info',
//   PROCESSING: 'warning',
//   TOOL_RUNNING: 'warning',
//   SPEAKING: 'success',
//   INTERRUPTED: 'danger',
//   RECOVERING: 'warning',
//   COMPLETED: 'neutral',
//   ERROR: 'danger',
// };

// /**
//  * WebSocket message types
//  */
// export const WS_MESSAGE_TYPES = {
//   // Client → Server
//   START_SESSION: 'start_session',
//   UPDATE_CONFIG: 'update_config',
//   USER_SPEECH: 'user_speech',
//   INTERRUPTION: 'interruption',
//   PING: 'ping',

//   // Server → Client
//   HELLO: 'hello',
//   SESSION_STARTED: 'session_started',
//   STATE_CHANGE: 'state_change',
//   TOOL_STARTED: 'tool_started',
//   TOOL_COMPLETED: 'tool_completed',
//   LLM_RESPONSE: 'llm_response',
//   TTS_AUDIO: 'tts_audio',
//   INTERRUPTION_ACK: 'interruption_ack',
//   STALE_RESPONSE_BLOCKED: 'stale_response_blocked',
//   CONFIG_UPDATED: 'config_updated',
//   ERROR: 'error',
//   PONG: 'pong',
// };

// /**
//  * Interruption reasons
//  */
// export const INTERRUPTION_REASON = {
//   USER_SPEECH: 'user_speech',
//   USER_CLICK: 'user_click',
//   NEW_REQUEST: 'new_request',
//   TIMEOUT: 'timeout',
//   ERROR: 'error',
// };

// /**
//  * Tool delay presets (for stress test)
//  */
// export const TOOL_DELAY_PRESETS = [
//   { label: '0ms (no delay)', value: 0 },
//   { label: '500ms', value: 500 },
//   { label: '1000ms', value: 1000 },
//   { label: '2000ms', value: 2000 },
//   { label: '5000ms', value: 5000 },
// ];

// /**
//  * Interruption delay presets
//  */
// export const INTERRUPTION_DELAY_PRESETS = [
//   { label: '500ms', value: 500 },
//   { label: '1000ms', value: 1000 },
//   { label: '2000ms', value: 2000 },
// ];

// /**
//  * Recommended sample prompts
//  */
// export const SAMPLE_PROMPTS = [
//   'Find flights from Delhi to Mumbai tomorrow',
//   'Search morning flights from Delhi to Mumbai',
//   'Show me evening flights from Delhi to Mumbai',
//   'Find flights from Delhi to Mumbai in the afternoon',
// ];

// /**
//  * Common interruption phrases
//  */
// export const INTERRUPTION_PHRASES = [
//   'Wait, only morning flights',
//   'Actually, evening flights only',
//   'No, afternoon instead',
//   'Stop, cancel that',
// ];















/**
 * Application-wide constants
 */

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';
export const ENABLE_FALLBACK_TTS = import.meta.env.VITE_ENABLE_FALLBACK_TTS !== 'false';
export const DEBUG = import.meta.env.VITE_ENABLE_DEBUG_LOGGING === 'true';

// NEW: Server STT config
export const ENABLE_SERVER_STT = import.meta.env.VITE_ENABLE_SERVER_STT === 'true';
export const STT_PROVIDER = import.meta.env.VITE_STT_PROVIDER || 'deepgram';

/**
 * Voice Interface State Machine
 */
export const VOICE_STATE = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  TOOL_RUNNING: 'TOOL_RUNNING',
  SPEAKING: 'SPEAKING',
  INTERRUPTED: 'INTERRUPTED',
  RECOVERING: 'RECOVERING',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
};

export const STATE_LABELS = {
  IDLE: 'Ready',
  LISTENING: 'Listening',
  PROCESSING: 'Processing',
  TOOL_RUNNING: 'Running Tool',
  SPEAKING: 'AI Speaking',
  INTERRUPTED: 'Interrupted',
  RECOVERING: 'Recovering',
  COMPLETED: 'Ready',
  ERROR: 'Error',
};

export const STATE_COLORS = {
  IDLE: 'neutral',
  LISTENING: 'info',
  PROCESSING: 'warning',
  TOOL_RUNNING: 'warning',
  SPEAKING: 'success',
  INTERRUPTED: 'danger',
  RECOVERING: 'warning',
  COMPLETED: 'neutral',
  ERROR: 'danger',
};

/**
 * WebSocket message types
 */
export const WS_MESSAGE_TYPES = {
  // Client → Server
  START_SESSION: 'start_session',
  UPDATE_CONFIG: 'update_config',
  USER_SPEECH: 'user_speech',
  INTERRUPTION: 'interruption',
  PING: 'ping',

  // NEW: Server STT — client streams raw audio
  AUDIO_STREAM_START: 'audio_stream_start',
  AUDIO_STREAM_CHUNK: 'audio_stream_chunk',
  AUDIO_STREAM_END: 'audio_stream_end',

  // Server → Client
  HELLO: 'hello',
  SESSION_STARTED: 'session_started',
  STATE_CHANGE: 'state_change',
  TOOL_STARTED: 'tool_started',
  TOOL_COMPLETED: 'tool_completed',
  LLM_RESPONSE: 'llm_response',
  TTS_AUDIO: 'tts_audio',
  INTERRUPTION_ACK: 'interruption_ack',
  STALE_RESPONSE_BLOCKED: 'stale_response_blocked',
  CONFIG_UPDATED: 'config_updated',
  ERROR: 'error',
  PONG: 'pong',

  // NEW: Chunked TTS audio (sentence-level streaming)
  TTS_AUDIO_CHUNK: 'tts_audio_chunk',
  TTS_AUDIO_COMPLETE: 'tts_audio_complete',

  // NEW: Server STT — server sends transcripts back
  STT_INTERIM: 'stt_interim',
  STT_FINAL: 'stt_final',
};

/**
 * Interruption reasons
 */
export const INTERRUPTION_REASON = {
  USER_SPEECH: 'user_speech',
  USER_CLICK: 'user_click',
  NEW_REQUEST: 'new_request',
  TIMEOUT: 'timeout',
  ERROR: 'error',
  VAD_DETECTED: 'vad_detected',
};

/**
 * Tool delay presets (for stress test)
 */
export const TOOL_DELAY_PRESETS = [
  { label: '0ms (no delay)', value: 0 },
  { label: '500ms', value: 500 },
  { label: '1000ms', value: 1000 },
  { label: '2000ms', value: 2000 },
  { label: '5000ms', value: 5000 },
];

/**
 * Interruption delay presets
 */
export const INTERRUPTION_DELAY_PRESETS = [
  { label: '500ms', value: 500 },
  { label: '1000ms', value: 1000 },
  { label: '2000ms', value: 2000 },
];

/**
 * Recommended sample prompts
 */
export const SAMPLE_PROMPTS = [
  'Find flights from Delhi to Mumbai tomorrow',
  'Search morning flights from Delhi to Mumbai',
  'Show me evening flights from Delhi to Mumbai',
  'Find flights from Delhi to Mumbai in the afternoon',
];

/**
 * Common interruption phrases
 */
export const INTERRUPTION_PHRASES = [
  'Wait, only morning flights',
  'Actually, evening flights only',
  'No, afternoon instead',
  'Stop, cancel that',
];

/**
 * VAD sensitivity presets (for UI)
 */
export const VAD_SENSITIVITY_PRESETS = [
  { label: 'Low', value: 'low', description: 'Quiet environments' },
  { label: 'Medium', value: 'medium', description: 'Default' },
  { label: 'High', value: 'high', description: 'Noisy environments' },
];