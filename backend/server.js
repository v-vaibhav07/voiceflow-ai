// /**
//  * VoiceFlow Backend Server
//  *
//  * HTTP (REST) + WebSocket server.
//  * WebSocket handles real-time voice pipeline including interruptions.
//  */

// const express = require('express');
// const http = require('http');
// const cors = require('cors');
// const helmet = require('helmet');
// const { WebSocketServer } = require('ws');
// const { v4: uuidv4 } = require('uuid');

// const { loadConfig } = require('./config/env');
// const { getSupabase } = require('./config/supabase');
// const { validateRimeConfig } = require('./config/rime');

// const { RimeService } = require('./services/rimeService');
// const { LLMService } = require('./services/llmService');
// const { ToolService } = require('./services/toolService');
// const { SpeechService } = require('./services/speechService');
// const { InterruptionService } = require('./services/interruptionService');
// const { OrchestrationService } = require('./services/orchestrationService');
// const { EvaluationService } = require('./services/evaluationService');

// const { VoiceController } = require('./controllers/voiceController');
// const { ConversationController } = require('./controllers/conversationController');
// const { EvaluationController } = require('./controllers/evaluationController');

// const { voiceRoutes } = require('./routes/voiceRoutes');
// const { conversationRoutes } = require('./routes/conversationRoutes');
// const { evaluationRoutes } = require('./routes/evaluationRoutes');
// const { healthRoutes } = require('./routes/healthRoutes');

// const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
// const { requestLogger } = require('./middleware/requestLogger');
// const { createRateLimiter } = require('./middleware/rateLimiter');

// const { GenerationRegistry } = require('./utils/requestGeneration');
// const logger = require('./utils/logger');

// // ─────────────── Bootstrap ───────────────
// const config = loadConfig();
// validateRimeConfig(config);

// const supabase = getSupabase(config);

// const generationRegistry = new GenerationRegistry();
// const rimeService = new RimeService(config);
// const llmService = new LLMService(config);
// const toolService = new ToolService(config);
// const speechService = new SpeechService();
// const interruptionService = new InterruptionService({ supabase, generationRegistry });
// const orchestrationService = new OrchestrationService({
//   supabase,
//   rimeService,
//   llmService,
//   toolService,
//   interruptionService,
//   generationRegistry,
// });
// const evaluationService = new EvaluationService({ supabase });

// // ─────────────── Express App ───────────────
// const app = express();

// app.use(helmet());
// app.use(
//   cors({
//     origin: config.server.corsOrigin.split(',').map((s) => s.trim()),
//     credentials: true,
//   })
// );
// app.use(express.json({ limit: '5mb' }));
// app.use(requestLogger);
// app.use(createRateLimiter(config));

// const voiceController = new VoiceController({ rimeService, config });
// const conversationController = new ConversationController({ supabase });
// const evaluationController = new EvaluationController({ evaluationService });

// app.use('/api/health', healthRoutes());
// app.use('/api/voice', voiceRoutes(voiceController));
// app.use('/api/conversations', conversationRoutes(conversationController));
// app.use('/api/evaluation', evaluationRoutes(evaluationController));

// app.get('/', (req, res) => {
//   res.json({
//     service: 'VoiceFlow Backend',
//     version: '1.0.0',
//     endpoints: {
//       health: '/api/health',
//       voice: '/api/voice',
//       conversations: '/api/conversations',
//       evaluation: '/api/evaluation',
//       websocket: '/ws',
//     },
//   });
// });

// app.use(notFoundHandler);
// app.use(errorHandler);

// // ─────────────── HTTP + WebSocket Server ───────────────
// const server = http.createServer(app);
// const wss = new WebSocketServer({ server, path: '/ws' });

// wss.on('connection', (ws, req) => {
//   const sessionId = uuidv4();
//   const sessionLog = logger.child({ sessionId });
//   sessionLog.info('WebSocket connected');

//   const send = (obj) => {
//     if (ws.readyState === ws.OPEN) {
//       try { ws.send(JSON.stringify(obj)); } catch (e) { sessionLog.error('WS send failed', { error: e.message }); }
//     }
//   };

//   ws.on('message', async (raw) => {
//     let msg;
//     try { msg = JSON.parse(raw.toString()); }
//     catch { send({ type: 'error', message: 'Invalid JSON' }); return; }

//     try {
//       switch (msg.type) {
//         case 'start_session': {
//           const { conversationId } = await orchestrationService.startSession(sessionId, {
//             userId: msg.userId,
//             conversationId: msg.conversationId,
//             config: msg.config,
//           });
//           send({ type: 'session_started', sessionId, conversationId });
//           break;
//         }

//         case 'update_config': {
//           orchestrationService.updateSessionConfig(sessionId, msg.config || {});
//           send({ type: 'config_updated', config: msg.config });
//           break;
//         }

//         case 'user_speech': {
//           const text = speechService.normalize(msg.text);
//           if (!speechService.isValidTranscription(text)) {
//             send({ type: 'error', message: 'Invalid transcription' });
//             return;
//           }

//           const callbacks = buildCallbacks(send);
//           orchestrationService
//             .processUserInput(sessionId, text, callbacks)
//             .catch((err) => sessionLog.error('processUserInput failed', { error: err.message }));
//           break;
//         }

//         case 'interruption': {
//           const newText = speechService.normalize(msg.text || '');
//           const callbacks = buildCallbacks(send);

//           const { newGeneration, cancelledCount } = await orchestrationService.handleInterruptionAndProcess(
//             sessionId,
//             newText,
//             {
//               reason: msg.reason || 'user_speech',
//               oldRequest: msg.oldRequest,
//               interruptedMessageId: msg.interruptedMessageId,
//               detectionLatencyMs: msg.detectionLatencyMs,
//               audioStopLatencyMs: msg.audioStopLatencyMs,
//             },
//             callbacks
//           );

//           send({
//             type: 'interruption_ack',
//             newGeneration,
//             cancelledCount,
//           });
//           break;
//         }

//         case 'ping': {
//           send({ type: 'pong', timestamp: Date.now() });
//           break;
//         }

//         default:
//           send({ type: 'error', message: `Unknown message type: ${msg.type}` });
//       }
//     } catch (err) {
//       sessionLog.error('WS message handling failed', { error: err.message, type: msg?.type });
//       send({ type: 'error', message: err.message });
//     }
//   });

//   ws.on('close', () => {
//     sessionLog.info('WebSocket disconnected');
//     orchestrationService.endSession(sessionId);
//   });

//   ws.on('error', (err) => {
//     sessionLog.error('WebSocket error', { error: err.message });
//   });

//   // Send initial hello
//   send({
//     type: 'hello',
//     sessionId,
//     rime: require('./config/rime').getPublicRimeInfo(config),
//   });
// });

// function buildCallbacks(send) {
//   return {
//     onStateChange: ({ state, generation }) =>
//       send({ type: 'state_change', state, generation }),
//     onToolStart: ({ toolName, toolArgs, callId, generation }) =>
//       send({ type: 'tool_started', toolName, toolArgs, callId, generation }),
//     onToolResult: ({ toolName, result, callId, generation }) =>
//       send({ type: 'tool_completed', toolName, result, callId, generation }),
//     onLLMResponse: ({ text, generation, messageId }) =>
//       send({ type: 'llm_response', text, generation, messageId }),
//     onAudio: ({ audio, mimeType, format, durationMs, latencyMs, provider, model, voice, text, generation, messageId, totalLatencyMs, recoveryLatencyMs }) =>
//       send({
//         type: 'tts_audio',
//         audio,
//         mimeType,
//         format,
//         durationMs,
//         latencyMs,
//         provider,
//         model,
//         voice,
//         text,
//         generation,
//         messageId,
//         totalLatencyMs,
//         recoveryLatencyMs,
//       }),
//     onError: ({ error, generation }) =>
//       send({ type: 'error', message: error, generation }),
//     onStale: ({ generation }) =>
//       send({ type: 'stale_response_blocked', generation }),
//   };
// }

// // ─────────────── Startup ───────────────
// const PORT = config.server.port;
// server.listen(PORT, () => {
//   logger.info('════════════════════════════════════════');
//   logger.info('  VoiceFlow Backend Started');
//   logger.info(`  Port: ${PORT}`);
//   logger.info(`  Env:  ${config.server.nodeEnv}`);
//   logger.info(`  CORS: ${config.server.corsOrigin}`);
//   logger.info(`  Rime: ${config.rime.model} / ${config.rime.voice}`);
//   logger.info(`  LLM:  ${config.openai.model}`);
//   logger.info(`  DB:   ${supabase ? 'connected' : 'not configured'}`);
//   logger.info('  WebSocket: /ws');
//   logger.info('════════════════════════════════════════');
// });

// // ─────────────── Graceful Shutdown ───────────────
// function shutdown(signal) {
//   logger.info(`Received ${signal}, shutting down...`);
//   wss.clients.forEach((client) => {
//     try { client.close(1001, 'Server shutting down'); } catch {}
//   });
//   server.close(() => {
//     logger.info('Server closed');
//     process.exit(0);
//   });
//   setTimeout(() => {
//     logger.warn('Force exit after timeout');
//     process.exit(1);
//   }, 10000);
// }

// process.on('SIGTERM', () => shutdown('SIGTERM'));
// process.on('SIGINT', () => shutdown('SIGINT'));

// process.on('uncaughtException', (err) => {
//   logger.error('Uncaught exception', { error: err.message, stack: err.stack });
// });
// process.on('unhandledRejection', (reason) => {
//   logger.error('Unhandled rejection', { reason: String(reason) });
// });

// module.exports = { app, server };











/**
 * VoiceFlow Backend Server
 *
 * HTTP (REST) + WebSocket server.
 * WebSocket handles real-time voice pipeline including interruptions
 * and server-side STT audio streaming.
 */
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const { loadConfig } = require('./config/env');
const { getSupabase } = require('./config/supabase');

const {
  validateRimeConfig,
  getPublicRimeInfo,
} = require('./config/rime');

const { RimeService } = require('./services/rimeService');
const { LLMService } = require('./services/llmService');
const { ToolService } = require('./services/toolService');
const { SpeechService } = require('./services/speechService');
const { STTService } = require('./services/sttService');
const { InterruptionService } = require('./services/interruptionService');
const { OrchestrationService } = require('./services/orchestrationService');
const { EvaluationService } = require('./services/evaluationService');

const { VoiceController } = require('./controllers/voiceController');
const { ConversationController } = require('./controllers/conversationController');
const { EvaluationController } = require('./controllers/evaluationController');

const { voiceRoutes } = require('./routes/voiceRoutes');
const { conversationRoutes } = require('./routes/conversationRoutes');
const { evaluationRoutes } = require('./routes/evaluationRoutes');
const { healthRoutes } = require('./routes/healthRoutes');

const {
  errorHandler,
  notFoundHandler,
} = require('./middleware/errorHandler');

const { requestLogger } = require('./middleware/requestLogger');
const { createRateLimiter } = require('./middleware/rateLimiter');

const { GenerationRegistry } = require('./utils/requestGeneration');
const logger = require('./utils/logger');

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────

const config = loadConfig();

validateRimeConfig(config);

const supabase = getSupabase(config);

const generationRegistry =
  new GenerationRegistry();

const rimeService =
  new RimeService(config);

const llmService =
  new LLMService(config);

const toolService =
  new ToolService(config);

const speechService =
  new SpeechService();

const sttService =
  new STTService(config);

const interruptionService =
  new InterruptionService({
    supabase,
    generationRegistry,
  });

// IMPORTANT:
// config is passed here so OrchestrationService
// can correctly respect streaming.enabled.
const orchestrationService =
  new OrchestrationService({
    supabase,
    rimeService,
    llmService,
    toolService,
    interruptionService,
    generationRegistry,
    config,
  });

const evaluationService =
  new EvaluationService({
    supabase,
  });

// ─────────────────────────────────────────────
// Express App
// ─────────────────────────────────────────────

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: config.server.corsOrigin
      .split(',')
      .map((s) => s.trim()),
    credentials: true,
  })
);

app.use(
  express.json({
    limit: '5mb',
  })
);

app.use(requestLogger);

app.use(
  createRateLimiter(config)
);

// ─────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────

const voiceController =
  new VoiceController({
    rimeService,
    config,
  });

const conversationController =
  new ConversationController({
    supabase,
  });

const evaluationController =
  new EvaluationController({
    evaluationService,
  });

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────

app.use(
  '/api/health',
  healthRoutes()
);

app.use(
  '/api/voice',
  voiceRoutes(voiceController)
);

app.use(
  '/api/conversations',
  conversationRoutes(
    conversationController
  )
);

app.use(
  '/api/evaluation',
  evaluationRoutes(
    evaluationController
  )
);

// ─────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    service: 'VoiceFlow Backend',
    version: '1.0.0',

    endpoints: {
      health: '/api/health',
      voice: '/api/voice',
      conversations: '/api/conversations',
      evaluation: '/api/evaluation',
      websocket: '/ws',
    },
  });
});

// ─────────────────────────────────────────────
// Error Middleware
// ─────────────────────────────────────────────

app.use(notFoundHandler);

app.use(errorHandler);

// ─────────────────────────────────────────────
// HTTP Server
// ─────────────────────────────────────────────

const server =
  http.createServer(app);

server.on('upgrade', (req) => {
  console.log('🔥 UPGRADE REQUEST:', req.url);
});

// ─────────────────────────────────────────────
// WebSocket Server
// ─────────────────────────────────────────────

const wss =
  new WebSocketServer({
    server,
    path: '/ws',
  });

// ─────────────────────────────────────────────
// WebSocket Connection
// ─────────────────────────────────────────────

wss.on(
  'connection',
  (ws, req) => {
    const sessionId =
      uuidv4();

    const sessionLog =
      logger.child({
        sessionId,
      });

    sessionLog.info(
      'WebSocket connected'
    );

    // Each WebSocket gets its own STT session.
    ws._sttSession = null;
    ws._sttController = null;

    // ───────────────────────────────────────
    // Safe WebSocket Send
    // ───────────────────────────────────────

    const send = (obj) => {
      if (
        ws.readyState !== ws.OPEN
      ) {
        return;
      }

      try {
        ws.send(
          JSON.stringify(obj)
        );
      } catch (e) {
        sessionLog.error(
          'WS send failed',
          {
            error: e.message,
          }
        );
      }
    };

    // ───────────────────────────────────────
    // WebSocket Messages
    // ───────────────────────────────────────

    ws.on(
      'message',
      async (
        raw,
        isBinary
      ) => {
        // ─────────────────────────────────
        // Binary audio → Server STT
        // ─────────────────────────────────

        if (isBinary) {
          if (
            ws._sttSession?.isActive
          ) {
            try {
              ws._sttSession.feedAudio(
                raw
              );
            } catch (err) {
              sessionLog.error(
                'STT audio feed failed',
                {
                  error:
                    err.message,
                }
              );

              send({
                type: 'error',
                message:
                  `STT audio error: ${err.message}`,
              });
            }
          }

          return;
        }

        // ─────────────────────────────────
        // Parse JSON
        // ─────────────────────────────────

        let msg;

        try {
          msg = JSON.parse(
            raw.toString()
          );
        } catch {
          send({
            type: 'error',
            message:
              'Invalid JSON',
          });

          return;
        }

        // ─────────────────────────────────
        // Handle Message
        // ─────────────────────────────────

        try {
          switch (msg.type) {

            // ═══════════════════════════════
            // START SESSION
            // ═══════════════════════════════

            case 'start_session': {
              const {
                conversationId,
              } =
                await orchestrationService.startSession(
                  sessionId,
                  {
                    userId:
                      msg.userId,

                    conversationId:
                      msg.conversationId,

                    config:
                      msg.config,
                  }
                );

              send({
                type:
                  'session_started',

                sessionId,

                conversationId,
              });

              break;
            }

            // ═══════════════════════════════
            // UPDATE CONFIG
            // ═══════════════════════════════

            case 'update_config': {
              orchestrationService.updateSessionConfig(
                sessionId,
                msg.config || {}
              );

              send({
                type:
                  'config_updated',

                config:
                  msg.config || {},
              });

              break;
            }

            // ═══════════════════════════════
            // USER SPEECH
            // ═══════════════════════════════

            case 'user_speech': {
              const text =
                speechService.normalize(
                  msg.text
                );

              if (
                !speechService.isValidTranscription(
                  text
                )
              ) {
                send({
                  type: 'error',
                  message:
                    'Invalid transcription',
                });

                return;
              }

              const callbacks =
                buildCallbacks(
                  send
                );

              orchestrationService
                .processUserInput(
                  sessionId,
                  text,
                  callbacks
                )
                .catch(
                  (err) => {
                    sessionLog.error(
                      'processUserInput failed',
                      {
                        error:
                          err.message,
                      }
                    );
                  }
                );

              break;
            }

            // ═══════════════════════════════
            // INTERRUPTION
            // ═══════════════════════════════

            case 'interruption': {
              const newText =
                speechService.normalize(
                  msg.text || ''
                );

              const callbacks =
                buildCallbacks(
                  send
                );

              const {
                newGeneration,
                cancelledCount,
              } =
                await orchestrationService.handleInterruptionAndProcess(
                  sessionId,
                  newText,
                  {
                    reason:
                      msg.reason ||
                      'user_speech',

                    oldRequest:
                      msg.oldRequest,

                    interruptedMessageId:
                      msg.interruptedMessageId,

                    detectionLatencyMs:
                      msg.detectionLatencyMs,

                    audioStopLatencyMs:
                      msg.audioStopLatencyMs,
                  },
                  callbacks
                );

              send({
                type:
                  'interruption_ack',

                newGeneration,

                cancelledCount,
              });

              break;
            }

            // ═══════════════════════════════
            // PING
            // ═══════════════════════════════

            case 'ping': {
              send({
                type: 'pong',
                timestamp:
                  Date.now(),
              });

              break;
            }

            // ═══════════════════════════════
            // START SERVER STT
            // ═══════════════════════════════

            case 'audio_stream_start': {

              // Close previous STT session.
              if (
                ws._sttSession
              ) {
                try {
                  ws._sttSession.close(
                    'restart'
                  );
                } catch (err) {
                  sessionLog.warn(
                    'Failed to close previous STT session',
                    {
                      error:
                        err.message,
                    }
                  );
                }

                ws._sttSession =
                  null;
              }

              if (
                ws._sttController
              ) {
                try {
                  ws._sttController.abort();
                } catch {}

                ws._sttController =
                  null;
              }

              // Check Deepgram availability.
              if (
                !sttService.isAvailable()
              ) {
                send({
                  type: 'error',
                  message:
                    'Server STT not configured',
                });

                return;
              }

              const sttController =
                new AbortController();

              const sttSession =
                sttService.createStreamingSession(
                  {
                    language:
                      msg.language ||
                      config.deepgram.language,

                    signal:
                      sttController.signal,

                    onTranscript:
                      ({
                        text,
                        isFinal,
                        confidence,
                      }) => {

                        if (!text) {
                          return;
                        }

                        if (
                          isFinal
                        ) {
                          send({
                            type:
                              'stt_final',

                            text,

                            confidence,
                          });
                        } else {
                          send({
                            type:
                              'stt_interim',

                            text,

                            confidence,
                          });
                        }
                      },

                    onError:
                      (err) => {
                        sessionLog.error(
                          'STT session error',
                          {
                            error:
                              err.message,
                          }
                        );

                        send({
                          type:
                            'error',

                          message:
                            `STT error: ${err.message}`,
                        });
                      },

                    onClose:
                      (reason) => {
                        sessionLog.info(
                          'STT session closed',
                          {
                            reason,
                          }
                        );
                      },
                  }
                );

              ws._sttSession =
                sttSession;

              ws._sttController =
                sttController;

              send({
                type:
                  'stt_started',

                provider:
                  'deepgram',

                language:
                  msg.language ||
                  config.deepgram.language,

                model:
                  config.deepgram.model,
              });

              break;
            }

            // ═══════════════════════════════
            // STOP SERVER STT
            // ═══════════════════════════════

            case 'audio_stream_end': {

              if (
                ws._sttSession
              ) {
                try {
                  ws._sttSession.close(
                    'client'
                  );
                } catch (err) {
                  sessionLog.warn(
                    'Failed to close STT session',
                    {
                      error:
                        err.message,
                    }
                  );
                }

                ws._sttSession =
                  null;
              }

              if (
                ws._sttController
              ) {
                try {
                  ws._sttController.abort();
                } catch {}

                ws._sttController =
                  null;
              }

              send({
                type:
                  'stt_stopped',
              });

              break;
            }

            // ═══════════════════════════════
            // UNKNOWN MESSAGE
            // ═══════════════════════════════

            default: {
              send({
                type: 'error',

                message:
                  `Unknown message type: ${msg.type}`,
              });
            }
          }
        } catch (err) {
          sessionLog.error(
            'WS message handling failed',
            {
              error:
                err.message,

              type:
                msg?.type,
            }
          );

          send({
            type: 'error',
            message:
              err.message,
          });
        }
      }
    );

    // ───────────────────────────────────────
    // WebSocket Close
    // ───────────────────────────────────────

    ws.on(
      'close',
      () => {
        sessionLog.info(
          'WebSocket disconnected'
        );

        // Close STT.
        if (
          ws._sttSession
        ) {
          try {
            ws._sttSession.close(
              'disconnect'
            );
          } catch (err) {
            sessionLog.warn(
              'Failed to close STT session on disconnect',
              {
                error:
                  err.message,
              }
            );
          }

          ws._sttSession =
            null;
        }

        // Abort STT controller.
        if (
          ws._sttController
        ) {
          try {
            ws._sttController.abort();
          } catch {}

          ws._sttController =
            null;
        }

        // End orchestration session.
        try {
          orchestrationService.endSession(
            sessionId
          );
        } catch (err) {
          sessionLog.warn(
            'Failed to end orchestration session',
            {
              error:
                err.message,
            }
          );
        }
      }
    );

    // ───────────────────────────────────────
    // WebSocket Error
    // ───────────────────────────────────────

    ws.on(
      'error',
      (err) => {
        sessionLog.error(
          'WebSocket error',
          {
            error:
              err.message,
          }
        );
      }
    );

    // ───────────────────────────────────────
    // Initial HELLO
    // ───────────────────────────────────────

    send({
      type: 'hello',

      sessionId,

      rime:
        getPublicRimeInfo(
          config
        ),

      capabilities: {
        serverSTT:
          sttService.isAvailable(),

        streamingTTS:
          config.streaming.enabled,

        sttProvider:
          sttService.isAvailable()
            ? 'deepgram'
            : 'browser',
      },
    });
  }
);

// ─────────────────────────────────────────────
// WebSocket Callbacks
// ─────────────────────────────────────────────

function buildCallbacks(send) {
  return {
    // ───────────────────────────────────────
    // State
    // ───────────────────────────────────────

    onStateChange: ({
      state,
      generation,
    }) => {
      send({
        type:
          'state_change',

        state,

        generation,
      });
    },

    // ───────────────────────────────────────
    // Tool Start
    // ───────────────────────────────────────

    onToolStart: ({
      toolName,
      toolArgs,
      callId,
      generation,
    }) => {
      send({
        type:
          'tool_started',

        toolName,

        toolArgs,

        callId,

        generation,
      });
    },

    // ───────────────────────────────────────
    // Tool Result
    // ───────────────────────────────────────

    onToolResult: ({
      toolName,
      result,
      callId,
      generation,
    }) => {
      send({
        type:
          'tool_completed',

        toolName,

        result,

        callId,

        generation,
      });
    },

    // ───────────────────────────────────────
    // LLM Response
    // ───────────────────────────────────────

    onLLMResponse: ({
      text,
      generation,
      messageId,
    }) => {
      send({
        type:
          'llm_response',

        text,

        generation,

        messageId,
      });
    },

    // ───────────────────────────────────────
    // TTS AUDIO
    // ───────────────────────────────────────

    onAudio: ({
      audio,
      mimeType,
      format,
      durationMs,
      latencyMs,
      provider,
      model,
      voice,
      text,
      generation,
      messageId,
      totalLatencyMs,
      recoveryLatencyMs,
      seq,
      isLast,
      isStreaming,
    }) => {

      // ─────────────────────────────────
      // Streaming TTS
      // ─────────────────────────────────

      if (isStreaming) {
        send({
          type:
            'tts_audio_chunk',

          audio,

          mimeType,

          format,

          durationMs,

          latencyMs,

          provider,

          model,

          voice,

          text,

          generation,

          messageId,

          seq,

          isLast,

          totalLatencyMs,

          recoveryLatencyMs,
        });

        return;
      }

      // ─────────────────────────────────
      // Legacy TTS
      // ─────────────────────────────────

      send({
        type:
          'tts_audio',

        audio,

        mimeType,

        format,

        durationMs,

        latencyMs,

        provider,

        model,

        voice,

        text,

        generation,

        messageId,

        totalLatencyMs,

        recoveryLatencyMs,
      });
    },

    // ───────────────────────────────────────
    // Error
    // ───────────────────────────────────────

    onError: ({
      error,
      generation,
    }) => {
      send({
        type:
          'error',

        message:
          error,

        generation,
      });
    },

    // ───────────────────────────────────────
    // Stale Response
    // ───────────────────────────────────────

    onStale: ({
      generation,
    }) => {
      send({
        type:
          'stale_response_blocked',

        generation,
      });
    },
  };
}

// ─────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────

const PORT =
  config.server.port;

server.listen(
  PORT,
  () => {
    logger.info(
      '════════════════════════════════════════'
    );

    logger.info(
      '  VoiceFlow Backend Started'
    );

    logger.info(
      `  Port: ${PORT}`
    );

    logger.info(
      `  Env: ${config.server.nodeEnv}`
    );

    logger.info(
      `  CORS: ${config.server.corsOrigin}`
    );

    logger.info(
      `  Rime: ${config.rime.model} / ${config.rime.voice}`
    );

    logger.info(
      `  LLM: ${config.openai.model}`
    );

    logger.info(
      `  DB: ${
        supabase
          ? 'connected'
          : 'not configured'
      }`
    );

    logger.info(
      `  Server STT: ${
        sttService.isAvailable()
          ? 'Deepgram'
          : 'not configured'
      }`
    );

    logger.info(
      `  Streaming TTS: ${
        config.streaming.enabled
          ? 'enabled'
          : 'disabled'
      }`
    );

    logger.info(
      '  WebSocket: /ws'
    );

    logger.info(
      '════════════════════════════════════════'
    );
  }
);

// ─────────────────────────────────────────────
// Graceful Shutdown
// ─────────────────────────────────────────────

function shutdown(signal) {
  logger.info(
    `Received ${signal}, shutting down...`
  );

  // Close all WebSocket clients.
  wss.clients.forEach(
    (client) => {
      try {
        client.close(
          1001,
          'Server shutting down'
        );
      } catch {}
    }
  );

  // Close HTTP server.
  server.close(
    () => {
      logger.info(
        'Server closed'
      );

      process.exit(0);
    }
  );

  // Safety timeout.
  setTimeout(
    () => {
      logger.warn(
        'Force exit after timeout'
      );

      process.exit(1);
    },
    10000
  );
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

// ─────────────────────────────────────────────
// Process Error Handling
// ─────────────────────────────────────────────

process.on(
  'uncaughtException',
  (err) => {
    logger.error(
      'Uncaught exception',
      {
        error:
          err.message,

        stack:
          err.stack,
      }
    );
  }
);

process.on(
  'unhandledRejection',
  (reason) => {
    logger.error(
      'Unhandled rejection',
      {
        reason:
          String(reason),
      }
    );
  }
);

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

module.exports = {
  app,
  server,
};