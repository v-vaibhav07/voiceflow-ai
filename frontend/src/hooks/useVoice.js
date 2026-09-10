// /**
//  * useVoice — the orchestration hook
//  *
//  * This is the heart of the frontend. It:
//  *   - manages the VoiceSocket connection
//  *   - runs SpeechRecognition
//  *   - decides when a user utterance is an interruption vs. a new turn
//  *   - drives the audio player
//  *   - keeps the state machine synchronized
//  *   - tracks generations locally so we can double-check stale audio
//  *   - records latency for every hop
//  *
//  * All heavy async logic lives here so components stay dumb.
//  */

// import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import { VoiceSocket } from '../api/voiceApi';
// import { useAudio } from './useAudio';
// import { useInterruption } from './useInterruption';
// import { useConversation } from './useConversation';
// import { useLatency } from './useLatency';
// import { VOICE_STATE, WS_MESSAGE_TYPES, INTERRUPTION_REASON, DEBUG } from '../utils/constants';

// function log(...args) {
//   if (DEBUG) console.log('[voice]', ...args);
// }

// /**
//  * Browser SpeechRecognition wrapper.
//  * Returns null if unsupported.
//  */
// function createRecognizer() {
//   const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
//   if (!SR) return null;
//   const r = new SR();
//   r.continuous = true;
//   r.interimResults = true;
//   r.lang = 'en-US';
//   r.maxAlternatives = 1;
//   return r;
// }

// export function useVoice({ autoConnect = true } = {}) {
//   const socketRef = useRef(null);
//   const recognizerRef = useRef(null);
//   const recognizerActiveRef = useRef(false);
//   const currentAssistantMsgIdRef = useRef(null);
//   const currentAssistantTextRef = useRef('');
//   const speechStartTsRef = useRef(null);
//   const interimBufferRef = useRef('');
//   const localGenerationRef = useRef(0);
//   const lastUserTextRef = useRef('');
//   const requestSentTsRef = useRef(null);

//   const [connected, setConnected] = useState(false);
//   const [sessionId, setSessionId] = useState(null);
//   const [conversationId, setConversationId] = useState(null);
//   const [state, setState] = useState(VOICE_STATE.IDLE);
//   const [micActive, setMicActive] = useState(false);
//   const [interimText, setInterimText] = useState('');
//   const [rimeInfo, setRimeInfo] = useState(null);
//   const [error, setError] = useState(null);
//   const [recognitionSupported, setRecognitionSupported] = useState(true);
//   const [staleBlockedCount, setStaleBlockedCount] = useState(0);

//   const audio = useAudio();
//   const interruption = useInterruption();
//   const conversation = useConversation();
//   const latency = useLatency();

//   const supported = useMemo(
//     () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
//     []
//   );

//   // ─────────────── Socket lifecycle ───────────────
//   useEffect(() => {
//     if (!autoConnect) return;
//     const socket = new VoiceSocket();
//     socketRef.current = socket;

//     const unsubConn = socket.onConnectionChange(({ connected }) => setConnected(connected));

//     const unsubHello = socket.on(WS_MESSAGE_TYPES.HELLO, (msg) => {
//       setSessionId(msg.sessionId);
//       if (msg.rime) setRimeInfo(msg.rime);
//       socket.startSession({});
//     });

//     const unsubSessionStart = socket.on(WS_MESSAGE_TYPES.SESSION_STARTED, (msg) => {
//       setConversationId(msg.conversationId);
//     });

//     const unsubState = socket.on(WS_MESSAGE_TYPES.STATE_CHANGE, (msg) => {
//       // Only apply state changes from the current generation
//       if (msg.generation && msg.generation < localGenerationRef.current) {
//         log('state_change ignored — stale', msg);
//         return;
//       }
//       setState(msg.state);
//     });

//     const unsubToolStart = socket.on(WS_MESSAGE_TYPES.TOOL_STARTED, (msg) => {
//       conversation.addToolCall({
//         callId: msg.callId,
//         toolName: msg.toolName,
//         args: msg.toolArgs,
//         generation: msg.generation,
//       });
//     });

//     const unsubToolDone = socket.on(WS_MESSAGE_TYPES.TOOL_COMPLETED, (msg) => {
//       conversation.updateToolCall(msg.callId, {
//         status: 'completed',
//         result: msg.result,
//         completedAt: Date.now(),
//       });
//     });

//     const unsubLLM = socket.on(WS_MESSAGE_TYPES.LLM_RESPONSE, (msg) => {
//       if (msg.generation && msg.generation < localGenerationRef.current) {
//         log('llm_response ignored — stale', msg.generation);
//         return;
//       }
//       // Register / update the assistant message so we can display text
//       // before audio arrives.
//       const assistantMsg = conversation.addAssistantMessage({
//         id: msg.messageId,
//         text: msg.text,
//         generation: msg.generation,
//         status: 'streaming',
//       });
//       currentAssistantMsgIdRef.current = msg.messageId || assistantMsg.id;
//       currentAssistantTextRef.current = msg.text;
//     });

//     const unsubAudio = socket.on(WS_MESSAGE_TYPES.TTS_AUDIO, async (msg) => {
//       const gen = msg.generation;

//       // 1st stale check before we even try to play
//       if (gen && gen < localGenerationRef.current) {
//         log('tts_audio DISCARDED — stale generation', { gen, current: localGenerationRef.current });
//         setStaleBlockedCount((n) => n + 1);
//         return;
//       }

//       // Record latency
//       if (msg.totalLatencyMs != null) latency.record('endToEnd', msg.totalLatencyMs);
//       if (msg.latencyMs != null) latency.record('rime', msg.latencyMs);
//       if (requestSentTsRef.current) {
//         latency.record('firstAudio', performance.now() - requestSentTsRef.current);
//         requestSentTsRef.current = null;
//       }
//       if (msg.recoveryLatencyMs != null) latency.record('recovery', msg.recoveryLatencyMs);

//       // Make sure the message exists in the conversation
//       const assistantMsg = conversation.addAssistantMessage({
//         id: msg.messageId,
//         text: msg.text,
//         generation: gen,
//         status: 'complete',
//         audioDurationMs: msg.durationMs,
//         provider: msg.provider,
//         model: msg.model,
//         voice: msg.voice,
//       });
//       currentAssistantMsgIdRef.current = msg.messageId || assistantMsg.id;

//       try {
//         const result = await audio.play({
//           base64: msg.audio,
//           mimeType: msg.mimeType,
//           generation: gen,
//           messageId: msg.messageId,
//           isStale: (g) => g < localGenerationRef.current,
//         });

//         if (result?.blockedAsStale) {
//           setStaleBlockedCount((n) => n + 1);
//           conversation.updateMessage(msg.messageId, { status: 'discarded' });
//         }
//       } catch (err) {
//         console.error('audio.play failed', err);
//         setError(err?.message || 'Audio playback failed');
//       }
//     });

//     const unsubInterruptionAck = socket.on(WS_MESSAGE_TYPES.INTERRUPTION_ACK, (msg) => {
//       log('interruption_ack', msg);
//       setState(VOICE_STATE.RECOVERING);
//       conversation.addInterruption({
//         oldGeneration: msg.newGeneration - 1,
//         newGeneration: msg.newGeneration,
//         cancelledCount: msg.cancelledCount,
//         detectedAt: interruption.current()?.detectedAt,
//         audioStopLatencyMs: interruption.current()?.audioStopLatencyMs,
//       });
//     });

//     const unsubStale = socket.on(WS_MESSAGE_TYPES.STALE_RESPONSE_BLOCKED, (msg) => {
//       log('server signalled stale_response_blocked', msg);
//       setStaleBlockedCount((n) => n + 1);
//     });

//     const unsubError = socket.on(WS_MESSAGE_TYPES.ERROR, (msg) => {
//       console.warn('WS error msg:', msg);
//       setError(msg.message || 'Unknown error');
//     });

//     socket.connect();

//     return () => {
//       unsubConn();
//       unsubHello();
//       unsubSessionStart();
//       unsubState();
//       unsubToolStart();
//       unsubToolDone();
//       unsubLLM();
//       unsubAudio();
//       unsubInterruptionAck();
//       unsubStale();
//       unsubError();
//       socket.disconnect();
//       socketRef.current = null;
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [autoConnect]);

//   // ─────────────── Audio → recovery signalling ───────────────
//   useEffect(() => {
//     const unsub = audio.subscribe((event) => {
//       if (event.type === 'play') {
//         const rec = interruption.current();
//         if (rec) {
//           interruption.markRecovered({ newGeneration: localGenerationRef.current });
//           setState(VOICE_STATE.SPEAKING);
//         }
//       }
//       if (event.type === 'ended') {
//         // Only mark completed if audio ended naturally on current generation
//         if (event.generation && event.generation >= localGenerationRef.current) {
//           setState(VOICE_STATE.COMPLETED);
//         }
//       }
//     });
//     return unsub;
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   // ─────────────── Interruption logic ───────────────
//   const triggerInterruption = useCallback(
//     (newText, reason = INTERRUPTION_REASON.USER_SPEECH) => {
//       const oldMessageId = currentAssistantMsgIdRef.current;
//       const oldText = currentAssistantTextRef.current;

//       // 1. Increment local generation IMMEDIATELY so late audio is blocked.
//       localGenerationRef.current += 1;

//       // 2. Mark detection time and stop audio.
//       const rec = interruption.markDetected({
//         oldGeneration: localGenerationRef.current - 1,
//         oldRequest: lastUserTextRef.current,
//         newRequest: newText,
//         reason,
//       });

//       const stopLatency = audio.stop();
//       interruption.markAudioStopped();

//       // 3. Update the interrupted message in UI.
//       if (oldMessageId) {
//         conversation.markInterrupted(oldMessageId, /* placeholder */ 0);
//       }

//       setState(VOICE_STATE.INTERRUPTED);

//       // 4. Tell the server. Server will bump its generation, cancel controllers, and process the new text.
//       requestSentTsRef.current = performance.now();
//       lastUserTextRef.current = newText;
//       conversation.addUserMessage(newText, { generation: localGenerationRef.current });

//       socketRef.current?.sendInterruption({
//         text: newText,
//         reason,
//         oldRequest: oldText,
//         interruptedMessageId: oldMessageId,
//         detectionLatencyMs: 0, // we detect at trigger point
//         audioStopLatencyMs: Math.round(stopLatency),
//       });
//     },
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//     []
//   );

//   // Called after a fresh user utterance completes (finalized STT result)
//   const submitUserSpeech = useCallback(
//     (text) => {
//       const trimmed = (text || '').trim();
//       if (!trimmed) return;

//       // If the AI is currently SPEAKING or TOOL_RUNNING or PROCESSING → treat as interruption
//       const currentState = state;
//       const shouldInterrupt =
//         currentState === VOICE_STATE.SPEAKING ||
//         currentState === VOICE_STATE.TOOL_RUNNING ||
//         currentState === VOICE_STATE.PROCESSING ||
//         audio.isPlaying;

//       if (shouldInterrupt) {
//         triggerInterruption(trimmed);
//         return;
//       }

//       // Normal turn
//       localGenerationRef.current += 1;
//       lastUserTextRef.current = trimmed;
//       requestSentTsRef.current = performance.now();
//       conversation.addUserMessage(trimmed, { generation: localGenerationRef.current });
//       setState(VOICE_STATE.PROCESSING);
//       socketRef.current?.sendUserSpeech(trimmed, { generation: localGenerationRef.current });
//     },
//     [state, audio.isPlaying, triggerInterruption, conversation]
//   );

//   // ─────────────── Speech recognition ───────────────
//   const setupRecognizer = useCallback(() => {
//     if (recognizerRef.current) return recognizerRef.current;
//     const rec = createRecognizer();
//     if (!rec) {
//       setRecognitionSupported(false);
//       return null;
//     }

//     rec.onstart = () => {
//       log('recognizer start');
//       recognizerActiveRef.current = true;
//       setMicActive(true);
//       setState((s) => (s === VOICE_STATE.SPEAKING || s === VOICE_STATE.TOOL_RUNNING ? s : VOICE_STATE.LISTENING));
//     };

//     rec.onspeechstart = () => {
//       speechStartTsRef.current = performance.now();
//       log('speech start');
//     };

//     rec.onresult = (event) => {
//       let interim = '';
//       let finalText = '';
//       for (let i = event.resultIndex; i < event.results.length; i++) {
//         const chunk = event.results[i];
//         if (chunk.isFinal) finalText += chunk[0].transcript;
//         else interim += chunk[0].transcript;
//       }

//       if (interim) {
//         interimBufferRef.current = interim;
//         setInterimText(interim);
//       }

//       if (finalText.trim()) {
//         interimBufferRef.current = '';
//         setInterimText('');
//         submitUserSpeech(finalText);
//       }
//     };

//     rec.onerror = (event) => {
//       log('recognizer error', event.error);
//       if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
//         setError('Microphone permission denied. Please allow microphone access.');
//         setMicActive(false);
//         recognizerActiveRef.current = false;
//       } else if (event.error === 'no-speech' || event.error === 'aborted') {
//         // benign, ignore
//       } else {
//         setError(`Recognition error: ${event.error}`);
//       }
//     };

//     rec.onend = () => {
//       log('recognizer end');
//       recognizerActiveRef.current = false;
//       setMicActive(false);
//       // Auto-restart if we still want the mic on
//       if (rec._shouldRestart) {
//         try { rec.start(); } catch {}
//       }
//     };

//     recognizerRef.current = rec;
//     return rec;
//   }, [submitUserSpeech]);

//   const startMic = useCallback(() => {
//     const rec = setupRecognizer();
//     if (!rec) return false;
//     rec._shouldRestart = true;
//     if (!recognizerActiveRef.current) {
//       try {
//         rec.start();
//         return true;
//       } catch (err) {
//         // Already started
//         if (err?.name === 'InvalidStateError') return true;
//         console.error('mic start failed', err);
//         setError('Could not start microphone.');
//         return false;
//       }
//     }
//     return true;
//   }, [setupRecognizer]);

//   const stopMic = useCallback(() => {
//     const rec = recognizerRef.current;
//     if (!rec) return;
//     rec._shouldRestart = false;
//     try { rec.stop(); } catch {}
//     setMicActive(false);
//     if (state === VOICE_STATE.LISTENING) setState(VOICE_STATE.IDLE);
//   }, [state]);

//   const toggleMic = useCallback(() => {
//     if (micActive) stopMic();
//     else startMic();
//   }, [micActive, startMic, stopMic]);

//   // ─────────────── Manual interruption (button click) ───────────────
//   const manualStop = useCallback(() => {
//     if (state === VOICE_STATE.SPEAKING || audio.isPlaying) {
//       // Bump local gen, stop audio, notify server, but no new text
//       localGenerationRef.current += 1;
//       interruption.markDetected({
//         oldGeneration: localGenerationRef.current - 1,
//         reason: INTERRUPTION_REASON.USER_CLICK,
//       });
//       const stopLatency = audio.stop();
//       interruption.markAudioStopped();
//       const oldMsgId = currentAssistantMsgIdRef.current;
//       if (oldMsgId) conversation.markInterrupted(oldMsgId, 0);
//       setState(VOICE_STATE.IDLE);
//       socketRef.current?.sendInterruption({
//         text: '',
//         reason: INTERRUPTION_REASON.USER_CLICK,
//         oldRequest: lastUserTextRef.current,
//         interruptedMessageId: oldMsgId,
//         audioStopLatencyMs: Math.round(stopLatency),
//       });
//     }
//   }, [state, audio, conversation, interruption]);

//   // ─────────────── Public helpers ───────────────
//   const sendText = useCallback(
//     (text) => submitUserSpeech(text),
//     [submitUserSpeech]
//   );

//   const updateConfig = useCallback((config) => {
//     socketRef.current?.updateConfig(config);
//   }, []);

//   const clearError = useCallback(() => setError(null), []);

//   const resetConversation = useCallback(() => {
//     audio.stop();
//     conversation.reset();
//     interruption.reset();
//     latency.reset();
//     setStaleBlockedCount(0);
//     setState(VOICE_STATE.IDLE);
//   }, [audio, conversation, interruption, latency]);

//   return {
//     // connection
//     connected,
//     sessionId,
//     conversationId,
//     rimeInfo,

//     // state machine
//     state,
//     error,
//     clearError,

//     // conversation
//     messages: conversation.messages,
//     interruptions: conversation.interruptions,
//     toolCalls: conversation.toolCalls,
//     interimText,
//     staleBlockedCount,

//     // metrics
//     metrics: latency.metrics,
//     getStats: latency.getStats,
//     interruptionHistory: interruption.history,

//     // mic
//     micActive,
//     startMic,
//     stopMic,
//     toggleMic,
//     recognitionSupported: supported && recognitionSupported,

//     // actions
//     sendText,
//     manualStop,
//     updateConfig,
//     resetConversation,

//     // audio state (for UI indicators)
//     isPlaying: audio.isPlaying,
//   };
// }














// /**
//  * useVoice — VoiceFlow orchestration hook
//  *
//  * IMPORTANT BEHAVIOUR:
//  * 1. User microphone is active only while listening to the user.
//  * 2. As soon as a final user sentence is received, recognition stops.
//  * 3. Microphone stays OFF while LLM/Rime is processing and speaking.
//  * 4. Microphone automatically resumes AFTER Rime audio ends.
//  * 5. AI's own voice can therefore NOT become a new user question.
//  */

// import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import { VoiceSocket } from '../api/voiceApi';
// import { useAudio } from './useAudio';
// import { useInterruption } from './useInterruption';
// import { useConversation } from './useConversation';
// import { useLatency } from './useLatency';
// import {
//   VOICE_STATE,
//   WS_MESSAGE_TYPES,
//   INTERRUPTION_REASON,
//   DEBUG,
// } from '../utils/constants';

// function log(...args) {
//   if (DEBUG) {
//     console.log('[voice]', ...args);
//   }
// }

// /**
//  * Create browser SpeechRecognition instance.
//  */
// function createRecognizer() {
//   if (typeof window === 'undefined') {
//     return null;
//   }

//   const SR =
//     window.SpeechRecognition ||
//     window.webkitSpeechRecognition;

//   if (!SR) {
//     return null;
//   }

//   const recognition = new SR();

//   // IMPORTANT:
//   // Continuous recognition is okay, but we explicitly stop it
//   // whenever the user utterance is finalized.
//   recognition.continuous = true;
//   recognition.interimResults = true;
//   recognition.lang = 'en-US';
//   recognition.maxAlternatives = 1;

//   return recognition;
// }

// export function useVoice({ autoConnect = true } = {}) {
//   // ─────────────────────────────────────────────
//   // Refs
//   // ─────────────────────────────────────────────

//   const socketRef = useRef(null);
//   const recognizerRef = useRef(null);

//   // Actual browser recognition state.
//   const recognizerActiveRef = useRef(false);

//   // Whether the user has enabled voice mode.
//   // This is different from recognizerActiveRef.
//   const voiceModeEnabledRef = useRef(false);

//   // Prevent the AI's own audio from being processed as user speech.
//   const assistantSpeakingRef = useRef(false);

//   // Prevent recognition from restarting during processing.
//   const assistantBusyRef = useRef(false);

//   const currentAssistantMsgIdRef = useRef(null);
//   const currentAssistantTextRef = useRef('');

//   const speechStartTsRef = useRef(null);
//   const interimBufferRef = useRef('');

//   const localGenerationRef = useRef(0);
//   const lastUserTextRef = useRef('');

//   const requestSentTsRef = useRef(null);

//   // ─────────────────────────────────────────────
//   // State
//   // ─────────────────────────────────────────────

//   const [connected, setConnected] = useState(false);
//   const [sessionId, setSessionId] = useState(null);
//   const [conversationId, setConversationId] = useState(null);

//   const [state, setState] = useState(VOICE_STATE.IDLE);

//   const [micActive, setMicActive] = useState(false);
//   const [interimText, setInterimText] = useState('');

//   const [rimeInfo, setRimeInfo] = useState(null);
//   const [error, setError] = useState(null);

//   const [recognitionSupported, setRecognitionSupported] =
//     useState(true);

//   const [staleBlockedCount, setStaleBlockedCount] =
//     useState(0);

//   // ─────────────────────────────────────────────
//   // Hooks
//   // ─────────────────────────────────────────────

//   const audio = useAudio();
//   const interruption = useInterruption();
//   const conversation = useConversation();
//   const latency = useLatency();

//   const supported = useMemo(() => {
//     if (typeof window === 'undefined') {
//       return false;
//     }

//     return Boolean(
//       window.SpeechRecognition ||
//       window.webkitSpeechRecognition
//     );
//   }, []);

//   // ─────────────────────────────────────────────
//   // INTERNAL: stop recognition immediately
//   // ─────────────────────────────────────────────

//   const stopRecognitionOnly = useCallback(() => {
//     const rec = recognizerRef.current;

//     if (!rec) {
//       recognizerActiveRef.current = false;
//       setMicActive(false);
//       return;
//     }

//     // NEVER allow automatic restart from onend.
//     rec._shouldRestart = false;

//     recognizerActiveRef.current = false;
//     setMicActive(false);

//     try {
//       rec.stop();
//     } catch {
//       // Already stopped.
//     }
//   }, []);

//   // ─────────────────────────────────────────────
//   // INTERNAL: pause microphone while AI works
//   // ─────────────────────────────────────────────

//   const pauseMicForAssistant = useCallback(() => {
//     log('Pausing microphone while assistant is active');

//     assistantBusyRef.current = true;
//     assistantSpeakingRef.current = true;

//     stopRecognitionOnly();

//     setInterimText('');
//     interimBufferRef.current = '';
//   }, [stopRecognitionOnly]);

//   // ─────────────────────────────────────────────
//   // SOCKET LIFECYCLE
//   // ─────────────────────────────────────────────

//   useEffect(() => {
//     if (!autoConnect) {
//       return undefined;
//     }

//     const socket = new VoiceSocket();

//     socketRef.current = socket;

//     const unsubConn = socket.onConnectionChange(
//       ({ connected }) => {
//         setConnected(connected);
//       }
//     );

//     const unsubHello = socket.on(
//       WS_MESSAGE_TYPES.HELLO,
//       (msg) => {
//         setSessionId(msg.sessionId);

//         if (msg.rime) {
//           setRimeInfo(msg.rime);
//         }

//         socket.startSession({});
//       }
//     );

//     const unsubSessionStart = socket.on(
//       WS_MESSAGE_TYPES.SESSION_STARTED,
//       (msg) => {
//         setConversationId(msg.conversationId);
//       }
//     );

//     const unsubState = socket.on(
//       WS_MESSAGE_TYPES.STATE_CHANGE,
//       (msg) => {
//         if (
//           msg.generation &&
//           msg.generation < localGenerationRef.current
//         ) {
//           log(
//             'state_change ignored — stale',
//             msg.generation
//           );
//           return;
//         }

//         setState(msg.state);
//       }
//     );

//     const unsubToolStart = socket.on(
//       WS_MESSAGE_TYPES.TOOL_STARTED,
//       (msg) => {
//         conversation.addToolCall({
//           callId: msg.callId,
//           toolName: msg.toolName,
//           args: msg.toolArgs,
//           generation: msg.generation,
//         });
//       }
//     );

//     const unsubToolDone = socket.on(
//       WS_MESSAGE_TYPES.TOOL_COMPLETED,
//       (msg) => {
//         conversation.updateToolCall(msg.callId, {
//           status: 'completed',
//           result: msg.result,
//           completedAt: Date.now(),
//         });
//       }
//     );

//     // ─────────────────────────────────────────
//     // LLM RESPONSE
//     // ─────────────────────────────────────────

//     const unsubLLM = socket.on(
//       WS_MESSAGE_TYPES.LLM_RESPONSE,
//       (msg) => {
//         if (
//           msg.generation &&
//           msg.generation < localGenerationRef.current
//         ) {
//           log(
//             'llm_response ignored — stale',
//             msg.generation
//           );
//           return;
//         }

//         // Absolutely make sure microphone is OFF.
//         pauseMicForAssistant();

//         const assistantMsg =
//           conversation.addAssistantMessage({
//             id: msg.messageId,
//             text: msg.text,
//             generation: msg.generation,
//             status: 'streaming',
//           });

//         currentAssistantMsgIdRef.current =
//           msg.messageId || assistantMsg.id;

//         currentAssistantTextRef.current =
//           msg.text || '';
//       }
//     );

//     // ─────────────────────────────────────────
//     // TTS AUDIO
//     // ─────────────────────────────────────────

//     const unsubAudio = socket.on(
//       WS_MESSAGE_TYPES.TTS_AUDIO,
//       async (msg) => {
//         const gen = msg.generation;

//         // AI is definitely speaking now.
//         pauseMicForAssistant();

//         // Stale generation protection.
//         if (
//           gen &&
//           gen < localGenerationRef.current
//         ) {
//           log(
//             'tts_audio DISCARDED — stale generation',
//             {
//               gen,
//               current:
//                 localGenerationRef.current,
//             }
//           );

//           setStaleBlockedCount(
//             (n) => n + 1
//           );

//           return;
//         }

//         // Latency tracking.
//         if (msg.totalLatencyMs != null) {
//           latency.record(
//             'endToEnd',
//             msg.totalLatencyMs
//           );
//         }

//         if (msg.latencyMs != null) {
//           latency.record(
//             'rime',
//             msg.latencyMs
//           );
//         }

//         if (requestSentTsRef.current) {
//           latency.record(
//             'firstAudio',
//             performance.now() -
//               requestSentTsRef.current
//           );

//           requestSentTsRef.current = null;
//         }

//         if (msg.recoveryLatencyMs != null) {
//           latency.record(
//             'recovery',
//             msg.recoveryLatencyMs
//           );
//         }

//         // Add assistant message.
//         const assistantMsg =
//           conversation.addAssistantMessage({
//             id: msg.messageId,
//             text: msg.text,
//             generation: gen,
//             status: 'complete',
//             audioDurationMs: msg.durationMs,
//             provider: msg.provider,
//             model: msg.model,
//             voice: msg.voice,
//           });

//         currentAssistantMsgIdRef.current =
//           msg.messageId || assistantMsg.id;

//         try {
//           const result = await audio.play({
//             base64: msg.audio,
//             mimeType: msg.mimeType,
//             generation: gen,
//             messageId: msg.messageId,

//             isStale: (generation) =>
//               generation <
//               localGenerationRef.current,
//           });

//           if (result?.blockedAsStale) {
//             setStaleBlockedCount(
//               (n) => n + 1
//             );

//             conversation.updateMessage(
//               msg.messageId,
//               {
//                 status: 'discarded',
//               }
//             );
//           }
//         } catch (err) {
//           console.error(
//             'audio.play failed',
//             err
//           );

//           setError(
//             err?.message ||
//               'Audio playback failed'
//           );
//         }
//       }
//     );

//     // ─────────────────────────────────────────
//     // INTERRUPTION ACK
//     // ─────────────────────────────────────────

//     const unsubInterruptionAck = socket.on(
//       WS_MESSAGE_TYPES.INTERRUPTION_ACK,
//       (msg) => {
//         log(
//           'interruption_ack',
//           msg
//         );

//         setState(
//           VOICE_STATE.RECOVERING
//         );

//         conversation.addInterruption({
//           oldGeneration:
//             msg.newGeneration - 1,

//           newGeneration:
//             msg.newGeneration,

//           cancelledCount:
//             msg.cancelledCount,

//           detectedAt:
//             interruption.current()
//               ?.detectedAt,

//           audioStopLatencyMs:
//             interruption.current()
//               ?.audioStopLatencyMs,
//         });
//       }
//     );

//     // ─────────────────────────────────────────
//     // STALE RESPONSE
//     // ─────────────────────────────────────────

//     const unsubStale = socket.on(
//       WS_MESSAGE_TYPES.STALE_RESPONSE_BLOCKED,
//       (msg) => {
//         log(
//           'server signalled stale_response_blocked',
//           msg
//         );

//         setStaleBlockedCount(
//           (n) => n + 1
//         );
//       }
//     );

//     // ─────────────────────────────────────────
//     // ERROR
//     // ─────────────────────────────────────────

//     const unsubError = socket.on(
//       WS_MESSAGE_TYPES.ERROR,
//       (msg) => {
//         console.warn(
//           'WS error msg:',
//           msg
//         );

//         setError(
//           msg.message ||
//             'Unknown error'
//         );
//       }
//     );

//     socket.connect();

//     // Cleanup.
//     return () => {
//       stopRecognitionOnly();

//       unsubConn();
//       unsubHello();
//       unsubSessionStart();
//       unsubState();
//       unsubToolStart();
//       unsubToolDone();
//       unsubLLM();
//       unsubAudio();
//       unsubInterruptionAck();
//       unsubStale();
//       unsubError();

//       socket.disconnect();

//       socketRef.current = null;
//     };

//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [autoConnect]);

//   // ─────────────────────────────────────────────
//   // AUDIO → VOICE STATE
//   // ─────────────────────────────────────────────

//   useEffect(() => {
//     const unsubscribe =
//       audio.subscribe((event) => {
//         // Audio actually started.
//         if (event.type === 'play') {
//           assistantSpeakingRef.current =
//             true;

//           assistantBusyRef.current =
//             true;

//           // CRITICAL:
//           // microphone MUST be stopped
//           // while Rime is talking.
//           stopRecognitionOnly();

//           const rec =
//             interruption.current();

//           if (rec) {
//             interruption.markRecovered({
//               newGeneration:
//                 localGenerationRef.current,
//             });

//             setState(
//               VOICE_STATE.SPEAKING
//             );
//           } else {
//             setState(
//               VOICE_STATE.SPEAKING
//             );
//           }
//         }

//         // Audio finished naturally.
//         if (event.type === 'ended') {
//           if (
//             event.generation &&
//             event.generation <
//               localGenerationRef.current
//           ) {
//             return;
//           }

//           log(
//             'Assistant audio ended'
//           );

//           assistantSpeakingRef.current =
//             false;

//           assistantBusyRef.current =
//             false;

//           setState(
//             VOICE_STATE.COMPLETED
//           );

//           // IMPORTANT:
//           // Resume microphone ONLY if
//           // user originally enabled voice mode.
//           if (
//             voiceModeEnabledRef.current
//           ) {
//             setTimeout(() => {
//               if (
//                 !voiceModeEnabledRef.current
//               ) {
//                 return;
//               }

//               if (
//                 assistantBusyRef.current ||
//                 assistantSpeakingRef.current
//               ) {
//                 return;
//               }

//               startMicInternal();
//             }, 150);
//           }
//         }

//         // Audio manually stopped.
//         if (event.type === 'stopped') {
//           assistantSpeakingRef.current =
//             false;

//           assistantBusyRef.current =
//             false;
//         }

//         // Audio error.
//         if (event.type === 'error') {
//           assistantSpeakingRef.current =
//             false;

//           assistantBusyRef.current =
//             false;
//         }
//       });

//     return unsubscribe;

//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   // ─────────────────────────────────────────────
//   // INTERRUPTION
//   // ─────────────────────────────────────────────

//   const triggerInterruption =
//     useCallback(
//       (
//         newText,
//         reason =
//           INTERRUPTION_REASON.USER_SPEECH
//       ) => {
//         const oldMessageId =
//           currentAssistantMsgIdRef.current;

//         const oldText =
//           currentAssistantTextRef.current;

//         // New generation immediately.
//         localGenerationRef.current += 1;

//         const interruptionRecord =
//           interruption.markDetected({
//             oldGeneration:
//               localGenerationRef.current -
//               1,

//             oldRequest:
//               lastUserTextRef.current,

//             newRequest: newText,

//             reason,
//           });

//         // Stop AI audio.
//         const stopLatency =
//           audio.stop();

//         interruption.markAudioStopped();

//         // Stop recognition while
//         // interruption is being processed.
//         stopRecognitionOnly();

//         if (oldMessageId) {
//           conversation.markInterrupted(
//             oldMessageId,
//             0
//           );
//         }

//         setState(
//           VOICE_STATE.INTERRUPTED
//         );

//         requestSentTsRef.current =
//           performance.now();

//         lastUserTextRef.current =
//           newText;

//         conversation.addUserMessage(
//           newText,
//           {
//             generation:
//               localGenerationRef.current,
//           }
//         );

//         socketRef.current?.sendInterruption({
//           text: newText,

//           reason,

//           oldRequest: oldText,

//           interruptedMessageId:
//             oldMessageId,

//           detectionLatencyMs: 0,

//           audioStopLatencyMs:
//             Math.round(stopLatency),
//         });

//         return interruptionRecord;
//       },
//       [
//         audio,
//         conversation,
//         interruption,
//         stopRecognitionOnly,
//       ]
//     );

//   // ─────────────────────────────────────────────
//   // SUBMIT USER SPEECH
//   // ─────────────────────────────────────────────

//   const submitUserSpeech =
//     useCallback(
//       (text) => {
//         const trimmed =
//           (text || '').trim();

//         if (!trimmed) {
//           return;
//         }

//         // NEVER process recognition results
//         // while assistant is speaking.
//         if (
//           assistantSpeakingRef.current ||
//           assistantBusyRef.current
//         ) {
//           log(
//             'Ignoring speech because assistant is active:',
//             trimmed
//           );

//           return;
//         }

//         // Stop recognition immediately
//         // before sending the user's message.
//         stopRecognitionOnly();

//         localGenerationRef.current += 1;

//         lastUserTextRef.current =
//           trimmed;

//         requestSentTsRef.current =
//           performance.now();

//         conversation.addUserMessage(
//           trimmed,
//           {
//             generation:
//               localGenerationRef.current,
//           }
//         );

//         assistantBusyRef.current =
//           true;

//         setState(
//           VOICE_STATE.PROCESSING
//         );

//         socketRef.current?.sendUserSpeech(
//           trimmed,
//           {
//             generation:
//               localGenerationRef.current,
//           }
//         );
//       },
//       [
//         conversation,
//         stopRecognitionOnly,
//       ]
//     );

//   // ─────────────────────────────────────────────
//   // SPEECH RECOGNIZER SETUP
//   // ─────────────────────────────────────────────

//   const setupRecognizer =
//     useCallback(() => {
//       if (recognizerRef.current) {
//         return recognizerRef.current;
//       }

//       const rec =
//         createRecognizer();

//       if (!rec) {
//         setRecognitionSupported(
//           false
//         );

//         return null;
//       }

//       // Custom flag.
//       rec._shouldRestart = false;

//       // ─────────────────────────────────
//       // Recognition started
//       // ─────────────────────────────────

//       rec.onstart = () => {
//         // Do NOT allow recognition to start
//         // while AI is talking.
//         if (
//           assistantSpeakingRef.current ||
//           assistantBusyRef.current
//         ) {
//           log(
//             'Recognition start blocked — assistant active'
//           );

//           try {
//             rec.stop();
//           } catch {}

//           return;
//         }

//         log(
//           'recognizer start'
//         );

//         recognizerActiveRef.current =
//           true;

//         setMicActive(true);

//         setState(
//           VOICE_STATE.LISTENING
//         );
//       };

//       // ─────────────────────────────────
//       // Speech started
//       // ─────────────────────────────────

//       rec.onspeechstart = () => {
//         if (
//           assistantSpeakingRef.current ||
//           assistantBusyRef.current
//         ) {
//           return;
//         }

//         speechStartTsRef.current =
//           performance.now();

//         log(
//           'speech start'
//         );
//       };

//       // ─────────────────────────────────
//       // Recognition result
//       // ─────────────────────────────────

//       rec.onresult = (event) => {
//         // CRITICAL SAFETY CHECK.
//         if (
//           assistantSpeakingRef.current ||
//           assistantBusyRef.current
//         ) {
//           log(
//             'Ignoring recognition result — assistant active'
//           );

//           return;
//         }

//         let interim = '';
//         let finalText = '';

//         for (
//           let i = event.resultIndex;
//           i < event.results.length;
//           i++
//         ) {
//           const chunk =
//             event.results[i];

//           if (chunk.isFinal) {
//             finalText +=
//               chunk[0].transcript;
//           } else {
//             interim +=
//               chunk[0].transcript;
//           }
//         }

//         if (interim) {
//           interimBufferRef.current =
//             interim;

//           setInterimText(
//             interim
//           );
//         }

//         if (
//           finalText.trim()
//         ) {
//           const userText =
//             finalText.trim();

//           // Clear interim immediately.
//           interimBufferRef.current =
//             '';

//           setInterimText('');

//           // STOP microphone BEFORE
//           // sending to LLM.
//           stopRecognitionOnly();

//           // Send user text.
//           submitUserSpeech(
//             userText
//           );
//         }
//       };

//       // ─────────────────────────────────
//       // Recognition error
//       // ─────────────────────────────────

//       rec.onerror = (event) => {
//         log(
//           'recognizer error',
//           event.error
//         );

//         recognizerActiveRef.current =
//           false;

//         setMicActive(false);

//         if (
//           event.error ===
//             'not-allowed' ||
//           event.error ===
//             'service-not-allowed'
//         ) {
//           voiceModeEnabledRef.current =
//             false;

//           setError(
//             'Microphone permission denied. Please allow microphone access.'
//           );

//           return;
//         }

//         if (
//           event.error ===
//             'no-speech' ||
//           event.error ===
//             'aborted'
//         ) {
//           return;
//         }

//         setError(
//           `Recognition error: ${event.error}`
//         );
//       };

//       // ─────────────────────────────────
//       // Recognition ended
//       // ─────────────────────────────────

//       rec.onend = () => {
//         log(
//           'recognizer end'
//         );

//         recognizerActiveRef.current =
//           false;

//         setMicActive(false);

//         // NEVER restart while assistant
//         // is processing/speaking.
//         if (
//           assistantSpeakingRef.current ||
//           assistantBusyRef.current
//         ) {
//           log(
//             'Recognizer will remain OFF — assistant active'
//           );

//           return;
//         }

//         // Restart ONLY when explicitly allowed.
//         if (
//           rec._shouldRestart &&
//           voiceModeEnabledRef.current
//         ) {
//           setTimeout(() => {
//             if (
//               !voiceModeEnabledRef.current
//             ) {
//               return;
//             }

//             if (
//               assistantSpeakingRef.current ||
//               assistantBusyRef.current
//             ) {
//               return;
//             }

//             if (
//               !recognizerActiveRef.current
//             ) {
//               try {
//                 rec.start();
//               } catch {
//                 // Browser may already be starting.
//               }
//             }
//           }, 100);
//         }
//       };

//       recognizerRef.current =
//         rec;

//       return rec;
//     }, [
//       stopRecognitionOnly,
//       submitUserSpeech,
//     ]);

//   // ─────────────────────────────────────────────
//   // INTERNAL START MIC
//   // ─────────────────────────────────────────────

//   const startMicInternal =
//     useCallback(() => {
//       const rec =
//         setupRecognizer();

//       if (!rec) {
//         return false;
//       }

//       // NEVER start during AI response.
//       if (
//         assistantSpeakingRef.current ||
//         assistantBusyRef.current
//       ) {
//         log(
//           'startMicInternal blocked — assistant active'
//         );

//         return false;
//       }

//       rec._shouldRestart = true;

//       if (
//         !recognizerActiveRef.current
//       ) {
//         try {
//           rec.start();

//           return true;
//         } catch (err) {
//           if (
//             err?.name ===
//             'InvalidStateError'
//           ) {
//             return true;
//           }

//           console.error(
//             'mic start failed',
//             err
//           );

//           setError(
//             'Could not start microphone.'
//           );

//           return false;
//         }
//       }

//       return true;
//     }, [setupRecognizer]);

//   // ─────────────────────────────────────────────
//   // PUBLIC START MIC
//   // ─────────────────────────────────────────────

//   const startMic =
//     useCallback(() => {
//       // User explicitly enabled voice mode.
//       voiceModeEnabledRef.current =
//         true;

//       // If assistant is active,
//       // remember the user's choice but
//       // do NOT start microphone yet.
//       if (
//         assistantSpeakingRef.current ||
//         assistantBusyRef.current
//       ) {
//         log(
//           'Voice mode enabled; mic will resume after assistant finishes'
//         );

//         return true;
//       }

//       return startMicInternal();
//     }, [startMicInternal]);

//   // ─────────────────────────────────────────────
//   // PUBLIC STOP MIC
//   // ─────────────────────────────────────────────

//   const stopMic =
//     useCallback(() => {
//       // User explicitly disabled voice mode.
//       voiceModeEnabledRef.current =
//         false;

//       stopRecognitionOnly();

//       setInterimText('');

//       if (
//         state ===
//         VOICE_STATE.LISTENING
//       ) {
//         setState(
//           VOICE_STATE.IDLE
//         );
//       }
//     }, [
//       state,
//       stopRecognitionOnly,
//     ]);

//   // ─────────────────────────────────────────────
//   // TOGGLE MIC
//   // ─────────────────────────────────────────────

//   const toggleMic =
//     useCallback(() => {
//       if (micActive) {
//         stopMic();
//       } else {
//         startMic();
//       }
//     }, [
//       micActive,
//       startMic,
//       stopMic,
//     ]);

//   // ─────────────────────────────────────────────
//   // MANUAL STOP / INTERRUPTION
//   // ─────────────────────────────────────────────

//   const manualStop =
//     useCallback(() => {
//       if (
//         state ===
//           VOICE_STATE.SPEAKING ||
//         audio.isPlaying
//       ) {
//         // Disable recognition first.
//         stopRecognitionOnly();

//         // New generation.
//         localGenerationRef.current += 1;

//         interruption.markDetected({
//           oldGeneration:
//             localGenerationRef.current -
//             1,

//           reason:
//             INTERRUPTION_REASON.USER_CLICK,
//         });

//         const stopLatency =
//           audio.stop();

//         interruption.markAudioStopped();

//         const oldMsgId =
//           currentAssistantMsgIdRef.current;

//         if (oldMsgId) {
//           conversation.markInterrupted(
//             oldMsgId,
//             0
//           );
//         }

//         assistantSpeakingRef.current =
//           false;

//         assistantBusyRef.current =
//           false;

//         setState(
//           VOICE_STATE.IDLE
//         );

//         socketRef.current?.sendInterruption({
//           text: '',

//           reason:
//             INTERRUPTION_REASON.USER_CLICK,

//           oldRequest:
//             lastUserTextRef.current,

//           interruptedMessageId:
//             oldMsgId,

//           audioStopLatencyMs:
//             Math.round(
//               stopLatency
//             ),
//         });

//         // If voice mode is enabled,
//         // start listening again.
//         if (
//           voiceModeEnabledRef.current
//         ) {
//           setTimeout(() => {
//             startMicInternal();
//           }, 150);
//         }
//       }
//     }, [
//       state,
//       audio,
//       conversation,
//       interruption,
//       stopRecognitionOnly,
//       startMicInternal,
//     ]);

//   // ─────────────────────────────────────────────
//   // SEND TEXT
//   // ─────────────────────────────────────────────

//   const sendText =
//     useCallback(
//       (text) => {
//         // Text input should also prevent
//         // accidental mic capture.
//         stopRecognitionOnly();

//         submitUserSpeech(text);
//       },
//       [
//         stopRecognitionOnly,
//         submitUserSpeech,
//       ]
//     );

//   // ─────────────────────────────────────────────
//   // CONFIG
//   // ─────────────────────────────────────────────

//   const updateConfig =
//     useCallback((config) => {
//       socketRef.current?.updateConfig(
//         config
//       );
//     }, []);

//   // ─────────────────────────────────────────────
//   // ERROR
//   // ─────────────────────────────────────────────

//   const clearError =
//     useCallback(() => {
//       setError(null);
//     }, []);

//   // ─────────────────────────────────────────────
//   // RESET
//   // ─────────────────────────────────────────────

//   const resetConversation =
//     useCallback(() => {
//       stopRecognitionOnly();

//       audio.stop();

//       assistantSpeakingRef.current =
//         false;

//       assistantBusyRef.current =
//         false;

//       voiceModeEnabledRef.current =
//         false;

//       conversation.reset();
//       interruption.reset();
//       latency.reset();

//       setStaleBlockedCount(0);
//       setInterimText('');
//       setState(
//         VOICE_STATE.IDLE
//       );
//     }, [
//       audio,
//       conversation,
//       interruption,
//       latency,
//       stopRecognitionOnly,
//     ]);

//   // ─────────────────────────────────────────────
//   // FINAL CLEANUP
//   // ─────────────────────────────────────────────

//   useEffect(() => {
//     return () => {
//       voiceModeEnabledRef.current =
//         false;

//       assistantSpeakingRef.current =
//         false;

//       assistantBusyRef.current =
//         false;

//       const rec =
//         recognizerRef.current;

//       if (rec) {
//         rec._shouldRestart = false;

//         try {
//           rec.stop();
//         } catch {}
//       }
//     };
//   }, []);

//   // ─────────────────────────────────────────────
//   // PUBLIC API
//   // ─────────────────────────────────────────────

//   return {
//     // Connection
//     connected,
//     sessionId,
//     conversationId,
//     rimeInfo,

//     // State
//     state,
//     error,
//     clearError,

//     // Conversation
//     messages: conversation.messages,
//     interruptions:
//       conversation.interruptions,
//     toolCalls: conversation.toolCalls,
//     interimText,
//     staleBlockedCount,

//     // Metrics
//     metrics: latency.metrics,
//     getStats: latency.getStats,
//     interruptionHistory:
//       interruption.history,

//     // Microphone
//     micActive,
//     startMic,
//     stopMic,
//     toggleMic,
//     recognitionSupported:
//       supported &&
//       recognitionSupported,

//     // Actions
//     sendText,
//     manualStop,
//     updateConfig,
//     resetConversation,

//     // Audio
//     isPlaying: audio.isPlaying,
//   };
// }



























/**
 * useVoice — VoiceFlow voice orchestration
 *
 * Behavior:
 * 1. User clicks microphone.
 * 2. Browser listens for ONE utterance.
 * 3. Recognition automatically stops after the utterance.
 * 4. User speech is sent to the backend.
 * 5. AI responds with Rime TTS.
 * 6. Microphone remains OFF while AI is speaking.
 * 7. User clicks microphone again for the next turn.
 *
 * This prevents the microphone from hearing the AI's own voice.
 */

// import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import { VoiceSocket } from '../api/voiceApi';
// import { useAudio } from './useAudio';
// import { useInterruption } from './useInterruption';
// import { useConversation } from './useConversation';
// import { useLatency } from './useLatency';
// import {
//   VOICE_STATE,
//   WS_MESSAGE_TYPES,
//   INTERRUPTION_REASON,
//   DEBUG,
// } from '../utils/constants';

// function log(...args) {
//   if (DEBUG) {
//     console.log('[voice]', ...args);
//   }
// }

// /**
//  * Create a NEW speech recognizer for every microphone session.
//  *
//  * Important:
//  * continuous = false
//  *
//  * This means:
//  * one click -> one utterance -> recognition ends.
//  */
// function createRecognizer() {
//   if (typeof window === 'undefined') {
//     return null;
//   }

//   const SpeechRecognition =
//     window.SpeechRecognition || window.webkitSpeechRecognition;

//   if (!SpeechRecognition) {
//     return null;
//   }

//   const recognizer = new SpeechRecognition();

//   recognizer.continuous = false;
//   recognizer.interimResults = true;
//   recognizer.lang = 'en-US';
//   recognizer.maxAlternatives = 1;

//   return recognizer;
// }

// export function useVoice({ autoConnect = true } = {}) {
//   // =========================================================
//   // REFS
//   // =========================================================

//   const socketRef = useRef(null);

//   const recognizerRef = useRef(null);
//   const recognizerActiveRef = useRef(false);

//   const currentAssistantMsgIdRef = useRef(null);
//   const currentAssistantTextRef = useRef('');

//   const speechStartTsRef = useRef(null);
//   const interimBufferRef = useRef('');

//   const localGenerationRef = useRef(0);

//   const lastUserTextRef = useRef('');
//   const requestSentTsRef = useRef(null);

//   // Prevent duplicate final-result submissions.
//   const finalResultHandledRef = useRef(false);

//   // =========================================================
//   // STATE
//   // =========================================================

//   const [connected, setConnected] = useState(false);
//   const [sessionId, setSessionId] = useState(null);
//   const [conversationId, setConversationId] = useState(null);

//   const [state, setState] = useState(VOICE_STATE.IDLE);

//   const [micActive, setMicActive] = useState(false);

//   const [interimText, setInterimText] = useState('');

//   const [rimeInfo, setRimeInfo] = useState(null);

//   const [error, setError] = useState(null);

//   const [recognitionSupported, setRecognitionSupported] =
//     useState(true);

//   const [staleBlockedCount, setStaleBlockedCount] = useState(0);

//   // =========================================================
//   // HOOKS
//   // =========================================================

//   const audio = useAudio();
//   const interruption = useInterruption();
//   const conversation = useConversation();
//   const latency = useLatency();

//   // =========================================================
//   // BROWSER SUPPORT
//   // =========================================================

//   const supported = useMemo(() => {
//     if (typeof window === 'undefined') {
//       return false;
//     }

//     return !!(
//       window.SpeechRecognition ||
//       window.webkitSpeechRecognition
//     );
//   }, []);

//   // =========================================================
//   // SOCKET LIFECYCLE
//   // =========================================================

//   useEffect(() => {
//     if (!autoConnect) {
//       return;
//     }

//     const socket = new VoiceSocket();

//     socketRef.current = socket;

//     const unsubConn = socket.onConnectionChange(({ connected }) => {
//       setConnected(connected);
//     });

//     const unsubHello = socket.on(
//       WS_MESSAGE_TYPES.HELLO,
//       (msg) => {
//         setSessionId(msg.sessionId);

//         if (msg.rime) {
//           setRimeInfo(msg.rime);
//         }

//         socket.startSession({});
//       }
//     );

//     const unsubSessionStart = socket.on(
//       WS_MESSAGE_TYPES.SESSION_STARTED,
//       (msg) => {
//         setConversationId(msg.conversationId);
//       }
//     );

//     const unsubState = socket.on(
//       WS_MESSAGE_TYPES.STATE_CHANGE,
//       (msg) => {
//         if (
//           msg.generation &&
//           msg.generation < localGenerationRef.current
//         ) {
//           log('state_change ignored — stale', msg);
//           return;
//         }

//         setState(msg.state);
//       }
//     );

//     const unsubToolStart = socket.on(
//       WS_MESSAGE_TYPES.TOOL_STARTED,
//       (msg) => {
//         conversation.addToolCall({
//           callId: msg.callId,
//           toolName: msg.toolName,
//           args: msg.toolArgs,
//           generation: msg.generation,
//         });
//       }
//     );

//     const unsubToolDone = socket.on(
//       WS_MESSAGE_TYPES.TOOL_COMPLETED,
//       (msg) => {
//         conversation.updateToolCall(msg.callId, {
//           status: 'completed',
//           result: msg.result,
//           completedAt: Date.now(),
//         });
//       }
//     );

//     const unsubLLM = socket.on(
//       WS_MESSAGE_TYPES.LLM_RESPONSE,
//       (msg) => {
//         if (
//           msg.generation &&
//           msg.generation < localGenerationRef.current
//         ) {
//           log('llm_response ignored — stale', msg.generation);
//           return;
//         }

//         const assistantMsg =
//           conversation.addAssistantMessage({
//             id: msg.messageId,
//             text: msg.text,
//             generation: msg.generation,
//             status: 'streaming',
//           });

//         currentAssistantMsgIdRef.current =
//           msg.messageId || assistantMsg.id;

//         currentAssistantTextRef.current = msg.text;
//       }
//     );

//     const unsubAudio = socket.on(
//       WS_MESSAGE_TYPES.TTS_AUDIO,
//       async (msg) => {
//         const gen = msg.generation;

//         // -----------------------------------------------------
//         // Stale response protection
//         // -----------------------------------------------------

//         if (
//           gen &&
//           gen < localGenerationRef.current
//         ) {
//           log(
//             'tts_audio DISCARDED — stale generation',
//             {
//               gen,
//               current: localGenerationRef.current,
//             }
//           );

//           setStaleBlockedCount((n) => n + 1);

//           return;
//         }

//         // -----------------------------------------------------
//         // Latency
//         // -----------------------------------------------------

//         if (msg.totalLatencyMs != null) {
//           latency.record(
//             'endToEnd',
//             msg.totalLatencyMs
//           );
//         }

//         if (msg.latencyMs != null) {
//           latency.record(
//             'rime',
//             msg.latencyMs
//           );
//         }

//         if (requestSentTsRef.current) {
//           latency.record(
//             'firstAudio',
//             performance.now() -
//               requestSentTsRef.current
//           );

//           requestSentTsRef.current = null;
//         }

//         if (msg.recoveryLatencyMs != null) {
//           latency.record(
//             'recovery',
//             msg.recoveryLatencyMs
//           );
//         }

//         // -----------------------------------------------------
//         // Add assistant message
//         // -----------------------------------------------------

//         const assistantMsg =
//           conversation.addAssistantMessage({
//             id: msg.messageId,
//             text: msg.text,
//             generation: gen,
//             status: 'complete',
//             audioDurationMs: msg.durationMs,
//             provider: msg.provider,
//             model: msg.model,
//             voice: msg.voice,
//           });

//         currentAssistantMsgIdRef.current =
//           msg.messageId || assistantMsg.id;

//         // -----------------------------------------------------
//         // IMPORTANT:
//         // Do NOT start SpeechRecognition here.
//         //
//         // The microphone must remain OFF while
//         // the AI is speaking.
//         // -----------------------------------------------------

//         try {
//           const result = await audio.play({
//             base64: msg.audio,
//             mimeType: msg.mimeType,
//             generation: gen,
//             messageId: msg.messageId,

//             isStale: (g) =>
//               g < localGenerationRef.current,
//           });

//           if (result?.blockedAsStale) {
//             setStaleBlockedCount((n) => n + 1);

//             conversation.updateMessage(
//               msg.messageId,
//               {
//                 status: 'discarded',
//               }
//             );
//           }
//         } catch (err) {
//           console.error(
//             'audio.play failed',
//             err
//           );

//           setError(
//             err?.message ||
//               'Audio playback failed'
//           );
//         }
//       }
//     );

//     const unsubInterruptionAck = socket.on(
//       WS_MESSAGE_TYPES.INTERRUPTION_ACK,
//       (msg) => {
//         log(
//           'interruption_ack',
//           msg
//         );

//         setState(
//           VOICE_STATE.RECOVERING
//         );

//         conversation.addInterruption({
//           oldGeneration:
//             msg.newGeneration - 1,

//           newGeneration:
//             msg.newGeneration,

//           cancelledCount:
//             msg.cancelledCount,

//           detectedAt:
//             interruption.current()
//               ?.detectedAt,

//           audioStopLatencyMs:
//             interruption.current()
//               ?.audioStopLatencyMs,
//         });
//       }
//     );

//     const unsubStale = socket.on(
//       WS_MESSAGE_TYPES.STALE_RESPONSE_BLOCKED,
//       (msg) => {
//         log(
//           'server signalled stale_response_blocked',
//           msg
//         );

//         setStaleBlockedCount(
//           (n) => n + 1
//         );
//       }
//     );

//     const unsubError = socket.on(
//       WS_MESSAGE_TYPES.ERROR,
//       (msg) => {
//         console.warn(
//           'WS error msg:',
//           msg
//         );

//         setError(
//           msg.message ||
//             'Unknown error'
//         );
//       }
//     );

//     socket.connect();

//     return () => {
//       unsubConn();
//       unsubHello();
//       unsubSessionStart();
//       unsubState();
//       unsubToolStart();
//       unsubToolDone();
//       unsubLLM();
//       unsubAudio();
//       unsubInterruptionAck();
//       unsubStale();
//       unsubError();

//       socket.disconnect();

//       socketRef.current = null;
//     };
//   }, [autoConnect]);

//   // =========================================================
//   // AUDIO → STATE
//   // =========================================================

//   useEffect(() => {
//     const unsub = audio.subscribe(
//       (event) => {
//         if (event.type === 'play') {
//           const recovery =
//             interruption.current();

//           if (recovery) {
//             interruption.markRecovered({
//               newGeneration:
//                 localGenerationRef.current,
//             });
//           }

//           // AI is speaking.
//           //
//           // IMPORTANT:
//           // mic remains OFF.
//           setMicActive(false);

//           setState(
//             VOICE_STATE.SPEAKING
//           );
//         }

//         if (event.type === 'ended') {
//           if (
//             event.generation &&
//             event.generation >=
//               localGenerationRef.current
//           ) {
//             setState(
//               VOICE_STATE.COMPLETED
//             );
//           }

//           // Always make sure mic is OFF
//           // when AI finishes.
//           setMicActive(false);
//         }

//         if (
//           event.type === 'stopped' ||
//           event.type === 'pause'
//         ) {
//           setMicActive(false);
//         }
//       }
//     );

//     return unsub;
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   // =========================================================
//   // INTERRUPTION
//   // =========================================================

//   const triggerInterruption = useCallback(
//     (
//       newText,
//       reason = INTERRUPTION_REASON.USER_SPEECH
//     ) => {
//       const oldMessageId =
//         currentAssistantMsgIdRef.current;

//       const oldText =
//         currentAssistantTextRef.current;

//       // Stop recognition immediately.
//       const recognizer =
//         recognizerRef.current;

//       if (recognizer) {
//         try {
//           recognizer.abort();
//         } catch {}

//         recognizerRef.current = null;
//       }

//       recognizerActiveRef.current = false;

//       setMicActive(false);

//       // -----------------------------------------------------
//       // New generation
//       // -----------------------------------------------------

//       localGenerationRef.current += 1;

//       interruption.markDetected({
//         oldGeneration:
//           localGenerationRef.current - 1,

//         oldRequest:
//           lastUserTextRef.current,

//         newRequest:
//           newText,

//         reason,
//       });

//       // -----------------------------------------------------
//       // Stop current AI audio
//       // -----------------------------------------------------

//       const stopLatency =
//         audio.stop();

//       interruption.markAudioStopped();

//       // -----------------------------------------------------
//       // Mark old message interrupted
//       // -----------------------------------------------------

//       if (oldMessageId) {
//         conversation.markInterrupted(
//           oldMessageId,
//           0
//         );
//       }

//       setState(
//         VOICE_STATE.INTERRUPTED
//       );

//       // -----------------------------------------------------
//       // Send interruption to backend
//       // -----------------------------------------------------

//       requestSentTsRef.current =
//         performance.now();

//       lastUserTextRef.current =
//         newText;

//       conversation.addUserMessage(
//         newText,
//         {
//           generation:
//             localGenerationRef.current,
//         }
//       );

//       socketRef.current?.sendInterruption({
//         text: newText,

//         reason,

//         oldRequest: oldText,

//         interruptedMessageId:
//           oldMessageId,

//         detectionLatencyMs: 0,

//         audioStopLatencyMs:
//           Math.round(stopLatency),
//       });
//     },
//     [
//       audio,
//       conversation,
//       interruption,
//     ]
//   );

//   // =========================================================
//   // SUBMIT USER SPEECH
//   // =========================================================

//   const submitUserSpeech =
//     useCallback(
//       (text) => {
//         const trimmed =
//           (text || '').trim();

//         if (!trimmed) {
//           return;
//         }

//         // ---------------------------------------------------
//         // User speech means microphone session is over.
//         // ---------------------------------------------------

//         const recognizer =
//           recognizerRef.current;

//         if (recognizer) {
//           try {
//             recognizer.stop();
//           } catch {}
//         }

//         recognizerActiveRef.current =
//           false;

//         setMicActive(false);

//         // ---------------------------------------------------
//         // Prevent AI from hearing itself.
//         // ---------------------------------------------------

//         const currentState = state;

//         const shouldInterrupt =
//           currentState ===
//             VOICE_STATE.SPEAKING ||
//           currentState ===
//             VOICE_STATE.TOOL_RUNNING ||
//           currentState ===
//             VOICE_STATE.PROCESSING ||
//           audio.isPlaying;

//         if (shouldInterrupt) {
//           triggerInterruption(
//             trimmed,
//             INTERRUPTION_REASON.USER_SPEECH
//           );

//           return;
//         }

//         // ---------------------------------------------------
//         // Normal new conversation turn
//         // ---------------------------------------------------

//         localGenerationRef.current += 1;

//         lastUserTextRef.current =
//           trimmed;

//         requestSentTsRef.current =
//           performance.now();

//         conversation.addUserMessage(
//           trimmed,
//           {
//             generation:
//               localGenerationRef.current,
//           }
//         );

//         setState(
//           VOICE_STATE.PROCESSING
//         );

//         socketRef.current?.sendUserSpeech(
//           trimmed,
//           {
//             generation:
//               localGenerationRef.current,
//           }
//         );
//       },
//       [
//         state,
//         audio.isPlaying,
//         triggerInterruption,
//         conversation,
//       ]
//     );

//   // =========================================================
//   // SPEECH RECOGNITION
//   // =========================================================

//   const startMic = useCallback(() => {
//     // -------------------------------------------------------
//     // Don't open microphone while another recognition
//     // session is already active.
//     // -------------------------------------------------------

//     if (recognizerActiveRef.current) {
//       return true;
//     }

//     // -------------------------------------------------------
//     // Don't allow automatic microphone activation while
//     // AI is speaking.
//     //
//     // User can still explicitly click the mic to interrupt.
//     // -------------------------------------------------------

//     const aiSpeaking =
//       state === VOICE_STATE.SPEAKING ||
//       audio.isPlaying;

//     // We allow explicit click during AI speaking
//     // so the user can interrupt.
//     // It will listen only to ONE utterance.

//     // -------------------------------------------------------
//     // Create a FRESH recognizer every time.
//     // -------------------------------------------------------

//     const rec =
//       createRecognizer();

//     if (!rec) {
//       setRecognitionSupported(false);

//       setError(
//         'Your browser does not support Speech Recognition. Use Chrome or Edge, or type your message below.'
//       );

//       return false;
//     }

//     // New session.
//     finalResultHandledRef.current =
//       false;

//     interimBufferRef.current = '';

//     setInterimText('');

//     recognizerRef.current = rec;

//     // -------------------------------------------------------
//     // START
//     // -------------------------------------------------------

//     rec.onstart = () => {
//       log('recognizer start');

//       recognizerActiveRef.current =
//         true;

//       setMicActive(true);

//       setError(null);

//       setState(
//         VOICE_STATE.LISTENING
//       );
//     };

//     // -------------------------------------------------------
//     // SPEECH START
//     // -------------------------------------------------------

//     rec.onspeechstart = () => {
//       speechStartTsRef.current =
//         performance.now();

//       log('speech start');
//     };

//     // -------------------------------------------------------
//     // RESULT
//     // -------------------------------------------------------

//     rec.onresult = (event) => {
//       let interim = '';
//       let finalText = '';

//       for (
//         let i = event.resultIndex;
//         i < event.results.length;
//         i++
//       ) {
//         const result =
//           event.results[i];

//         const transcript =
//           result[0]?.transcript || '';

//         if (result.isFinal) {
//           finalText += transcript;
//         } else {
//           interim += transcript;
//         }
//       }

//       // -----------------------------------------------------
//       // Show interim text
//       // -----------------------------------------------------

//       if (interim) {
//         interimBufferRef.current =
//           interim;

//         setInterimText(interim);
//       }

//       // -----------------------------------------------------
//       // FINAL RESULT
//       //
//       // This is the important part.
//       //
//       // Once final speech arrives:
//       // - turn mic OFF
//       // - stop recognition
//       // - submit exactly once
//       // -----------------------------------------------------

//       if (
//         finalText.trim() &&
//         !finalResultHandledRef.current
//       ) {
//         finalResultHandledRef.current =
//           true;

//         const text =
//           finalText.trim();

//         interimBufferRef.current = '';

//         setInterimText('');

//         // Turn microphone OFF immediately.
//         setMicActive(false);

//         recognizerActiveRef.current =
//           false;

//         // Stop recognition BEFORE
//         // sending text to the AI.
//         try {
//           rec.stop();
//         } catch {}

//         // Detach current recognizer.
//         if (
//           recognizerRef.current === rec
//         ) {
//           recognizerRef.current = null;
//         }

//         // Send ONE user message.
//         submitUserSpeech(text);
//       }
//     };

//     // -------------------------------------------------------
//     // ERROR
//     // -------------------------------------------------------

//     rec.onerror = (event) => {
//       log(
//         'recognizer error',
//         event.error
//       );

//       recognizerActiveRef.current =
//         false;

//       setMicActive(false);

//       if (
//         recognizerRef.current === rec
//       ) {
//         recognizerRef.current = null;
//       }

//       if (
//         event.error ===
//           'not-allowed' ||
//         event.error ===
//           'service-not-allowed'
//       ) {
//         setError(
//           'Microphone permission denied. Please allow microphone access.'
//         );

//         return;
//       }

//       if (
//         event.error ===
//           'no-speech'
//       ) {
//         // No speech is not a fatal error.
//         setInterimText('');

//         setState(
//           VOICE_STATE.IDLE
//         );

//         return;
//       }

//       if (
//         event.error ===
//           'aborted'
//       ) {
//         // Expected when we stop recognition.
//         return;
//       }

//       setError(
//         `Recognition error: ${event.error}`
//       );
//     };

//     // -------------------------------------------------------
//     // END
//     // -------------------------------------------------------

//     rec.onend = () => {
//       log('recognizer end');

//       recognizerActiveRef.current =
//         false;

//       setMicActive(false);

//       setInterimText('');

//       // IMPORTANT:
//       //
//       // NEVER restart automatically.
//       //
//       // The user must click the microphone
//       // again for another utterance.

//       if (
//         recognizerRef.current === rec
//       ) {
//         recognizerRef.current = null;
//       }

//       // If we were listening, return to idle.
//       setState((currentState) => {
//         if (
//           currentState ===
//           VOICE_STATE.LISTENING
//         ) {
//           return VOICE_STATE.IDLE;
//         }

//         return currentState;
//       });
//     };

//     // -------------------------------------------------------
//     // Start browser recognition
//     // -------------------------------------------------------

//     try {
//       rec.start();

//       return true;
//     } catch (err) {
//       console.error(
//         'mic start failed:',
//         err
//       );

//       recognizerActiveRef.current =
//         false;

//       setMicActive(false);

//       if (
//         recognizerRef.current === rec
//       ) {
//         recognizerRef.current = null;
//       }

//       if (
//         err?.name ===
//         'InvalidStateError'
//       ) {
//         return true;
//       }

//       setError(
//         'Could not start microphone.'
//       );

//       return false;
//     }
//   }, [
//     state,
//     audio.isPlaying,
//     submitUserSpeech,
//   ]);

//   // =========================================================
//   // STOP MIC
//   // =========================================================

//   const stopMic = useCallback(() => {
//     const rec =
//       recognizerRef.current;

//     // No active recognition.
//     if (!rec) {
//       recognizerActiveRef.current =
//         false;

//       setMicActive(false);

//       setInterimText('');

//       return;
//     }

//     log('stopping microphone');

//     recognizerActiveRef.current =
//       false;

//     setMicActive(false);

//     setInterimText('');

//     try {
//       rec.stop();
//     } catch {}

//     if (
//       recognizerRef.current === rec
//     ) {
//       recognizerRef.current = null;
//     }

//     setState((currentState) => {
//       if (
//         currentState ===
//         VOICE_STATE.LISTENING
//       ) {
//         return VOICE_STATE.IDLE;
//       }

//       return currentState;
//     });
//   }, []);

//   // =========================================================
//   // TOGGLE MIC
//   // =========================================================

//   const toggleMic = useCallback(() => {
//     if (recognizerActiveRef.current) {
//       stopMic();
//       return;
//     }

//     startMic();
//   }, [
//     startMic,
//     stopMic,
//   ]);

//   // =========================================================
//   // MANUAL AI STOP
//   // =========================================================

//   const manualStop = useCallback(() => {
//     if (
//       state ===
//         VOICE_STATE.SPEAKING ||
//       audio.isPlaying
//     ) {
//       // Make sure microphone is OFF.
//       stopMic();

//       // New generation blocks old audio.
//       localGenerationRef.current += 1;

//       interruption.markDetected({
//         oldGeneration:
//           localGenerationRef.current - 1,

//         reason:
//           INTERRUPTION_REASON.USER_CLICK,
//       });

//       const stopLatency =
//         audio.stop();

//       interruption.markAudioStopped();

//       const oldMsgId =
//         currentAssistantMsgIdRef.current;

//       if (oldMsgId) {
//         conversation.markInterrupted(
//           oldMsgId,
//           0
//         );
//       }

//       setState(
//         VOICE_STATE.IDLE
//       );

//       socketRef.current?.sendInterruption({
//         text: '',

//         reason:
//           INTERRUPTION_REASON.USER_CLICK,

//         oldRequest:
//           lastUserTextRef.current,

//         interruptedMessageId:
//           oldMsgId,

//         audioStopLatencyMs:
//           Math.round(stopLatency),
//       });
//     }
//   }, [
//     state,
//     audio,
//     conversation,
//     interruption,
//     stopMic,
//   ]);

//   // =========================================================
//   // TEXT INPUT
//   // =========================================================

//   const sendText = useCallback(
//     (text) => {
//       // Ensure microphone is OFF
//       // before sending typed text.
//       stopMic();

//       submitUserSpeech(text);
//     },
//     [
//       stopMic,
//       submitUserSpeech,
//     ]
//   );

//   // =========================================================
//   // UPDATE CONFIG
//   // =========================================================

//   const updateConfig = useCallback(
//     (config) => {
//       socketRef.current?.updateConfig(
//         config
//       );
//     },
//     []
//   );

//   // =========================================================
//   // CLEAR ERROR
//   // =========================================================

//   const clearError = useCallback(() => {
//     setError(null);
//   }, []);

//   // =========================================================
//   // RESET CONVERSATION
//   // =========================================================

//   const resetConversation =
//     useCallback(() => {
//       stopMic();

//       audio.stop();

//       conversation.reset();

//       interruption.reset();

//       latency.reset();

//       setStaleBlockedCount(0);

//       setInterimText('');

//       setState(
//         VOICE_STATE.IDLE
//       );
//     }, [
//       stopMic,
//       audio,
//       conversation,
//       interruption,
//       latency,
//     ]);

//   // =========================================================
//   // CLEANUP
//   // =========================================================

//   useEffect(() => {
//     return () => {
//       const rec =
//         recognizerRef.current;

//       if (rec) {
//         try {
//           rec.abort();
//         } catch {}
//       }

//       recognizerRef.current = null;

//       recognizerActiveRef.current =
//         false;
//     };
//   }, []);

//   // =========================================================
//   // RETURN API
//   // =========================================================

//   return {
//     // -------------------------------------------------------
//     // Connection
//     // -------------------------------------------------------

//     connected,
//     sessionId,
//     conversationId,
//     rimeInfo,

//     // -------------------------------------------------------
//     // State
//     // -------------------------------------------------------

//     state,
//     error,
//     clearError,

//     // -------------------------------------------------------
//     // Conversation
//     // -------------------------------------------------------

//     messages:
//       conversation.messages,

//     interruptions:
//       conversation.interruptions,

//     toolCalls:
//       conversation.toolCalls,

//     interimText,

//     staleBlockedCount,

//     // -------------------------------------------------------
//     // Metrics
//     // -------------------------------------------------------

//     metrics:
//       latency.metrics,

//     getStats:
//       latency.getStats,

//     interruptionHistory:
//       interruption.history,

//     // -------------------------------------------------------
//     // Microphone
//     // -------------------------------------------------------

//     micActive,

//     startMic,

//     stopMic,

//     toggleMic,

//     recognitionSupported:
//       supported &&
//       recognitionSupported,

//     // -------------------------------------------------------
//     // Actions
//     // -------------------------------------------------------

//     sendText,

//     manualStop,

//     updateConfig,

//     resetConversation,

//     // -------------------------------------------------------
//     // Audio
//     // -------------------------------------------------------

//     isPlaying:
//       audio.isPlaying,
//   };
// }












































// /**
//  * useVoice v3
//  *
//  * Voice orchestration hook.
//  *
//  * Features:
//  * 1. Server-side STT using Deepgram
//  * 2. Binary PCM microphone streaming over WebSocket
//  * 3. Client-side VAD
//  * 4. Browser SpeechRecognition fallback
//  * 5. Sentence-level chunked TTS playback
//  * 6. Generation-based stale response protection
//  * 7. Mic automatically OFF while AI is speaking
//  * 8. Explicit mic click can interrupt AI
//  * 9. One microphone session = one utterance
//  * 10. Stable WebSocket lifecycle
//  */

// import {
//   useCallback,
//   useEffect,
//   useMemo,
//   useRef,
//   useState,
// } from 'react';

// import { VoiceSocket } from '../api/voiceApi';
// import { useAudio } from './useAudio';
// import { useInterruption } from './useInterruption';
// import { useConversation } from './useConversation';
// import { useLatency } from './useLatency';

// import {
//   VOICE_STATE,
//   WS_MESSAGE_TYPES,
//   INTERRUPTION_REASON,
//   DEBUG,
//   ENABLE_SERVER_STT,
// } from '../utils/constants';


// function log(...args) {
//   if (DEBUG) {
//     console.log('[voice]', ...args);
//   }
// }


// /* =========================================================
//  * Browser SpeechRecognition
//  * ========================================================= */

// function createRecognizer() {
//   if (typeof window === 'undefined') {
//     return null;
//   }

//   const SpeechRecognition =
//     window.SpeechRecognition ||
//     window.webkitSpeechRecognition;

//   if (!SpeechRecognition) {
//     return null;
//   }

//   const recognizer = new SpeechRecognition();

//   recognizer.continuous = false;
//   recognizer.interimResults = true;
//   recognizer.lang = 'en-US';
//   recognizer.maxAlternatives = 1;

//   return recognizer;
// }


// /* =========================================================
//  * PCM HELPERS
//  * ========================================================= */

// function floatToInt16(float32Array) {
//   const output = new Int16Array(float32Array.length);

//   for (let i = 0; i < float32Array.length; i += 1) {
//     const sample = Math.max(
//       -1,
//       Math.min(1, float32Array[i])
//     );

//     output[i] =
//       sample < 0
//         ? sample * 0x8000
//         : sample * 0x7fff;
//   }

//   return output;
// }


// function downsampleTo16k(input, inputSampleRate) {
//   const targetSampleRate = 16000;

//   if (inputSampleRate === targetSampleRate) {
//     return input;
//   }

//   if (inputSampleRate < targetSampleRate) {
//     return input;
//   }

//   const ratio =
//     inputSampleRate / targetSampleRate;

//   const outputLength =
//     Math.round(input.length / ratio);

//   const output =
//     new Float32Array(outputLength);

//   let outputIndex = 0;
//   let inputIndex = 0;

//   while (
//     outputIndex < outputLength &&
//     inputIndex < input.length
//   ) {
//     const nextInputIndex = Math.min(
//       Math.round((outputIndex + 1) * ratio),
//       input.length
//     );

//     let sum = 0;
//     let count = 0;

//     for (
//       let i = Math.floor(inputIndex);
//       i < nextInputIndex;
//       i += 1
//     ) {
//       sum += input[i];
//       count += 1;
//     }

//     output[outputIndex] =
//       count > 0
//         ? sum / count
//         : input[
//             Math.min(
//               Math.floor(inputIndex),
//               input.length - 1
//             )
//           ];

//     outputIndex += 1;
//     inputIndex = outputIndex * ratio;
//   }

//   return output;
// }


// /* =========================================================
//  * useVoice
//  * ========================================================= */

// export function useVoice({
//   autoConnect = true,
// } = {}) {

//   /* =======================================================
//    * CORE REFS
//    * ======================================================= */

//   const socketRef = useRef(null);

//   /*
//    * IMPORTANT:
//    * This ref must exist before the socket callbacks use it.
//    */
//   const submitUserSpeechRef = useRef(null);

//   /*
//    * Keep latest hook APIs in refs.
//    * This prevents the WebSocket effect from being
//    * recreated whenever one of these hook objects changes.
//    */
//   const audioApiRef = useRef(null);
//   const conversationApiRef = useRef(null);
//   const interruptionApiRef = useRef(null);
//   const latencyApiRef = useRef(null);

//   /* Browser recognition */
//   const recognizerRef = useRef(null);
//   const recognizerActiveRef = useRef(false);

//   /* Server STT */
//   const serverSTTActiveRef = useRef(false);

//   /* Microphone */
//   const mediaStreamRef = useRef(null);
//   const audioContextRef = useRef(null);
//   const sourceNodeRef = useRef(null);
//   const processorNodeRef = useRef(null);
//   const silentGainRef = useRef(null);

//   /* VAD */
//   const vadActiveRef = useRef(false);
//   const vadSpeakingRef = useRef(false);
//   const vadSpeechStartedAtRef = useRef(null);
//   const vadLastSpeechAtRef = useRef(null);
//   const vadTimerRef = useRef(null);

//   /* Assistant */
//   const currentAssistantMsgIdRef = useRef(null);
//   const currentAssistantTextRef = useRef('');

//   /* Timing */
//   const speechStartTsRef = useRef(null);
//   const requestSentTsRef = useRef(null);

//   /* Generation */
//   const localGenerationRef = useRef(0);

//   /* User */
//   const lastUserTextRef = useRef('');

//   /* STT */
//   const serverTranscriptRef = useRef('');
//   const interimBufferRef = useRef('');

//   /* Duplicate final */
//   const finalResultHandledRef = useRef(false);

//   /* Streaming TTS */
//   const streamingGenerationRef = useRef(null);

//   /* Mounted state */
//   const mountedRef = useRef(false);

//   /* =======================================================
//    * STATE
//    * ======================================================= */

//   const [connected, setConnected] =
//     useState(false);

//   const [sessionId, setSessionId] =
//     useState(null);

//   const [conversationId, setConversationId] =
//     useState(null);

//   const [state, setState] =
//     useState(VOICE_STATE.IDLE);

//   const [micActive, setMicActive] =
//     useState(false);

//   const [interimText, setInterimText] =
//     useState('');

//   const [rimeInfo, setRimeInfo] =
//     useState(null);

//   const [error, setError] =
//     useState(null);

//   const [
//     recognitionSupported,
//     setRecognitionSupported,
//   ] = useState(true);

//   const [
//     serverSTTAvailable,
//     setServerSTTAvailable,
//   ] = useState(false);

//   const [
//     staleBlockedCount,
//     setStaleBlockedCount,
//   ] = useState(0);


//   /* =======================================================
//    * HOOKS
//    * ======================================================= */

//   const audio = useAudio();
//   const interruption = useInterruption();
//   const conversation = useConversation();
//   const latency = useLatency();


//   /*
//    * Store latest APIs on every render.
//    *
//    * The WebSocket callbacks always use these refs instead
//    * of capturing possibly stale hook objects.
//    */
//   audioApiRef.current = audio;
//   conversationApiRef.current = conversation;
//   interruptionApiRef.current = interruption;
//   latencyApiRef.current = latency;


//   /* =======================================================
//    * BROWSER SUPPORT
//    * ======================================================= */

//   const browserRecognitionSupported =
//     useMemo(() => {
//       if (typeof window === 'undefined') {
//         return false;
//       }

//       return !!(
//         window.SpeechRecognition ||
//         window.webkitSpeechRecognition
//       );
//     }, []);


//   /* =======================================================
//    * MICROPHONE CLEANUP
//    * ======================================================= */

//   const cleanupMicrophone = useCallback(
//     ({
//       keepState = false,
//     } = {}) => {

//       log('cleanup microphone');

//       vadActiveRef.current = false;
//       vadSpeakingRef.current = false;

//       if (vadTimerRef.current) {
//         clearInterval(vadTimerRef.current);
//         vadTimerRef.current = null;
//       }

//       const processor =
//         processorNodeRef.current;

//       if (processor) {
//         processor.onaudioprocess = null;

//         try {
//           processor.disconnect();
//         } catch {}

//         processorNodeRef.current = null;
//       }

//       const source =
//         sourceNodeRef.current;

//       if (source) {
//         try {
//           source.disconnect();
//         } catch {}

//         sourceNodeRef.current = null;
//       }

//       const silentGain =
//         silentGainRef.current;

//       if (silentGain) {
//         try {
//           silentGain.disconnect();
//         } catch {}

//         silentGainRef.current = null;
//       }

//       const audioContext =
//         audioContextRef.current;

//       if (audioContext) {
//         try {
//           if (
//             audioContext.state !== 'closed'
//           ) {
//             audioContext.close();
//           }
//         } catch {}

//         audioContextRef.current = null;
//       }

//       const stream =
//         mediaStreamRef.current;

//       if (stream) {
//         for (const track of stream.getTracks()) {
//           try {
//             track.stop();
//           } catch {}
//         }

//         mediaStreamRef.current = null;
//       }

//       serverSTTActiveRef.current = false;

//       if (mountedRef.current) {
//         setMicActive(false);
//       }

//       if (!keepState && mountedRef.current) {
//         setInterimText('');

//         setState((currentState) => {
//           if (
//             currentState ===
//             VOICE_STATE.LISTENING
//           ) {
//             return VOICE_STATE.IDLE;
//           }

//           return currentState;
//         });
//       }
//     },
//     []
//   );


//   /* =======================================================
//    * STOP BROWSER RECOGNIZER
//    * ======================================================= */

//   const stopBrowserRecognizer =
//     useCallback((abort = false) => {

//       const recognizer =
//         recognizerRef.current;

//       recognizerActiveRef.current = false;

//       if (!recognizer) {
//         return;
//       }

//       try {
//         if (abort) {
//           recognizer.abort();
//         } else {
//           recognizer.stop();
//         }
//       } catch {}

//       if (
//         recognizerRef.current === recognizer
//       ) {
//         recognizerRef.current = null;
//       }
//     }, []);


//   /* =======================================================
//    * STOP SERVER STT
//    * ======================================================= */

//   const stopServerSTT = useCallback(() => {

//     if (
//       serverSTTActiveRef.current
//     ) {
//       log('stopping server STT');

//       try {
//         socketRef.current?.stopAudioStream();
//       } catch {}
//     }

//     serverSTTActiveRef.current = false;
//   }, []);


//   /* =======================================================
//    * SOCKET LIFECYCLE
//    *
//    * IMPORTANT:
//    * Only autoConnect is a dependency.
//    *
//    * Do NOT add audio/conversation/interruption/latency here.
//    * ======================================================= */

//   useEffect(() => {

//     mountedRef.current = true;

//     if (!autoConnect) {
//       return () => {
//         mountedRef.current = false;
//       };
//     }

//     /*
//      * Safety:
//      * Never create another socket if one already exists.
//      */
//     if (socketRef.current) {
//       log('socket already exists');
//       return () => {
//         mountedRef.current = false;
//       };
//     }

//     const socket = new VoiceSocket();

//     socketRef.current = socket;

//     /* -----------------------------------------------------
//      * CONNECTION
//      * ----------------------------------------------------- */

//     const unsubConn =
//       socket.onConnectionChange(
//         ({ connected: isConnected }) => {

//           log(
//             'connection changed:',
//             isConnected
//           );

//           if (!mountedRef.current) {
//             return;
//           }

//           setConnected(isConnected);
//         }
//       );


//     /* -----------------------------------------------------
//      * HELLO
//      * ----------------------------------------------------- */

//     const unsubHello =
//       socket.on(
//         WS_MESSAGE_TYPES.HELLO,
//         (msg) => {

//           log('hello', msg);

//           if (!mountedRef.current) {
//             return;
//           }

//           if (msg.sessionId) {
//             setSessionId(msg.sessionId);
//           }

//           if (msg.rime) {
//             setRimeInfo(msg.rime);
//           }

//           const serverAvailable =
//             msg.serverSTT === true;

//           setServerSTTAvailable(
//             serverAvailable
//           );

//           log(
//             'server STT available:',
//             serverAvailable
//           );

//           /*
//            * Start backend session exactly once
//            * for this socket.
//            */
//           socket.startSession({});
//         }
//       );


//     /* -----------------------------------------------------
//      * SESSION STARTED
//      * ----------------------------------------------------- */

//     const unsubSessionStart =
//       socket.on(
//         WS_MESSAGE_TYPES.SESSION_STARTED,
//         (msg) => {

//           log(
//             'session started',
//             msg
//           );

//           if (!mountedRef.current) {
//             return;
//           }

//           setConversationId(
//             msg.conversationId
//           );
//         }
//       );


//     /* -----------------------------------------------------
//      * STATE CHANGE
//      * ----------------------------------------------------- */

//     const unsubState =
//       socket.on(
//         WS_MESSAGE_TYPES.STATE_CHANGE,
//         (msg) => {

//           if (
//             msg.generation &&
//             msg.generation <
//               localGenerationRef.current
//           ) {
//             log(
//               'state_change ignored — stale',
//               msg
//             );

//             return;
//           }

//           if (mountedRef.current) {
//             setState(msg.state);
//           }
//         }
//       );


//     /* -----------------------------------------------------
//      * TOOL START
//      * ----------------------------------------------------- */

//     const unsubToolStart =
//       socket.on(
//         WS_MESSAGE_TYPES.TOOL_STARTED,
//         (msg) => {

//           conversationApiRef.current?.addToolCall({
//             callId: msg.callId,
//             toolName: msg.toolName,
//             args: msg.toolArgs,
//             generation: msg.generation,
//           });
//         }
//       );


//     /* -----------------------------------------------------
//      * TOOL COMPLETE
//      * ----------------------------------------------------- */

//     const unsubToolDone =
//       socket.on(
//         WS_MESSAGE_TYPES.TOOL_COMPLETED,
//         (msg) => {

//           conversationApiRef.current?.updateToolCall(
//             msg.callId,
//             {
//               status: 'completed',
//               result: msg.result,
//               completedAt: Date.now(),
//             }
//           );
//         }
//       );


//     /* -----------------------------------------------------
//      * LLM RESPONSE
//      * ----------------------------------------------------- */

//     const unsubLLM =
//       socket.on(
//         WS_MESSAGE_TYPES.LLM_RESPONSE,
//         (msg) => {

//           if (
//             msg.generation &&
//             msg.generation <
//               localGenerationRef.current
//           ) {
//             log(
//               'llm_response ignored — stale',
//               msg.generation
//             );

//             return;
//           }

//           const assistantMsg =
//             conversationApiRef.current?.addAssistantMessage({
//               id: msg.messageId,
//               text: msg.text,
//               generation: msg.generation,
//               status: 'streaming',
//             });

//           currentAssistantMsgIdRef.current =
//             msg.messageId ||
//             assistantMsg?.id ||
//             null;

//           currentAssistantTextRef.current =
//             msg.text || '';
//         }
//       );


//     /* -----------------------------------------------------
//      * LEGACY TTS
//      * ----------------------------------------------------- */

//     const unsubAudio =
//       socket.on(
//         WS_MESSAGE_TYPES.TTS_AUDIO,
//         async (msg) => {

//           const gen =
//             msg.generation;

//           if (
//             gen &&
//             gen <
//               localGenerationRef.current
//           ) {

//             log(
//               'tts_audio discarded — stale',
//               {
//                 gen,
//                 current:
//                   localGenerationRef.current,
//               }
//             );

//             if (mountedRef.current) {
//               setStaleBlockedCount(
//                 (n) => n + 1
//               );
//             }

//             return;
//           }

//           const latencyApi =
//             latencyApiRef.current;

//           const conversationApi =
//             conversationApiRef.current;

//           const audioApi =
//             audioApiRef.current;

//           if (
//             msg.totalLatencyMs != null
//           ) {
//             latencyApi?.record(
//               'endToEnd',
//               msg.totalLatencyMs
//             );
//           }

//           if (
//             msg.latencyMs != null
//           ) {
//             latencyApi?.record(
//               'rime',
//               msg.latencyMs
//             );
//           }

//           if (
//             requestSentTsRef.current
//           ) {
//             latencyApi?.record(
//               'firstAudio',
//               performance.now() -
//                 requestSentTsRef.current
//             );

//             requestSentTsRef.current =
//               null;
//           }

//           if (
//             msg.recoveryLatencyMs !=
//             null
//           ) {
//             latencyApi?.record(
//               'recovery',
//               msg.recoveryLatencyMs
//             );
//           }

//           const assistantMsg =
//             conversationApi?.addAssistantMessage({
//               id: msg.messageId,
//               text: msg.text,
//               generation: gen,
//               status: 'complete',
//               audioDurationMs:
//                 msg.durationMs,
//               provider: msg.provider,
//               model: msg.model,
//               voice: msg.voice,
//             });

//           currentAssistantMsgIdRef.current =
//             msg.messageId ||
//             assistantMsg?.id ||
//             null;

//           currentAssistantTextRef.current =
//             msg.text || '';

//           if (mountedRef.current) {
//             setMicActive(false);
//           }

//           try {

//             const result =
//               await audioApi?.play({
//                 base64: msg.audio,
//                 mimeType: msg.mimeType,
//                 generation: gen,
//                 messageId:
//                   msg.messageId,

//                 isStale: (generation) =>
//                   generation <
//                   localGenerationRef.current,
//               });

//             if (
//               result?.blockedAsStale
//             ) {

//               if (mountedRef.current) {
//                 setStaleBlockedCount(
//                   (n) => n + 1
//                 );
//               }

//               if (
//                 msg.messageId
//               ) {
//                 conversationApi?.updateMessage(
//                   msg.messageId,
//                   {
//                     status: 'discarded',
//                   }
//                 );
//               }
//             }

//           } catch (err) {

//             console.error(
//               'audio.play failed:',
//               err
//             );

//             if (mountedRef.current) {
//               setError(
//                 err?.message ||
//                 'Audio playback failed'
//               );
//             }
//           }
//         }
//       );


//     /* -----------------------------------------------------
//      * STREAMING TTS CHUNKS
//      * ----------------------------------------------------- */

//     const unsubAudioChunk =
//       socket.on(
//         WS_MESSAGE_TYPES.TTS_AUDIO_CHUNK,
//         (msg) => {

//           const gen =
//             msg.generation;

//           if (
//             gen &&
//             gen <
//               localGenerationRef.current
//           ) {

//             log(
//               'tts_audio_chunk discarded — stale',
//               {
//                 seq: msg.seq,
//                 gen,
//                 current:
//                   localGenerationRef.current,
//               }
//             );

//             if (mountedRef.current) {
//               setStaleBlockedCount(
//                 (n) => n + 1
//               );
//             }

//             return;
//           }

//           const audioApi =
//             audioApiRef.current;

//           const latencyApi =
//             latencyApiRef.current;

//           if (
//             streamingGenerationRef.current !==
//             gen
//           ) {
//             streamingGenerationRef.current =
//               gen;
//           }

//           if (
//             msg.totalLatencyMs != null
//           ) {
//             latencyApi?.record(
//               'endToEnd',
//               msg.totalLatencyMs
//             );
//           }

//           if (
//             msg.latencyMs != null
//           ) {
//             latencyApi?.record(
//               'rime',
//               msg.latencyMs
//             );
//           }

//           if (
//             requestSentTsRef.current
//           ) {
//             latencyApi?.record(
//               'firstAudio',
//               performance.now() -
//                 requestSentTsRef.current
//             );

//             requestSentTsRef.current =
//               null;
//           }

//           if (
//             msg.messageId &&
//             !currentAssistantMsgIdRef.current
//           ) {
//             currentAssistantMsgIdRef.current =
//               msg.messageId;
//           }

//           if (msg.text) {
//             currentAssistantTextRef.current +=
//               currentAssistantTextRef.current
//                 ? ` ${msg.text}`
//                 : msg.text;
//           }

//           if (mountedRef.current) {
//             setMicActive(false);
//           }

//           audioApi?.enqueueChunk({
//             base64: msg.audio,
//             mimeType: msg.mimeType,
//             seq: msg.seq,
//             generation: gen,
//             messageId: msg.messageId,
//             isLast: msg.isLast,
//           });
//         }
//       );


//     /* -----------------------------------------------------
//      * STREAMING TTS COMPLETE
//      * ----------------------------------------------------- */

//     const unsubAudioComplete =
//       socket.on(
//         WS_MESSAGE_TYPES.TTS_AUDIO_COMPLETE,
//         (msg) => {

//           const gen =
//             msg.generation;

//           if (
//             gen &&
//             gen <
//               localGenerationRef.current
//           ) {
//             return;
//           }

//           log(
//             'tts audio complete',
//             msg
//           );

//           requestSentTsRef.current =
//             null;

//           streamingGenerationRef.current =
//             null;
//         }
//       );


//     /* -----------------------------------------------------
//      * INTERRUPTION ACK
//      * ----------------------------------------------------- */

//     const unsubInterruptionAck =
//       socket.on(
//         WS_MESSAGE_TYPES.INTERRUPTION_ACK,
//         (msg) => {

//           log(
//             'interruption_ack',
//             msg
//           );

//           if (
//             msg.newGeneration <
//             localGenerationRef.current
//           ) {
//             return;
//           }

//           localGenerationRef.current =
//             Math.max(
//               localGenerationRef.current,
//               msg.newGeneration
//             );

//           audioApiRef.current?.resetChunkedForGeneration(
//             msg.newGeneration
//           );

//           if (mountedRef.current) {
//             setState(
//               VOICE_STATE.RECOVERING
//             );
//           }

//           const interruptionApi =
//             interruptionApiRef.current;

//           const conversationApi =
//             conversationApiRef.current;

//           const recovery =
//             interruptionApi?.current();

//           conversationApi?.addInterruption({
//             oldGeneration:
//               msg.newGeneration - 1,

//             newGeneration:
//               msg.newGeneration,

//             cancelledCount:
//               msg.cancelledCount,

//             detectedAt:
//               recovery?.detectedAt,

//             audioStopLatencyMs:
//               recovery?.audioStopLatencyMs,
//           });
//         }
//       );


//     /* -----------------------------------------------------
//      * STALE RESPONSE
//      * ----------------------------------------------------- */

//     const unsubStale =
//       socket.on(
//         WS_MESSAGE_TYPES.STALE_RESPONSE_BLOCKED,
//         (msg) => {

//           log(
//             'server stale response blocked',
//             msg
//           );

//           if (mountedRef.current) {
//             setStaleBlockedCount(
//               (n) => n + 1
//             );
//           }
//         }
//       );


//     /* -----------------------------------------------------
//      * SERVER STT STARTED
//      * ----------------------------------------------------- */

//     const unsubSTTStarted =
//       socket.on(
//         'stt_started',
//         (msg) => {

//           log(
//             'server STT started',
//             msg
//           );

//           serverSTTActiveRef.current =
//             true;

//           if (mountedRef.current) {
//             setError(null);
//           }
//         }
//       );


//     /* -----------------------------------------------------
//      * SERVER STT INTERIM
//      * ----------------------------------------------------- */

//     const unsubSTTInterim =
//       socket.on(
//         WS_MESSAGE_TYPES.STT_INTERIM,
//         (msg) => {

//           if (
//             msg.generation &&
//             msg.generation <
//               localGenerationRef.current
//           ) {
//             return;
//           }

//           const text =
//             msg.text ||
//             msg.transcript ||
//             '';

//           if (!text) {
//             return;
//           }

//           interimBufferRef.current =
//             text;

//           if (mountedRef.current) {
//             setInterimText(text);
//           }
//         }
//       );


//     /* -----------------------------------------------------
//      * SERVER STT FINAL
//      * ----------------------------------------------------- */

//     const unsubSTTFinal =
//       socket.on(
//         WS_MESSAGE_TYPES.STT_FINAL,
//         (msg) => {

//           if (
//             msg.generation &&
//             msg.generation <
//               localGenerationRef.current
//           ) {
//             return;
//           }

//           const text = (
//             msg.text ||
//             msg.transcript ||
//             ''
//           ).trim();

//           if (!text) {
//             return;
//           }

//           log(
//             'server STT final:',
//             text
//           );

//           serverTranscriptRef.current =
//             text;

//           interimBufferRef.current =
//             '';

//           if (mountedRef.current) {
//             setInterimText('');
//           }

//           cleanupMicrophone({
//             keepState: true,
//           });

//           submitUserSpeechRef.current?.(
//             text
//           );
//         }
//       );


//     /* -----------------------------------------------------
//      * SERVER STT STOPPED
//      * ----------------------------------------------------- */

//     const unsubSTTStopped =
//       socket.on(
//         'stt_stopped',
//         () => {

//           log(
//             'server STT stopped'
//           );

//           serverSTTActiveRef.current =
//             false;
//         }
//       );


//     /* -----------------------------------------------------
//      * SOCKET ERROR
//      * ----------------------------------------------------- */

//     const unsubError =
//       socket.on(
//         WS_MESSAGE_TYPES.ERROR,
//         (msg) => {

//           console.warn(
//             'WS error msg:',
//             msg
//           );

//           if (mountedRef.current) {
//             setError(
//               msg.message ||
//               'Unknown error'
//             );
//           }
//         }
//       );


//     /* -----------------------------------------------------
//      * CONNECT
//      * ----------------------------------------------------- */

//     socket.connect();


//     /* -----------------------------------------------------
//      * CLEANUP
//      *
//      * Only runs when this effect is actually destroyed.
//      * Because the dependencies are stable, this will NOT
//      * happen on every render.
//      * ----------------------------------------------------- */

//     return () => {

//       mountedRef.current = false;

//       unsubConn?.();
//       unsubHello?.();
//       unsubSessionStart?.();
//       unsubState?.();
//       unsubToolStart?.();
//       unsubToolDone?.();
//       unsubLLM?.();
//       unsubAudio?.();
//       unsubAudioChunk?.();
//       unsubAudioComplete?.();
//       unsubInterruptionAck?.();
//       unsubStale?.();
//       unsubSTTStarted?.();
//       unsubSTTInterim?.();
//       unsubSTTFinal?.();
//       unsubSTTStopped?.();
//       unsubError?.();

//       finalResultHandledRef.current =
//         true;

//       try {
//         stopBrowserRecognizer(true);
//       } catch {}

//       try {
//         stopServerSTT();
//       } catch {}

//       try {
//         cleanupMicrophone();
//       } catch {}

//       try {
//         socket.disconnect();
//       } catch {}

//       if (
//         socketRef.current === socket
//       ) {
//         socketRef.current = null;
//       }
//     };

//   }, [
//     autoConnect,
//     cleanupMicrophone,
//     stopBrowserRecognizer,
//     stopServerSTT,
//   ]);


//   /* =======================================================
//    * AUDIO → STATE
//    * ======================================================= */

//   useEffect(() => {

//     const audioApi = audioApiRef.current;
//     const interruptionApi =
//       interruptionApiRef.current;

//     if (!audioApi?.subscribe) {
//       return undefined;
//     }

//     const unsub =
//       audioApi.subscribe((event) => {

//         if (
//           event.type === 'chunk_start'
//         ) {

//           const generation =
//             event.generation;

//           if (
//             generation &&
//             generation <
//               localGenerationRef.current
//           ) {
//             return;
//           }

//           const recovery =
//             interruptionApi?.current();

//           if (recovery) {
//             interruptionApi?.markRecovered({
//               newGeneration:
//                 localGenerationRef.current,
//             });
//           }

//           if (mountedRef.current) {
//             setMicActive(false);
//             setState(
//               VOICE_STATE.SPEAKING
//             );
//           }
//         }


//         if (
//           event.type === 'play'
//         ) {

//           const generation =
//             event.generation;

//           if (
//             generation &&
//             generation <
//               localGenerationRef.current
//           ) {
//             return;
//           }

//           const recovery =
//             interruptionApi?.current();

//           if (recovery) {
//             interruptionApi?.markRecovered({
//               newGeneration:
//                 localGenerationRef.current,
//             });
//           }

//           if (mountedRef.current) {
//             setMicActive(false);
//             setState(
//               VOICE_STATE.SPEAKING
//             );
//           }
//         }


//         if (
//           event.type === 'all_complete'
//         ) {

//           if (
//             event.generation &&
//             event.generation >=
//               localGenerationRef.current
//           ) {
//             if (mountedRef.current) {
//               setState(
//                 VOICE_STATE.COMPLETED
//               );
//             }
//           }

//           if (mountedRef.current) {
//             setMicActive(false);
//           }
//         }


//         if (
//           event.type === 'ended'
//         ) {

//           if (
//             event.generation &&
//             event.generation >=
//               localGenerationRef.current
//           ) {
//             if (mountedRef.current) {
//               setState(
//                 VOICE_STATE.COMPLETED
//               );
//             }
//           }

//           if (mountedRef.current) {
//             setMicActive(false);
//           }
//         }


//         if (
//           event.type === 'stopped' ||
//           event.type === 'pause'
//         ) {

//           if (mountedRef.current) {
//             setMicActive(false);
//           }
//         }
//       });

//     return unsub;

//   }, []);


//   /* =======================================================
//    * INTERRUPT CURRENT AI
//    * ======================================================= */

//   const triggerInterruption =
//     useCallback(
//       (
//         newText,
//         reason =
//           INTERRUPTION_REASON.USER_SPEECH
//       ) => {

//         const trimmed =
//           (newText || '').trim();

//         const oldMessageId =
//           currentAssistantMsgIdRef.current;

//         const oldText =
//           currentAssistantTextRef.current;

//         log(
//           'trigger interruption',
//           {
//             newText: trimmed,
//             reason,
//           }
//         );

//         stopBrowserRecognizer(true);
//         stopServerSTT();

//         cleanupMicrophone({
//           keepState: true,
//         });

//         localGenerationRef.current += 1;

//         const newGeneration =
//           localGenerationRef.current;

//         interruptionApiRef.current?.markDetected({
//           oldGeneration:
//             newGeneration - 1,

//           oldRequest:
//             lastUserTextRef.current,

//           newRequest:
//             trimmed,

//           reason,
//         });

//         const stopLatency =
//           audioApiRef.current?.stop?.() || 0;

//         audioApiRef.current?.resetChunkedForGeneration(
//           newGeneration
//         );

//         interruptionApiRef.current?.markAudioStopped();

//         if (oldMessageId) {
//           conversationApiRef.current?.markInterrupted(
//             oldMessageId,
//             0
//           );
//         }

//         if (mountedRef.current) {
//           setState(
//             VOICE_STATE.INTERRUPTED
//           );
//         }

//         lastUserTextRef.current =
//           trimmed;

//         requestSentTsRef.current =
//           performance.now();

//         if (trimmed) {
//           conversationApiRef.current?.addUserMessage(
//             trimmed,
//             {
//               generation:
//                 newGeneration,
//             }
//           );
//         }

//         socketRef.current?.sendInterruption({
//           text: trimmed,

//           reason,

//           oldRequest: oldText,

//           interruptedMessageId:
//             oldMessageId,

//           detectionLatencyMs: 0,

//           audioStopLatencyMs:
//             Math.round(stopLatency),

//           generation:
//             newGeneration,
//         });

//         if (
//           trimmed &&
//           mountedRef.current
//         ) {
//           setState(
//             VOICE_STATE.PROCESSING
//           );
//         }
//       },
//       [
//         cleanupMicrophone,
//         stopBrowserRecognizer,
//         stopServerSTT,
//       ]
//     );


//   /* =======================================================
//    * SUBMIT USER SPEECH
//    * ======================================================= */

//   const submitUserSpeech =
//     useCallback(
//       (text) => {

//         const trimmed =
//           (text || '').trim();

//         if (!trimmed) {
//           return;
//         }

//         log(
//           'submit user speech:',
//           trimmed
//         );

//         stopBrowserRecognizer(false);
//         stopServerSTT();

//         cleanupMicrophone({
//           keepState: true,
//         });

//         if (mountedRef.current) {
//           setInterimText('');
//         }

//         const currentState =
//           state;

//         const audioIsPlaying =
//           !!audioApiRef.current?.isPlaying;

//         const shouldInterrupt =
//           currentState ===
//             VOICE_STATE.SPEAKING ||
//           currentState ===
//             VOICE_STATE.TOOL_RUNNING ||
//           currentState ===
//             VOICE_STATE.PROCESSING ||
//           audioIsPlaying;

//         if (shouldInterrupt) {

//           triggerInterruption(
//             trimmed,
//             INTERRUPTION_REASON.USER_SPEECH
//           );

//           return;
//         }

//         localGenerationRef.current += 1;

//         const generation =
//           localGenerationRef.current;

//         lastUserTextRef.current =
//           trimmed;

//         requestSentTsRef.current =
//           performance.now();

//         conversationApiRef.current?.addUserMessage(
//           trimmed,
//           {
//             generation,
//           }
//         );

//         if (mountedRef.current) {
//           setState(
//             VOICE_STATE.PROCESSING
//           );
//         }

//         socketRef.current?.sendUserSpeech(
//           trimmed,
//           {
//             generation,
//           }
//         );
//       },
//       [
//         state,
//         triggerInterruption,
//         cleanupMicrophone,
//         stopBrowserRecognizer,
//         stopServerSTT,
//       ]
//     );


//   submitUserSpeechRef.current =
//     submitUserSpeech;


//   /* =======================================================
//    * VAD
//    * ======================================================= */

//   const startVAD =
//     useCallback(
//       (audioContext) => {

//         vadActiveRef.current = true;
//         vadSpeakingRef.current = false;
//         vadSpeechStartedAtRef.current =
//           null;
//         vadLastSpeechAtRef.current =
//           null;

//         const speechThreshold =
//           0.018;

//         const silenceDuration =
//           700;

//         const checkInterval =
//           50;

//         if (vadTimerRef.current) {
//           clearInterval(
//             vadTimerRef.current
//           );
//         }

//         vadTimerRef.current =
//           setInterval(() => {

//             if (
//               !vadActiveRef.current
//             ) {
//               return;
//             }

//             if (
//               !vadSpeakingRef.current
//             ) {
//               return;
//             }

//             const lastSpeech =
//               vadLastSpeechAtRef.current;

//             if (!lastSpeech) {
//               return;
//             }

//             if (
//               performance.now() -
//                 lastSpeech >=
//               silenceDuration
//             ) {

//               log(
//                 'VAD silence detected'
//               );

//               vadSpeakingRef.current =
//                 false;

//               stopServerSTT();
//             }

//           }, checkInterval);

//         return () => {

//           vadActiveRef.current =
//             false;

//           if (vadTimerRef.current) {
//             clearInterval(
//               vadTimerRef.current
//             );

//             vadTimerRef.current =
//               null;
//           }
//         };
//       },
//       [stopServerSTT]
//     );


//   /* =======================================================
//    * SERVER STT MICROPHONE
//    * ======================================================= */

//   const startServerSTTMic =
//     useCallback(
//       async () => {

//         if (
//           typeof navigator ===
//             'undefined' ||
//           !navigator.mediaDevices ||
//           !navigator.mediaDevices.getUserMedia
//         ) {
//           throw new Error(
//             'Browser microphone API is not supported.'
//           );
//         }

//         const stream =
//           await navigator.mediaDevices.getUserMedia({
//             audio: {
//               channelCount: 1,
//               echoCancellation: true,
//               noiseSuppression: true,
//               autoGainControl: true,
//             },
//             video: false,
//           });

//         mediaStreamRef.current =
//           stream;

//         const AudioContext =
//           window.AudioContext ||
//           window.webkitAudioContext;

//         if (!AudioContext) {
//           throw new Error(
//             'Web Audio API is not supported.'
//           );
//         }

//         const audioContext =
//           new AudioContext();

//         audioContextRef.current =
//           audioContext;

//         if (
//           audioContext.state ===
//           'suspended'
//         ) {
//           await audioContext.resume();
//         }

//         const started =
//           socketRef.current?.startAudioStream({
//             language: 'en-US',
//           });

//         if (!started) {

//           throw new Error(
//             'WebSocket is not connected.'
//           );
//         }

//         serverSTTActiveRef.current =
//           true;

//         const source =
//           audioContext.createMediaStreamSource(
//             stream
//           );

//         sourceNodeRef.current =
//           source;

//         const processor =
//           audioContext.createScriptProcessor(
//             4096,
//             1,
//             1
//           );

//         processorNodeRef.current =
//           processor;

//         source.connect(processor);

//         const silentGain =
//           audioContext.createGain();

//         silentGain.gain.value = 0;

//         silentGainRef.current =
//           silentGain;

//         processor.connect(
//           silentGain
//         );

//         silentGain.connect(
//           audioContext.destination
//         );

//         processor.onaudioprocess =
//           (event) => {

//             if (
//               !vadActiveRef.current
//             ) {
//               return;
//             }

//             if (
//               !serverSTTActiveRef.current
//             ) {
//               return;
//             }

//             const input =
//               event.inputBuffer.getChannelData(
//                 0
//               );

//             let sumSquares = 0;

//             for (
//               let i = 0;
//               i < input.length;
//               i += 1
//             ) {

//               const value =
//                 input[i];

//               sumSquares +=
//                 value * value;
//             }

//             const rms =
//               Math.sqrt(
//                 sumSquares /
//                 input.length
//               );

//             const speechThreshold =
//               0.018;

//             const now =
//               performance.now();

//             if (
//               rms >=
//               speechThreshold
//             ) {

//               if (
//                 !vadSpeakingRef.current
//               ) {

//                 vadSpeakingRef.current =
//                   true;

//                 vadSpeechStartedAtRef.current =
//                   now;

//                 speechStartTsRef.current =
//                   now;

//                 log(
//                   'VAD speech start'
//                 );

//                 if (
//                   audioApiRef.current?.isPlaying ||
//                   state ===
//                     VOICE_STATE.SPEAKING
//                 ) {
//                   log(
//                     'VAD detected speech during AI playback'
//                   );
//                 }
//               }

//               vadLastSpeechAtRef.current =
//                 now;
//             }

//             const downsampled =
//               downsampleTo16k(
//                 input,
//                 audioContext.sampleRate
//               );

//             const pcm =
//               floatToInt16(
//                 downsampled
//               );

//             const buffer =
//               pcm.buffer.slice(
//                 pcm.byteOffset,
//                 pcm.byteOffset +
//                   pcm.byteLength
//               );

//             socketRef.current?.sendAudio(
//               buffer
//             );
//           };

//         startVAD(audioContext);

//         if (mountedRef.current) {
//           setMicActive(true);
//           setInterimText('');
//         }

//         finalResultHandledRef.current =
//           false;

//         serverTranscriptRef.current =
//           '';

//         interimBufferRef.current =
//           '';

//         if (mountedRef.current) {
//           setError(null);

//           setState(
//             VOICE_STATE.LISTENING
//           );
//         }

//         log(
//           'server STT microphone started',
//           {
//             sampleRate:
//               audioContext.sampleRate,
//           }
//         );

//         return true;
//       },
//       [
//         state,
//         startVAD,
//       ]
//     );


//   /* =======================================================
//    * BROWSER FALLBACK MIC
//    * ======================================================= */

//   const startBrowserMic =
//     useCallback(() => {

//       if (
//         recognizerActiveRef.current
//       ) {
//         return true;
//       }

//       const rec =
//         createRecognizer();

//       if (!rec) {

//         if (mountedRef.current) {
//           setRecognitionSupported(
//             false
//           );

//           setError(
//             'Speech Recognition is not supported. Use Chrome or Edge, or enable server STT.'
//           );
//         }

//         return false;
//       }

//       finalResultHandledRef.current =
//         false;

//       interimBufferRef.current =
//         '';

//       if (mountedRef.current) {
//         setInterimText('');
//       }

//       recognizerRef.current =
//         rec;

//       rec.onstart = () => {

//         log(
//           'browser recognizer start'
//         );

//         recognizerActiveRef.current =
//           true;

//         if (mountedRef.current) {
//           setMicActive(true);
//           setError(null);

//           setState(
//             VOICE_STATE.LISTENING
//           );
//         }
//       };


//       rec.onspeechstart = () => {

//         speechStartTsRef.current =
//           performance.now();

//         log(
//           'browser speech start'
//         );
//       };


//       rec.onresult = (event) => {

//         let interim = '';
//         let finalText = '';

//         for (
//           let i = event.resultIndex;
//           i < event.results.length;
//           i += 1
//         ) {

//           const result =
//             event.results[i];

//           const transcript =
//             result[0]?.transcript ||
//             '';

//           if (
//             result.isFinal
//           ) {
//             finalText += transcript;
//           } else {
//             interim += transcript;
//           }
//         }

//         if (interim) {

//           interimBufferRef.current =
//             interim;

//           if (mountedRef.current) {
//             setInterimText(interim);
//           }
//         }

//         if (
//           finalText.trim() &&
//           !finalResultHandledRef.current
//         ) {

//           finalResultHandledRef.current =
//             true;

//           const text =
//             finalText.trim();

//           interimBufferRef.current =
//             '';

//           if (mountedRef.current) {
//             setInterimText('');
//             setMicActive(false);
//           }

//           recognizerActiveRef.current =
//             false;

//           try {
//             rec.stop();
//           } catch {}

//           if (
//             recognizerRef.current ===
//             rec
//           ) {
//             recognizerRef.current =
//               null;
//           }

//           submitUserSpeechRef.current?.(
//             text
//           );
//         }
//       };


//       rec.onerror = (event) => {

//         log(
//           'browser recognizer error',
//           event.error
//         );

//         recognizerActiveRef.current =
//           false;

//         if (mountedRef.current) {
//           setMicActive(false);
//         }

//         if (
//           recognizerRef.current ===
//           rec
//         ) {
//           recognizerRef.current =
//             null;
//         }

//         if (
//           event.error ===
//             'not-allowed' ||
//           event.error ===
//             'service-not-allowed'
//         ) {

//           if (mountedRef.current) {
//             setError(
//               'Microphone permission denied. Please allow microphone access.'
//             );
//           }

//           return;
//         }

//         if (
//           event.error ===
//           'no-speech'
//         ) {

//           if (mountedRef.current) {
//             setInterimText('');
//             setState(
//               VOICE_STATE.IDLE
//             );
//           }

//           return;
//         }

//         if (
//           event.error ===
//           'aborted'
//         ) {
//           return;
//         }

//         if (mountedRef.current) {
//           setError(
//             `Recognition error: ${event.error}`
//           );
//         }
//       };


//       rec.onend = () => {

//         log(
//           'browser recognizer end'
//         );

//         recognizerActiveRef.current =
//           false;

//         if (mountedRef.current) {
//           setMicActive(false);
//           setInterimText('');
//         }

//         if (
//           recognizerRef.current ===
//           rec
//         ) {
//           recognizerRef.current =
//             null;
//         }

//         if (mountedRef.current) {
//           setState(
//             (currentState) => {

//               if (
//                 currentState ===
//                 VOICE_STATE.LISTENING
//               ) {
//                 return VOICE_STATE.IDLE;
//               }

//               return currentState;
//             }
//           );
//         }
//       };


//       try {

//         rec.start();

//         return true;

//       } catch (err) {

//         console.error(
//           'browser mic start failed:',
//           err
//         );

//         recognizerActiveRef.current =
//           false;

//         if (mountedRef.current) {
//           setMicActive(false);
//         }

//         if (
//           recognizerRef.current ===
//           rec
//         ) {
//           recognizerRef.current =
//             null;
//         }

//         if (
//           err?.name ===
//           'InvalidStateError'
//         ) {
//           return true;
//         }

//         if (mountedRef.current) {
//           setError(
//             'Could not start microphone.'
//           );
//         }

//         return false;
//       }

//     }, []);


//   /* =======================================================
//    * START MIC
//    * ======================================================= */

//   const startMic =
//     useCallback(
//       async () => {

//         if (
//           recognizerActiveRef.current ||
//           serverSTTActiveRef.current
//         ) {
//           return true;
//         }

//         const audioIsPlaying =
//           !!audioApiRef.current?.isPlaying;

//         const aiSpeaking =
//           state ===
//             VOICE_STATE.SPEAKING ||
//           audioIsPlaying;

//         log(
//           'startMic',
//           {
//             aiSpeaking,
//             serverSTTAvailable,
//           }
//         );

//         /*
//          * Prefer Deepgram server STT.
//          */
//         if (
//           ENABLE_SERVER_STT &&
//           serverSTTAvailable &&
//           connected
//         ) {

//           try {
//             return await startServerSTTMic();

//           } catch (err) {

//             console.error(
//               'server STT microphone failed:',
//               err
//             );

//             cleanupMicrophone({
//               keepState: true,
//             });

//             if (mountedRef.current) {
//               setError(
//                 err?.message ||
//                 'Could not start server microphone.'
//               );
//             }
//           }
//         }

//         /*
//          * Browser fallback.
//          */
//         return startBrowserMic();
//       },
//       [
//         state,
//         connected,
//         serverSTTAvailable,
//         startServerSTTMic,
//         startBrowserMic,
//         cleanupMicrophone,
//       ]
//     );


//   /* =======================================================
//    * STOP MIC
//    * ======================================================= */

//   const stopMic =
//     useCallback(() => {

//       log('stopMic');

//       finalResultHandledRef.current =
//         true;

//       stopBrowserRecognizer(false);

//       stopServerSTT();

//       cleanupMicrophone();

//       if (mountedRef.current) {
//         setInterimText('');

//         setState(
//           (currentState) => {

//             if (
//               currentState ===
//               VOICE_STATE.LISTENING
//             ) {
//               return VOICE_STATE.IDLE;
//             }

//             return currentState;
//           }
//         );
//       }
//     }, [
//       stopBrowserRecognizer,
//       stopServerSTT,
//       cleanupMicrophone,
//     ]);


//   /* =======================================================
//    * TOGGLE MIC
//    * ======================================================= */

//   const toggleMic =
//     useCallback(() => {

//       if (
//         recognizerActiveRef.current ||
//         serverSTTActiveRef.current
//       ) {

//         stopMic();

//         return;
//       }

//       startMic();

//     }, [
//       startMic,
//       stopMic,
//     ]);


//   /* =======================================================
//    * MANUAL AI STOP
//    * ======================================================= */

//   const manualStop =
//     useCallback(() => {

//       const audioIsPlaying =
//         !!audioApiRef.current?.isPlaying;

//       if (
//         state !==
//           VOICE_STATE.SPEAKING &&
//         !audioIsPlaying
//       ) {
//         return;
//       }

//       log(
//         'manual AI stop'
//       );

//       stopMic();

//       localGenerationRef.current +=
//         1;

//       const newGeneration =
//         localGenerationRef.current;

//       interruptionApiRef.current?.markDetected({
//         oldGeneration:
//           newGeneration - 1,

//         reason:
//           INTERRUPTION_REASON.USER_CLICK,
//       });

//       const stopLatency =
//         audioApiRef.current?.stop?.() || 0;

//       audioApiRef.current?.resetChunkedForGeneration(
//         newGeneration
//       );

//       interruptionApiRef.current?.markAudioStopped();

//       const oldMsgId =
//         currentAssistantMsgIdRef.current;

//       if (oldMsgId) {
//         conversationApiRef.current?.markInterrupted(
//           oldMsgId,
//           0
//         );
//       }

//       if (mountedRef.current) {
//         setState(
//           VOICE_STATE.IDLE
//         );
//       }

//       socketRef.current?.sendInterruption({
//         text: '',

//         reason:
//           INTERRUPTION_REASON.USER_CLICK,

//         oldRequest:
//           lastUserTextRef.current,

//         interruptedMessageId:
//           oldMsgId,

//         audioStopLatencyMs:
//           Math.round(stopLatency),

//         generation:
//           newGeneration,
//       });

//     }, [
//       state,
//       stopMic,
//     ]);


//   /* =======================================================
//    * TEXT INPUT
//    * ======================================================= */

//   const sendText =
//     useCallback(
//       (text) => {

//         stopMic();

//         submitUserSpeech(text);
//       },
//       [
//         stopMic,
//         submitUserSpeech,
//       ]
//     );


//   /* =======================================================
//    * UPDATE CONFIG
//    * ======================================================= */

//   const updateConfig =
//     useCallback(
//       (config) => {

//         socketRef.current?.updateConfig(
//           config
//         );
//       },
//       []
//     );


//   /* =======================================================
//    * CLEAR ERROR
//    * ======================================================= */

//   const clearError =
//     useCallback(() => {
//       setError(null);
//     }, []);


//   /* =======================================================
//    * RESET CONVERSATION
//    * ======================================================= */

//   const resetConversation =
//     useCallback(() => {

//       stopMic();

//       audioApiRef.current?.stop();

//       localGenerationRef.current +=
//         1;

//       audioApiRef.current?.resetChunkedForGeneration(
//         localGenerationRef.current
//       );

//       conversationApiRef.current?.reset();

//       interruptionApiRef.current?.reset();

//       latencyApiRef.current?.reset();

//       currentAssistantMsgIdRef.current =
//         null;

//       currentAssistantTextRef.current =
//         '';

//       lastUserTextRef.current =
//         '';

//       requestSentTsRef.current =
//         null;

//       serverTranscriptRef.current =
//         '';

//       interimBufferRef.current =
//         '';

//       streamingGenerationRef.current =
//         null;

//       if (mountedRef.current) {
//         setStaleBlockedCount(0);
//         setInterimText('');

//         setState(
//           VOICE_STATE.IDLE
//         );
//       }

//     }, [
//       stopMic,
//     ]);


//   /* =======================================================
//    * FINAL UNMOUNT CLEANUP
//    *
//    * This is intentionally separate from socket lifecycle.
//    * ======================================================= */

//   useEffect(() => {

//     return () => {

//       mountedRef.current = false;

//       finalResultHandledRef.current =
//         true;

//       try {
//         stopBrowserRecognizer(true);
//       } catch {}

//       try {
//         stopServerSTT();
//       } catch {}

//       try {
//         cleanupMicrophone();
//       } catch {}

//       /*
//        * Normally the socket effect cleanup handles this.
//        * This is only a final safety guard.
//        */
//       const socket =
//         socketRef.current;

//       if (socket) {
//         try {
//           socket.disconnect();
//         } catch {}

//         socketRef.current = null;
//       }

//     };

//   }, [
//     stopBrowserRecognizer,
//     stopServerSTT,
//     cleanupMicrophone,
//   ]);


//   /* =======================================================
//    * RETURN API
//    * ======================================================= */

//   return {

//     /* Connection */

//     connected,

//     sessionId,

//     conversationId,

//     rimeInfo,

//     serverSTTAvailable,


//     /* State */

//     state,

//     error,

//     clearError,


//     /* Conversation */

//     messages:
//       conversation.messages,

//     interruptions:
//       conversation.interruptions,

//     toolCalls:
//       conversation.toolCalls,

//     interimText,

//     staleBlockedCount,


//     /* Metrics */

//     metrics:
//       latency.metrics,

//     getStats:
//       latency.getStats,

//     interruptionHistory:
//       interruption.history,


//     /* Microphone */

//     micActive,

//     startMic,

//     stopMic,

//     toggleMic,

//     recognitionSupported:
//       browserRecognitionSupported &&
//       recognitionSupported,


//     /* Actions */

//     sendText,

//     manualStop,

//     updateConfig,

//     resetConversation,


//     /* Audio */

//     isPlaying:
//       audio.isPlaying,

//     streamingMode:
//       audio.streamingMode,
//   };
// }
























/**
 * useVoice v3 — stable voice orchestration hook
 *
 * Integrates:
 *   1. VAD-based interruption
 *   2. Server-side STT (Deepgram, optional)
 *   3. Chunked TTS audio playback
 *   4. Browser SpeechRecognition fallback
 *   5. Generation-based stale-result fencing
 *
 * IMPORTANT:
 * WebSocket is created ONCE for the lifetime of this hook.
 * We intentionally do NOT put changing hook objects in the
 * WebSocket effect dependency array.
 *
 * v3.1 fix:
 *   Both the browser SpeechRecognition path AND the server-STT
 *   path now stop listening automatically after ONE finished
 *   utterance, instead of continuing to listen indefinitely
 *   (which could previously pick up the assistant's own voice
 *   reply or just leave the mic open forever until a manual tap).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VoiceSocket } from '../api/voiceApi';
import { useAudio } from './useAudio';
import { useVAD } from './useVAD';
import { useInterruption } from './useInterruption';
import { useConversation } from './useConversation';
import { useLatency } from './useLatency';
import { AudioCapture } from '../utils/audioCapture';

import {
  VOICE_STATE,
  WS_MESSAGE_TYPES,
  INTERRUPTION_REASON,
  DEBUG,
  ENABLE_SERVER_STT,
} from '../utils/constants';

function log(...args) {
  if (DEBUG) {
    console.log('[voice]', ...args);
  }
}

function createRecognizer() {
  if (typeof window === 'undefined') return null;

  const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SR) return null;

  const recognizer = new SR();

  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = 'en-US';
  recognizer.maxAlternatives = 1;

  return recognizer;
}

export function useVoice({
  autoConnect = true,
  vadSensitivity = 'medium',
} = {}) {
  const socketRef = useRef(null);

  const recognizerRef = useRef(null);
  const recognizerActiveRef = useRef(false);

  const audioCaptureRef = useRef(null);

  const currentAssistantMsgIdRef = useRef(null);
  const currentAssistantTextRef = useRef('');

  const localGenerationRef = useRef(0);

  const lastUserTextRef = useRef('');

  const requestSentTsRef = useRef(null);

  const serverSTTActiveRef = useRef(false);

  const mountedRef = useRef(false);

  const apiRefs = useRef({
    audio: null,
    conversation: null,
    interruption: null,
    latency: null,
  });

  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [conversationId, setConversationId] = useState(null);

  const [state, setState] = useState(VOICE_STATE.IDLE);

  const [micActive, setMicActive] = useState(false);

  const [interimText, setInterimText] = useState('');

  const [rimeInfo, setRimeInfo] = useState(null);

  const [capabilities, setCapabilities] = useState({});

  const [error, setError] = useState(null);

  const [recognitionSupported, setRecognitionSupported] =
    useState(true);

  const [staleBlockedCount, setStaleBlockedCount] =
    useState(0);

  const [micStream, setMicStream] = useState(null);

  const [vadActive, setVadActive] = useState(false);

  const audio = useAudio();
  const interruption = useInterruption();
  const conversation = useConversation();
  const latency = useLatency();

  apiRefs.current = {
    audio,
    conversation,
    interruption,
    latency,
  };

  const supported = useMemo(() => {
    if (typeof window === 'undefined') return false;

    return Boolean(
      window.SpeechRecognition ||
        window.webkitSpeechRecognition
    );
  }, []);

  const vad = useVAD({
    stream: micStream,

    enabled:
      vadActive &&
      (
        state === VOICE_STATE.SPEAKING ||
        audio.isPlaying
      ),

    sensitivity: vadSensitivity,

    onSpeechStart: (info) => {
      log('VAD detected speech', info);

      const currentInterruption =
        apiRefs.current.interruption;

      currentInterruption?.markDetected({
        oldGeneration: localGenerationRef.current,
        oldRequest: lastUserTextRef.current,
        reason: INTERRUPTION_REASON.VAD_DETECTED,
      });
    },

    onSpeechEnd: () => {
      log('VAD speech end');
    },
  });

  const triggerInterruption = useCallback(
    (
      newText,
      reason = INTERRUPTION_REASON.USER_SPEECH
    ) => {
      const {
        audio: audioApi,
        conversation: conversationApi,
        interruption: interruptionApi,
      } = apiRefs.current;

      if (!audioApi || !conversationApi || !interruptionApi) {
        return;
      }

      const oldMessageId =
        currentAssistantMsgIdRef.current;

      const oldText =
        currentAssistantTextRef.current;

      const previousGeneration =
        localGenerationRef.current;

      localGenerationRef.current += 1;

      const newGeneration =
        localGenerationRef.current;

      const existingRecord =
        interruptionApi.current();

      if (!existingRecord) {
        interruptionApi.markDetected({
          oldGeneration: previousGeneration,
          oldRequest: lastUserTextRef.current,
          newRequest: newText,
          reason,
        });
      }

      const stopLatency = audioApi.stop();

      audioApi.resetChunkedForGeneration(
        newGeneration
      );

      interruptionApi.markAudioStopped();

      if (oldMessageId) {
        conversationApi.markInterrupted(
          oldMessageId,
          0
        );
      }

      setState(VOICE_STATE.INTERRUPTED);
      setVadActive(false);

      requestSentTsRef.current =
        performance.now();

      lastUserTextRef.current = newText;

      if (newText) {
        conversationApi.addUserMessage(
          newText,
          {
            generation: newGeneration,
          }
        );
      }

      socketRef.current?.sendInterruption({
        text: newText,
        reason,
        oldRequest: oldText,
        interruptedMessageId: oldMessageId,
        detectionLatencyMs: 0,
        audioStopLatencyMs:
          Math.round(stopLatency || 0),
      });
    },
    []
  );

  const submitUserSpeech = useCallback(
    (text) => {
      const trimmed = String(text || '').trim();

      if (!trimmed) return;

      const {
        audio: audioApi,
        conversation: conversationApi,
      } = apiRefs.current;

      if (!audioApi || !conversationApi) {
        return;
      }

      const shouldInterrupt =
        state === VOICE_STATE.SPEAKING ||
        state === VOICE_STATE.TOOL_RUNNING ||
        state === VOICE_STATE.PROCESSING ||
        audioApi.isPlaying;

      if (shouldInterrupt) {
        triggerInterruption(trimmed);
        return;
      }

      localGenerationRef.current += 1;

      const generation =
        localGenerationRef.current;

      lastUserTextRef.current = trimmed;

      requestSentTsRef.current =
        performance.now();

      conversationApi.addUserMessage(
        trimmed,
        {
          generation,
        }
      );

      setState(VOICE_STATE.PROCESSING);

      socketRef.current?.sendUserSpeech(
        trimmed,
        {
          generation,
        }
      );
    },
    [state, triggerInterruption]
  );

  const submitUserSpeechRef =
    useRef(submitUserSpeech);

  useEffect(() => {
    submitUserSpeechRef.current =
      submitUserSpeech;
  }, [submitUserSpeech]);

  useEffect(() => {
    if (!autoConnect) {
      return undefined;
    }

    mountedRef.current = true;

    const socket = new VoiceSocket();

    socketRef.current = socket;

    log('Creating WebSocket');

    const unsubConn =
      socket.onConnectionChange(
        ({ connected: isConnected }) => {
          if (!mountedRef.current) return;

          setConnected(Boolean(isConnected));
        }
      );

    const unsubHello = socket.on(
      WS_MESSAGE_TYPES.HELLO,
      (msg) => {
        if (!mountedRef.current) return;

        setSessionId(msg.sessionId || null);

        if (msg.rime) {
          setRimeInfo(msg.rime);
        }

        if (msg.capabilities) {
          setCapabilities(msg.capabilities);
        }

        socket.startSession({});
      }
    );

    const unsubSessionStart = socket.on(
      WS_MESSAGE_TYPES.SESSION_STARTED,
      (msg) => {
        if (!mountedRef.current) return;

        setConversationId(
          msg.conversationId || null
        );
      }
    );

    const unsubState = socket.on(
      WS_MESSAGE_TYPES.STATE_CHANGE,
      (msg) => {
        if (!mountedRef.current) return;

        const generation =
          Number(msg.generation || 0);

        if (
          generation > 0 &&
          generation < localGenerationRef.current
        ) {
          return;
        }

        setState(msg.state);

        if (
          msg.state === VOICE_STATE.SPEAKING
        ) {
          setVadActive(true);
        }

        if (
          msg.state === VOICE_STATE.COMPLETED ||
          msg.state === VOICE_STATE.IDLE
        ) {
          setVadActive(false);
        }
      }
    );

    const unsubToolStart = socket.on(
      WS_MESSAGE_TYPES.TOOL_STARTED,
      (msg) => {
        apiRefs.current.conversation?.addToolCall({
          callId: msg.callId,
          toolName: msg.toolName,
          args: msg.toolArgs,
          generation: msg.generation,
          status: 'running',
        });
      }
    );

    const unsubToolDone = socket.on(
      WS_MESSAGE_TYPES.TOOL_COMPLETED,
      (msg) => {
        apiRefs.current.conversation?.updateToolCall(
          msg.callId,
          {
            status: 'completed',
            result: msg.result,
            completedAt: Date.now(),
          }
        );
      }
    );

    /*
     * COMPLETE LLM RESPONSE
     *
     * This creates the assistant message with the
     * COMPLETE text.
     *
     * TTS chunks below must NEVER replace this text.
     */
    const unsubLLM = socket.on(
      WS_MESSAGE_TYPES.LLM_RESPONSE,
      (msg) => {
        if (!mountedRef.current) return;

        const generation =
          Number(msg.generation || 0);

        if (
          generation > 0 &&
          generation < localGenerationRef.current
        ) {
          return;
        }

        const conversationApi =
          apiRefs.current.conversation;

        if (!conversationApi) return;

        const assistantMsg =
          conversationApi.addAssistantMessage({
            id: msg.messageId,
            text: msg.text || '',
            generation,
            status: 'streaming',
          });

        currentAssistantMsgIdRef.current =
          msg.messageId ||
          assistantMsg?.id ||
          null;

        currentAssistantTextRef.current =
          msg.text || '';
      }
    );

    /*
     * STREAMING TTS
     *
     * IMPORTANT:
     * Do NOT call addAssistantMessage() here.
     *
     * The LLM_RESPONSE handler above already contains
     * the complete assistant text.
     *
     * Every TTS chunk may contain only one sentence,
     * so using msg.text here would overwrite the
     * complete response.
     */
    const unsubAudioChunk = socket.on(
      WS_MESSAGE_TYPES.TTS_AUDIO_CHUNK,
      (msg) => {
        if (!mountedRef.current) return;

        const generation =
          Number(msg.generation || 0);

        if (
          generation > 0 &&
          generation < localGenerationRef.current
        ) {
          log(
            'tts_audio_chunk discarded as stale',
            generation
          );

          setStaleBlockedCount(
            (count) => count + 1
          );

          return;
        }

        const {
          audio: audioApi,
          latency: latencyApi,
        } = apiRefs.current;

        if (!audioApi) return;

        if (
          msg.seq === 0 &&
          msg.totalLatencyMs != null
        ) {
          latencyApi?.record(
            'firstAudio',
            msg.totalLatencyMs
          );
        }

        if (msg.latencyMs != null) {
          latencyApi?.record(
            'rime_chunk',
            msg.latencyMs
          );
        }

        if (
          msg.recoveryLatencyMs != null
        ) {
          latencyApi?.record(
            'recovery',
            msg.recoveryLatencyMs
          );
        }

        /*
         * DO NOT DO THIS:
         *
         * conversationApi.addAssistantMessage({
         *   id: msg.messageId,
         *   text: msg.text,
         * });
         *
         * Because msg.text can be only the current
         * sentence/chunk and would overwrite the
         * complete LLM response.
         */

        if (msg.messageId) {
          currentAssistantMsgIdRef.current =
            msg.messageId;
        }

        audioApi.enqueueChunk({
          base64: msg.audio,
          mimeType: msg.mimeType,
          seq: msg.seq,
          generation,
          messageId: msg.messageId,
          isLast: msg.isLast,
        });
      }
    );

    const unsubAudioComplete = socket.on(
      WS_MESSAGE_TYPES.TTS_AUDIO_COMPLETE,
      (msg) => {
        if (!mountedRef.current) return;

        const generation =
          Number(msg.generation || 0);

        if (
          generation > 0 &&
          generation < localGenerationRef.current
        ) {
          return;
        }

        if (msg.messageId) {
          apiRefs.current.conversation?.updateMessage(
            msg.messageId,
            {
              status: 'complete',
            }
          );
        }

        if (
          !apiRefs.current.audio?.isPlaying
        ) {
          setState(VOICE_STATE.COMPLETED);
          setVadActive(false);
        }
      }
    );

    const unsubAudio = socket.on(
      WS_MESSAGE_TYPES.TTS_AUDIO,
      async (msg) => {
        if (!mountedRef.current) return;

        const generation =
          Number(msg.generation || 0);

        if (
          generation > 0 &&
          generation < localGenerationRef.current
        ) {
          log(
            'tts_audio discarded as stale',
            generation
          );

          setStaleBlockedCount(
            (count) => count + 1
          );

          return;
        }

        const {
          audio: audioApi,
          conversation: conversationApi,
          latency: latencyApi,
        } = apiRefs.current;

        if (!audioApi) return;

        if (msg.totalLatencyMs != null) {
          latencyApi?.record(
            'endToEnd',
            msg.totalLatencyMs
          );
        }

        if (msg.latencyMs != null) {
          latencyApi?.record(
            'rime',
            msg.latencyMs
          );
        }

        if (requestSentTsRef.current) {
          latencyApi?.record(
            'firstAudio',
            performance.now() -
              requestSentTsRef.current
          );

          requestSentTsRef.current = null;
        }

        if (
          msg.recoveryLatencyMs != null
        ) {
          latencyApi?.record(
            'recovery',
            msg.recoveryLatencyMs
          );
        }

        conversationApi?.addAssistantMessage({
          id: msg.messageId,
          text: msg.text || '',
          generation,
          status: 'complete',
          audioDurationMs:
            msg.durationMs,
          provider: msg.provider,
          model: msg.model,
          voice: msg.voice,
        });

        currentAssistantMsgIdRef.current =
          msg.messageId;

        currentAssistantTextRef.current =
          msg.text || '';

        try {
          const result =
            await audioApi.play({
              base64: msg.audio,
              mimeType: msg.mimeType,
              generation,
              messageId: msg.messageId,

              isStale: (g) =>
                Number(g || 0) <
                localGenerationRef.current,
            });

          if (
            result?.blockedAsStale
          ) {
            setStaleBlockedCount(
              (count) => count + 1
            );

            conversationApi?.updateMessage(
              msg.messageId,
              {
                status: 'discarded',
              }
            );
          }
        } catch (err) {
          console.error(
            'audio.play failed',
            err
          );

          setError(
            err?.message ||
              'Audio playback failed'
          );
        }
      }
    );

    const unsubInterruptionAck =
      socket.on(
        WS_MESSAGE_TYPES.INTERRUPTION_ACK,
        (msg) => {
          if (!mountedRef.current) return;

          log(
            'interruption_ack',
            msg
          );

          setState(
            VOICE_STATE.RECOVERING
          );

          apiRefs.current.conversation?.addInterruption(
            {
              oldGeneration:
                Number(msg.newGeneration || 0) - 1,

              newGeneration:
                Number(msg.newGeneration || 0),

              cancelledCount:
                msg.cancelledCount || 0,

              audioStopLatencyMs:
                apiRefs.current.interruption
                  ?.current()
                  ?.audioStopLatencyMs,
            }
          );
        }
      );

    const unsubStale = socket.on(
      WS_MESSAGE_TYPES.STALE_RESPONSE_BLOCKED,
      () => {
        if (!mountedRef.current) return;

        setStaleBlockedCount(
          (count) => count + 1
        );
      }
    );

    const unsubSTTInterim = socket.on(
      WS_MESSAGE_TYPES.STT_INTERIM,
      (msg) => {
        if (!mountedRef.current) return;

        setInterimText(
          msg.text || ''
        );
      }
    );

    const unsubSTTFinal = socket.on(
      WS_MESSAGE_TYPES.STT_FINAL,
      (msg) => {
        if (!mountedRef.current) return;

        setInterimText('');

        const text =
          String(msg.text || '').trim();

        if (text) {
          submitUserSpeechRef.current(text);
        }

        // Server-side STT (Deepgram) path:
        // stop listening after one finished utterance
        // instead of leaving the audio stream open
        // indefinitely — mirrors the browser
        // SpeechRecognition behavior below.
        if (serverSTTActiveRef.current) {
          try {
            socketRef.current?.stopAudioStream();
          } catch {}

          try {
            audioCaptureRef.current?.stop();
          } catch {}

          serverSTTActiveRef.current = false;

          setMicActive(false);
        }
      }
    );

    const unsubError = socket.on(
      WS_MESSAGE_TYPES.ERROR,
      (msg) => {
        if (!mountedRef.current) return;

        console.warn(
          'WS error:',
          msg
        );

        setError(
          msg.message ||
            'Unknown WebSocket error'
        );
      }
    );

    socket.connect();

    return () => {
      mountedRef.current = false;

      log('Cleaning up WebSocket');

      unsubConn?.();
      unsubHello?.();
      unsubSessionStart?.();
      unsubState?.();
      unsubToolStart?.();
      unsubToolDone?.();
      unsubLLM?.();
      unsubAudioChunk?.();
      unsubAudioComplete?.();
      unsubAudio?.();
      unsubInterruptionAck?.();
      unsubStale?.();
      unsubSTTInterim?.();
      unsubSTTFinal?.();
      unsubError?.();

      try {
        socket.disconnect();
      } catch {}

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [autoConnect]);

  useEffect(() => {
    const unsubscribe =
      audio.subscribe((event) => {
        if (
          event.type === 'play' ||
          event.type === 'chunk_start'
        ) {
          const record =
            interruption.current();

          if (record) {
            interruption.markRecovered({
              newGeneration:
                localGenerationRef.current,
            });

            setState(
              VOICE_STATE.SPEAKING
            );
          }
        }

        if (
          event.type === 'ended' ||
          event.type === 'all_complete'
        ) {
          const generation =
            Number(event.generation || 0);

          if (
            generation === 0 ||
            generation >=
              localGenerationRef.current
          ) {
            setState(
              VOICE_STATE.COMPLETED
            );

            setVadActive(false);
          }
        }
      });

    return () => {
      unsubscribe?.();
    };
  }, [audio, interruption]);

  const setupRecognizer = useCallback(() => {
    if (recognizerRef.current) {
      return recognizerRef.current;
    }

    const recognizer =
      createRecognizer();

    if (!recognizer) {
      setRecognitionSupported(false);
      return null;
    }

    recognizer.onstart = () => {
      recognizerActiveRef.current =
        true;

      setMicActive(true);

      setState((current) => {
        if (
          current ===
            VOICE_STATE.SPEAKING ||
          current ===
            VOICE_STATE.TOOL_RUNNING
        ) {
          return current;
        }

        return VOICE_STATE.LISTENING;
      });
    };

    recognizer.onresult = (
      event
    ) => {
      let interim = '';
      let finalText = '';

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const result =
          event.results[i];

        if (result.isFinal) {
          finalText +=
            result[0]?.transcript || '';
        } else {
          interim +=
            result[0]?.transcript || '';
        }
      }

      if (
        interim &&
        !serverSTTActiveRef.current
      ) {
        setInterimText(interim);
      }

      if (
        finalText.trim() &&
        !serverSTTActiveRef.current
      ) {
        setInterimText('');

        submitUserSpeechRef.current(
          finalText
        );

        // Stop listening after ONE finished utterance
        // instead of staying open indefinitely
        // (continuous = true would otherwise keep the
        // mic listening forever — including picking up
        // the assistant's own spoken reply — until the
        // user manually taps the mic button off).
        recognizer._shouldRestart = false;

        try {
          recognizer.stop();
        } catch {}
      }
    };

    recognizer.onerror = (
      event
    ) => {
      console.warn(
        'SpeechRecognition error:',
        event.error
      );

      if (
        event.error ===
          'not-allowed' ||
        event.error ===
          'service-not-allowed'
      ) {
        setError(
          'Microphone permission denied.'
        );

        setMicActive(false);

        recognizerActiveRef.current =
          false;
      }
    };

    recognizer.onend = () => {
      recognizerActiveRef.current =
        false;

      setMicActive(false);

      if (
        recognizer._shouldRestart &&
        mountedRef.current
      ) {
        try {
          recognizer.start();
        } catch {}
      }
    };

    recognizerRef.current =
      recognizer;

    return recognizer;
  }, []);

  const startMic = useCallback(
    async () => {
      if (
        !socketRef.current ||
        !connected
      ) {
        setError(
          'Voice connection is not ready.'
        );

        return false;
      }

      const useServerSTT =
        ENABLE_SERVER_STT &&
        Boolean(
          capabilities?.serverSTT
        );

      if (useServerSTT) {
        try {
          if (
            !audioCaptureRef.current
          ) {
            audioCaptureRef.current =
              new AudioCapture();
          }

          const stream =
            await audioCaptureRef.current.start(
              {
                onAudioChunk:
                  (pcmBuffer) => {
                    if (
                      serverSTTActiveRef.current
                    ) {
                      socketRef.current?.sendAudio(
                        pcmBuffer
                      );
                    }
                  },

                onStreamReady:
                  (mediaStream) => {
                    if (
                      mountedRef.current
                    ) {
                      setMicStream(
                        mediaStream
                      );
                    }
                  },
              }
            );

          if (!mountedRef.current) {
            return false;
          }

          setMicStream(stream);

          serverSTTActiveRef.current =
            true;

          socketRef.current?.startAudioStream(
            {
              language: 'en-US',
            }
          );

          setMicActive(true);

          setState(
            VOICE_STATE.LISTENING
          );

          log(
            'Server STT started'
          );

          return true;
        } catch (err) {
          console.error(
            'Server STT start failed:',
            err
          );

          serverSTTActiveRef.current =
            false;

          setError(
            'Could not start server STT: ' +
              (err?.message ||
                'Unknown error')
          );

          return false;
        }
      }

      const recognizer =
        setupRecognizer();

      if (!recognizer) {
        return false;
      }

      recognizer._shouldRestart =
        true;

      if (
        !recognizerActiveRef.current
      ) {
        try {
          recognizer.start();
        } catch (err) {
          if (
            err?.name !==
            'InvalidStateError'
          ) {
            setError(
              'Could not start microphone.'
            );

            return false;
          }
        }

        if (!micStream) {
          try {
            const stream =
              await navigator.mediaDevices.getUserMedia(
                {
                  audio: {
                    echoCancellation:
                      true,
                    noiseSuppression:
                      true,
                    autoGainControl:
                      true,
                  },
                }
              );

            if (
              mountedRef.current
            ) {
              setMicStream(stream);
            }
          } catch (err) {
            log(
              'VAD mic stream failed',
              err?.message
            );
          }
        }
      }

      return true;
    },
    [
      connected,
      capabilities,
      setupRecognizer,
      micStream,
    ]
  );

  const stopMic = useCallback(() => {
    if (
      serverSTTActiveRef.current
    ) {
      try {
        socketRef.current?.stopAudioStream();
      } catch {}

      try {
        audioCaptureRef.current?.stop();
      } catch {}

      serverSTTActiveRef.current =
        false;
    }

    const recognizer =
      recognizerRef.current;

    if (recognizer) {
      recognizer._shouldRestart =
        false;

      try {
        recognizer.stop();
      } catch {}
    }

    if (micStream) {
      try {
        micStream
          .getTracks()
          .forEach((track) =>
            track.stop()
          );
      } catch {}

      setMicStream(null);
    }

    setMicActive(false);

    setVadActive(false);

    setInterimText('');

    setState((current) => {
      if (
        current ===
        VOICE_STATE.LISTENING
      ) {
        return VOICE_STATE.IDLE;
      }

      return current;
    });
  }, [micStream]);

  const toggleMic = useCallback(() => {
    if (micActive) {
      stopMic();
    } else {
      startMic();
    }
  }, [
    micActive,
    stopMic,
    startMic,
  ]);

  const manualStop = useCallback(() => {
    if (
      state ===
        VOICE_STATE.SPEAKING ||
      audio.isPlaying
    ) {
      triggerInterruption(
        '',
        INTERRUPTION_REASON.USER_CLICK
      );
    }
  }, [
    state,
    audio.isPlaying,
    triggerInterruption,
  ]);

  const sendText = useCallback(
    (text) => {
      submitUserSpeechRef.current(
        text
      );
    },
    []
  );

  const updateConfig = useCallback(
    (config) => {
      socketRef.current?.updateConfig(
        config
      );
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetConversation =
    useCallback(() => {
      audio.stop();

      audio.resetChunkedForGeneration(
        0
      );

      conversation.reset();

      interruption.reset();

      latency.reset();

      localGenerationRef.current = 0;

      currentAssistantMsgIdRef.current =
        null;

      currentAssistantTextRef.current =
        '';

      lastUserTextRef.current = '';

      requestSentTsRef.current =
        null;

      setStaleBlockedCount(0);

      setInterimText('');

      setState(
        VOICE_STATE.IDLE
      );

      setVadActive(false);
    }, [
      audio,
      conversation,
      interruption,
      latency,
    ]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      try {
        audioCaptureRef.current?.stop();
      } catch {}

      const stream =
        micStream;

      if (stream) {
        try {
          stream
            .getTracks()
            .forEach((track) =>
              track.stop()
            );
        } catch {}
      }

      const recognizer =
        recognizerRef.current;

      if (recognizer) {
        recognizer._shouldRestart =
          false;

        try {
          recognizer.stop();
        } catch {}
      }
    };
  }, []);

  return {
    connected,
    sessionId,
    conversationId,

    rimeInfo,
    capabilities,

    state,
    error,
    clearError,

    messages:
      conversation.messages,

    interruptions:
      conversation.interruptions,

    toolCalls:
      conversation.toolCalls,

    interimText,

    staleBlockedCount,

    metrics:
      latency.metrics,

    getStats:
      latency.getStats,

    interruptionHistory:
      interruption.history,

    micActive,

    startMic,
    stopMic,
    toggleMic,

    recognitionSupported:
      supported &&
      recognitionSupported,

    sendText,

    manualStop,

    updateConfig,

    resetConversation,

    isPlaying:
      audio.isPlaying,

    streamingMode:
      audio.streamingMode,

    vadEnergy:
      vad.energy,

    vadSpeaking:
      vad.isSpeaking,

    vadActive:
      vad.isActive,

    serverSTTActive:
      serverSTTActiveRef.current,
  };
}

export default useVoice;