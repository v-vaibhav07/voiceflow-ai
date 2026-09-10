// /**
//  * Orchestration Service
//  *
//  * The central coordinator for the voice pipeline.
//  *
//  * Pipeline:
//  *   user speech → transcription → LLM → (tool call) → LLM → Rime TTS → audio out
//  *
//  * At every async boundary, the generation ID is checked. If the generation
//  * is stale (interruption occurred), work is discarded and never emitted.
//  */

// const { v4: uuidv4 } = require('uuid');
// const { db } = require('../config/supabase');
// const { LatencyTimer } = require('../utils/latencyUtils');
// const logger = require('../utils/logger');

// class OrchestrationService {
//   constructor({ supabase, rimeService, llmService, toolService, interruptionService, generationRegistry }) {
//     this.supabase = supabase;
//     this.rime = rimeService;
//     this.llm = llmService;
//     this.tools = toolService;
//     this.interruption = interruptionService;
//     this.registry = generationRegistry;
//     this.log = logger.child({ service: 'orchestration' });

//     // Session state: sessionId -> { conversationId, messages: [], config: {} }
//     this.sessions = new Map();
//   }

//   /**
//    * Initialize a session.
//    */
//   async startSession(sessionId, { userId, conversationId, config = {} } = {}) {
//     let convId = conversationId;

//     // Create conversation in DB if not provided
//     if (!convId && this.supabase) {
//       try {
//         const conv = await db.createConversation(this.supabase, userId || null, 'Voice Session');
//         convId = conv.id;
//       } catch (err) {
//         this.log.error('Failed to create conversation', { error: err.message });
//         convId = uuidv4();
//       }
//     }
//     if (!convId) convId = uuidv4();

//     this.sessions.set(sessionId, {
//       conversationId: convId,
//       messages: [],
//       config: {
//         toolDelayMs: config.toolDelayMs || 0,
//         ...config,
//       },
//       sequenceNumber: 0,
//     });

//     this.log.info('Session started', { sessionId, conversationId: convId });

//     return { conversationId: convId };
//   }

//   /**
//    * Update session config (e.g., for stress testing).
//    */
//   updateSessionConfig(sessionId, config) {
//     const session = this.sessions.get(sessionId);
//     if (session) {
//       session.config = { ...session.config, ...config };
//     }
//   }

//   /**
//    * Process user input end-to-end.
//    *
//    * @param {string} sessionId
//    * @param {string} userText
//    * @param {object} callbacks - { onStateChange, onToolStart, onToolResult, onLLMResponse, onAudio, onError, onStale }
//    */
//   async processUserInput(sessionId, userText, callbacks = {}) {
//     const session = this.sessions.get(sessionId);
//     if (!session) throw new Error(`Session not found: ${sessionId}`);

//     const tracker = this.registry.get(sessionId);
//     const generation = tracker.next();

//     const {
//       onStateChange = () => {},
//       onToolStart = () => {},
//       onToolResult = () => {},
//       onLLMResponse = () => {},
//       onAudio = () => {},
//       onError = () => {},
//       onStale = () => {},
//     } = callbacks;

//     const timer = new LatencyTimer('e2e').start();
//     const controller = new AbortController();
//     this.interruption.registerController(sessionId, generation, controller);

//     // Helper: bail out if this generation is stale
//     const isStale = () => {
//       if (!tracker.isCurrent(generation)) {
//         this.log.info('Processing bailed — generation stale', { sessionId, generation });
//         onStale({ generation });
//         return true;
//       }
//       return false;
//     };

//     try {
//       onStateChange({ state: 'PROCESSING', generation });

//       // 1. Persist user message
//       session.sequenceNumber += 1;
//       const userMsg = { role: 'user', content: userText };
//       session.messages.push(userMsg);

//       let userMessageRecord = null;
//       if (this.supabase) {
//         try {
//           userMessageRecord = await db.addMessage(this.supabase, {
//             conversation_id: session.conversationId,
//             role: 'user',
//             content: userText,
//             sequence_number: session.sequenceNumber,
//             status: 'complete',
//             generation,
//           });
//         } catch (err) {
//           this.log.error('Failed to persist user message', { error: err.message });
//         }
//       }

//       if (isStale()) return;

//       // 2. First LLM call
//       const llmResp1 = await this.llm.chat(session.messages, {
//         signal: controller.signal,
//         generation,
//       });

//       if (isStale()) return;

//       // 3. Handle tool calls if present
//       let finalText = llmResp1.text;
//       let toolCallRecord = null;

//       if (llmResp1.toolCalls && llmResp1.toolCalls.length > 0) {
//         onStateChange({ state: 'TOOL_RUNNING', generation });

//         // Add assistant tool-call message to context
//         session.messages.push({
//           role: 'assistant',
//           content: llmResp1.text || null,
//           tool_calls: llmResp1.toolCalls,
//         });

//         for (const toolCall of llmResp1.toolCalls) {
//           const toolName = toolCall.function.name;
//           let toolArgs = {};
//           try { toolArgs = JSON.parse(toolCall.function.arguments || '{}'); } catch {}

//           const callId = uuidv4();
//           onToolStart({ toolName, toolArgs, callId, generation });

//           if (this.supabase) {
//             try {
//               toolCallRecord = await db.addToolCall(this.supabase, {
//                 conversation_id: session.conversationId,
//                 tool_name: toolName,
//                 request_payload: toolArgs,
//                 status: 'running',
//                 generation,
//                 artificial_delay_ms: session.config.toolDelayMs,
//               });
//             } catch (err) {
//               this.log.error('Failed to record tool call', { error: err.message });
//             }
//           }

//           let toolResult = null;
//           let toolError = null;
//           try {
//             toolResult = await this.tools.execute(toolName, toolArgs, {
//               signal: controller.signal,
//               delayMs: session.config.toolDelayMs,
//               callId,
//               generation,
//             });
//           } catch (err) {
//             toolError = err;
//           }

//           // FENCING POINT: check stale after tool execution
//           if (isStale()) {
//             if (toolCallRecord && this.supabase) {
//               await db.updateToolCall(this.supabase, toolCallRecord.id, {
//                 status: 'stale',
//                 cancelled_at: new Date().toISOString(),
//                 response_payload: toolResult || null,
//               });
//             }
//             return;
//           }

//           if (toolError) {
//             const isCancelled = toolError.message === 'Tool aborted';
//             if (toolCallRecord && this.supabase) {
//               await db.updateToolCall(this.supabase, toolCallRecord.id, {
//                 status: isCancelled ? 'cancelled' : 'error',
//                 cancelled_at: isCancelled ? new Date().toISOString() : null,
//                 completed_at: !isCancelled ? new Date().toISOString() : null,
//               });
//             }
//             if (isCancelled) return;
//             throw toolError;
//           }

//           if (toolCallRecord && this.supabase) {
//             await db.updateToolCall(this.supabase, toolCallRecord.id, {
//               status: 'completed',
//               response_payload: toolResult,
//               completed_at: new Date().toISOString(),
//             });
//           }

//           onToolResult({ toolName, result: toolResult, callId, generation });

//           // Add tool result to messages
//           session.messages.push({
//             role: 'tool',
//             tool_call_id: toolCall.id,
//             content: JSON.stringify(toolResult),
//           });
//         }

//         // 4. Second LLM call with tool results
//         if (isStale()) return;

//         onStateChange({ state: 'PROCESSING', generation });

//         const llmResp2 = await this.llm.chat(session.messages, {
//           signal: controller.signal,
//           generation,
//           tools: [], // Prevent further tool calls in this cycle
//         });

//         if (isStale()) return;

//         finalText = llmResp2.text;
//       }

//       if (isStale()) return;
//       if (!finalText || !finalText.trim()) {
//         finalText = 'I apologize, I do not have a response for that.';
//       }

//       // 5. Persist assistant message
//       session.sequenceNumber += 1;
//       session.messages.push({ role: 'assistant', content: finalText });

//       let assistantMessageRecord = null;
//       if (this.supabase) {
//         try {
//           assistantMessageRecord = await db.addMessage(this.supabase, {
//             conversation_id: session.conversationId,
//             role: 'assistant',
//             content: finalText,
//             sequence_number: session.sequenceNumber,
//             status: 'streaming',
//             generation,
//           });
//         } catch (err) {
//           this.log.error('Failed to persist assistant message', { error: err.message });
//         }
//       }

//       onLLMResponse({
//         text: finalText,
//         generation,
//         messageId: assistantMessageRecord?.id,
//       });

//       // 6. Rime TTS synthesis
//       if (isStale()) return;
//       onStateChange({ state: 'SPEAKING', generation });

//       const rimeResult = await this.rime.synthesize(finalText, {
//         signal: controller.signal,
//         generation,
//       });

//       // FENCING POINT: check stale after Rime synthesis
//       if (isStale()) {
//         this.log.info('Rime audio discarded — stale generation', { sessionId, generation });
//         if (assistantMessageRecord && this.supabase) {
//           await db.updateMessage(this.supabase, assistantMessageRecord.id, {
//             status: 'discarded',
//           });
//         }
//         return;
//       }

//       // 7. Update message with audio metadata
//       if (assistantMessageRecord && this.supabase) {
//         try {
//           await db.updateMessage(this.supabase, assistantMessageRecord.id, {
//             status: 'complete',
//             audio_duration_ms: rimeResult.durationMs,
//             tts_provider: rimeResult.provider,
//             metadata: {
//               rime_model: rimeResult.model,
//               rime_voice: rimeResult.voice,
//               rime_latency_ms: rimeResult.latencyMs,
//             },
//           });
//         } catch (err) {
//           this.log.error('Failed to update assistant message', { error: err.message });
//         }
//       }

//       // 8. Emit audio
//       onAudio({
//         audio: rimeResult.audio,
//         mimeType: rimeResult.mimeType,
//         format: rimeResult.format,
//         durationMs: rimeResult.durationMs,
//         latencyMs: rimeResult.latencyMs,
//         provider: rimeResult.provider,
//         model: rimeResult.model,
//         voice: rimeResult.voice,
//         text: finalText,
//         generation,
//         messageId: assistantMessageRecord?.id,
//         totalLatencyMs: Math.round(timer.elapsed()),
//       });

//       // 9. Voice event
//       if (this.supabase) {
//         try {
//           await db.addVoiceEvent(this.supabase, {
//             conversation_id: session.conversationId,
//             event_type: 'tts_audio_received',
//             generation,
//             audio_duration_ms: rimeResult.durationMs,
//             metadata: { rime_latency_ms: rimeResult.latencyMs, total_latency_ms: Math.round(timer.elapsed()) },
//           });
//         } catch {}
//       }

//       onStateChange({ state: 'COMPLETED', generation });
//     } catch (error) {
//       // Cancelled errors are expected on interruption
//       if (
//         error.message === 'Tool aborted' ||
//         error.message === 'LLM request cancelled' ||
//         error.message === 'Rime synthesis cancelled' ||
//         error.message === 'Rime synthesis aborted' ||
//         controller.signal.aborted
//       ) {
//         this.log.info('Processing cancelled', { sessionId, generation });
//         return;
//       }
//       this.log.error('Processing failed', { sessionId, generation, error: error.message });
//       onError({ error: error.message, generation });
//       onStateChange({ state: 'ERROR', generation });
//     }
//   }

//   /**
//    * Handle interruption and process new input.
//    */
//   async handleInterruptionAndProcess(sessionId, newUserText, interruptionMeta, callbacks) {
//     const session = this.sessions.get(sessionId);
//     if (!session) throw new Error(`Session not found: ${sessionId}`);

//     const recoveryTimer = new LatencyTimer('recovery').start();

//     // 1. Handle interruption (increments generation, cancels controllers)
//     const { newGeneration, cancelledCount } = await this.interruption.handleInterruption({
//       sessionId,
//       conversationId: session.conversationId,
//       reason: interruptionMeta.reason || 'user_speech',
//       oldRequest: interruptionMeta.oldRequest,
//       newRequest: newUserText,
//       interruptedMessageId: interruptionMeta.interruptedMessageId,
//       detectionLatencyMs: interruptionMeta.detectionLatencyMs,
//       audioStopLatencyMs: interruptionMeta.audioStopLatencyMs,
//     });

//     // 2. Add a system marker to context showing the interruption
//     session.messages.push({
//       role: 'system',
//       content: `[The previous assistant response was interrupted by the user. Do not repeat information already spoken.]`,
//     });

//     // 3. Process the new input
//     await this.processUserInput(sessionId, newUserText, {
//       ...callbacks,
//       onAudio: async (audioEvent) => {
//         // Mark recovery complete when new audio is ready
//         const recoveryLatencyMs = Math.round(recoveryTimer.elapsed());
//         await this.interruption.markRecoveryComplete(sessionId, recoveryLatencyMs);
//         if (callbacks.onAudio) {
//           callbacks.onAudio({ ...audioEvent, recoveryLatencyMs });
//         }
//       },
//     });

//     return { newGeneration, cancelledCount };
//   }

//   /**
//    * Cleanup a session.
//    */
//   endSession(sessionId) {
//     this.interruption.cleanupSession(sessionId);
//     this.registry.remove(sessionId);
//     this.sessions.delete(sessionId);
//     this.log.info('Session ended', { sessionId });
//   }

//   getSession(sessionId) {
//     return this.sessions.get(sessionId);
//   }
// }

// module.exports = { OrchestrationService };





































/**
 * Orchestration Service
 *
 * Central coordinator for the voice pipeline.
 *
 * Pipeline:
 *   user speech
 *      ↓
 *   transcription
 *      ↓
 *   LLM
 *      ↓
 *   optional tool call
 *      ↓
 *   LLM
 *      ↓
 *   Rime TTS
 *      ↓
 *   audio out
 *
 * Generation fencing is applied at every async boundary so that
 * interrupted/stale generations never emit audio or state updates.
 */

const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/supabase');
const { LatencyTimer } = require('../utils/latencyUtils');
const logger = require('../utils/logger');

class OrchestrationService {
  constructor({
    supabase,
    rimeService,
    llmService,
    toolService,
    interruptionService,
    generationRegistry,
    config = null,
  }) {
    this.supabase = supabase;
    this.rime = rimeService;
    this.llm = llmService;
    this.tools = toolService;
    this.interruption = interruptionService;
    this.registry = generationRegistry;

    this.config = config;

    this.log = logger.child({
      service: 'orchestration',
    });

    // sessionId -> {
    //   conversationId,
    //   messages,
    //   config,
    //   sequenceNumber
    // }
    this.sessions = new Map();
  }

  /**
   * Initialize a session.
   */
  async startSession(
    sessionId,
    {
      userId,
      conversationId,
      config = {},
    } = {}
  ) {
    let convId = conversationId;

    if (!convId && this.supabase) {
      try {
        const conv = await db.createConversation(
          this.supabase,
          userId || null,
          'Voice Session'
        );

        convId = conv.id;
      } catch (err) {
        this.log.error(
          'Failed to create conversation',
          {
            error: err.message,
          }
        );

        convId = uuidv4();
      }
    }

    if (!convId) {
      convId = uuidv4();
    }

    this.sessions.set(sessionId, {
      conversationId: convId,
      messages: [],
      config: {
        toolDelayMs:
          config.toolDelayMs || 0,
        ...config,
      },
      sequenceNumber: 0,
    });

    this.log.info(
      'Session started',
      {
        sessionId,
        conversationId: convId,
      }
    );

    return {
      conversationId: convId,
    };
  }

  /**
   * Update session configuration.
   */
  updateSessionConfig(
    sessionId,
    config
  ) {
    const session =
      this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    session.config = {
      ...session.config,
      ...config,
    };
  }

  /**
   * Process user input end-to-end.
   */
  async processUserInput(
    sessionId,
    userText,
    callbacks = {}
  ) {
    const session =
      this.sessions.get(sessionId);

    if (!session) {
      throw new Error(
        `Session not found: ${sessionId}`
      );
    }

    const tracker =
      this.registry.get(sessionId);

    /*
     * Every new user request gets a new generation.
     * Any previous generation automatically becomes stale.
     */
    const generation =
      tracker.next();

    const {
      onStateChange = () => {},
      onToolStart = () => {},
      onToolResult = () => {},
      onLLMResponse = () => {},
      onAudio = () => {},
      onError = () => {},
      onStale = () => {},
    } = callbacks;

    const timer =
      new LatencyTimer('e2e').start();

    const controller =
      new AbortController();

    this.interruption.registerController(
      sessionId,
      generation,
      controller
    );

    let assistantMessageRecord = null;
    let firstAudioSent = false;
    let streamingEnabled =
      this.config?.streaming?.enabled !== false;

    /*
     * Always check generation before emitting anything.
     */
    const isStale = () => {
      if (
        controller.signal.aborted ||
        !tracker.isCurrent(generation)
      ) {
        this.log.info(
          'Processing bailed — generation stale',
          {
            sessionId,
            generation,
            aborted:
              controller.signal.aborted,
          }
        );

        onStale({
          generation,
        });

        return true;
      }

      return false;
    };

    /*
     * Send audio through a single fenced function.
     *
     * This prevents stale audio from reaching the frontend
     * even if a provider finishes a request after interruption.
     */
    const emitAudio = async (
      audioEvent
    ) => {
      if (isStale()) {
        return false;
      }

      const enrichedEvent = {
        ...audioEvent,
        generation,
        totalLatencyMs:
          Math.round(
            timer.elapsed()
          ),
      };

      /*
       * Mark recovery immediately when the first valid
       * audio packet becomes available.
       *
       * Do not wait for the complete TTS stream.
       */
      if (!firstAudioSent) {
        firstAudioSent = true;

        this.log.info(
          'First audio chunk ready',
          {
            sessionId,
            generation,
            seq:
              audioEvent.seq ?? null,
            latencyMs:
              enrichedEvent.totalLatencyMs,
          }
        );
      }

      onAudio(enrichedEvent);

      return true;
    };

    try {
      /*
       * ----------------------------------------------------
       * 1. PROCESSING
       * ----------------------------------------------------
       */
      onStateChange({
        state: 'PROCESSING',
        generation,
      });

      /*
       * ----------------------------------------------------
       * 2. PERSIST USER MESSAGE
       * ----------------------------------------------------
       */
      session.sequenceNumber += 1;

      const userMsg = {
        role: 'user',
        content: userText,
      };

      session.messages.push(
        userMsg
      );

      let userMessageRecord = null;

      if (this.supabase) {
        try {
          userMessageRecord =
            await db.addMessage(
              this.supabase,
              {
                conversation_id:
                  session.conversationId,

                role: 'user',

                content: userText,

                sequence_number:
                  session.sequenceNumber,

                status: 'complete',

                generation,
              }
            );
        } catch (err) {
          this.log.error(
            'Failed to persist user message',
            {
              error: err.message,
            }
          );
        }
      }

      if (isStale()) {
        return;
      }

      /*
       * ----------------------------------------------------
       * 3. FIRST LLM CALL
       * ----------------------------------------------------
       */
      const llmResp1 =
        await this.llm.chat(
          session.messages,
          {
            signal:
              controller.signal,

            generation,
          }
        );

      if (isStale()) {
        return;
      }

      /*
       * ----------------------------------------------------
       * 4. TOOL CALL HANDLING
       * ----------------------------------------------------
       */
      let finalText =
        llmResp1.text;

      let toolCallRecord = null;

      if (
        Array.isArray(
          llmResp1.toolCalls
        ) &&
        llmResp1.toolCalls.length > 0
      ) {
        onStateChange({
          state: 'TOOL_RUNNING',
          generation,
        });

        /*
         * Add assistant tool-call message
         * to the conversation context.
         */
        session.messages.push({
          role: 'assistant',

          content:
            llmResp1.text || null,

          tool_calls:
            llmResp1.toolCalls,
        });

        for (
          const toolCall
          of llmResp1.toolCalls
        ) {
          if (isStale()) {
            return;
          }

          const toolName =
            toolCall?.function?.name;

          let toolArgs = {};

          try {
            toolArgs =
              JSON.parse(
                toolCall?.function
                  ?.arguments || '{}'
              );
          } catch (err) {
            this.log.warn(
              'Invalid tool arguments',
              {
                toolName,
                generation,
              }
            );
          }

          const callId =
            uuidv4();

          onToolStart({
            toolName,
            toolArgs,
            callId,
            generation,
          });

          /*
           * Record tool call.
           */
          if (this.supabase) {
            try {
              toolCallRecord =
                await db.addToolCall(
                  this.supabase,
                  {
                    conversation_id:
                      session.conversationId,

                    tool_name:
                      toolName,

                    request_payload:
                      toolArgs,

                    status: 'running',

                    generation,

                    artificial_delay_ms:
                      session.config
                        .toolDelayMs,
                  }
                );
            } catch (err) {
              this.log.error(
                'Failed to record tool call',
                {
                  error:
                    err.message,
                }
              );
            }
          }

          if (isStale()) {
            return;
          }

          let toolResult = null;
          let toolError = null;

          try {
            toolResult =
              await this.tools.execute(
                toolName,
                toolArgs,
                {
                  signal:
                    controller.signal,

                  delayMs:
                    session.config
                      .toolDelayMs,

                  callId,

                  generation,
                }
              );
          } catch (err) {
            toolError = err;
          }

          /*
           * FENCING POINT:
           * never emit a tool result from an old generation.
           */
          if (isStale()) {
            if (
              toolCallRecord &&
              this.supabase
            ) {
              try {
                await db.updateToolCall(
                  this.supabase,
                  toolCallRecord.id,
                  {
                    status: 'stale',

                    cancelled_at:
                      new Date()
                        .toISOString(),

                    response_payload:
                      toolResult || null,
                  }
                );
              } catch {}
            }

            return;
          }

          /*
           * Tool failed.
           */
          if (toolError) {
            const isCancelled =
              toolError.message ===
              'Tool aborted';

            if (
              toolCallRecord &&
              this.supabase
            ) {
              try {
                await db.updateToolCall(
                  this.supabase,
                  toolCallRecord.id,
                  {
                    status:
                      isCancelled
                        ? 'cancelled'
                        : 'error',

                    cancelled_at:
                      isCancelled
                        ? new Date()
                            .toISOString()
                        : null,

                    completed_at:
                      !isCancelled
                        ? new Date()
                            .toISOString()
                        : null,
                  }
                );
              } catch {}
            }

            if (isCancelled) {
              return;
            }

            throw toolError;
          }

          /*
           * Tool completed.
           */
          if (
            toolCallRecord &&
            this.supabase
          ) {
            try {
              await db.updateToolCall(
                this.supabase,
                toolCallRecord.id,
                {
                  status: 'completed',

                  response_payload:
                    toolResult,

                  completed_at:
                    new Date()
                      .toISOString(),
                }
              );
            } catch {}
          }

          onToolResult({
            toolName,
            result: toolResult,
            callId,
            generation,
          });

          /*
           * Add tool result to LLM context.
           */
          session.messages.push({
            role: 'tool',

            tool_call_id:
              toolCall.id,

            content:
              JSON.stringify(
                toolResult
              ),
          });
        }

        if (isStale()) {
          return;
        }

        /*
         * --------------------------------------------------
         * 5. SECOND LLM CALL
         * --------------------------------------------------
         */
        onStateChange({
          state: 'PROCESSING',
          generation,
        });

        const llmResp2 =
          await this.llm.chat(
            session.messages,
            {
              signal:
                controller.signal,

              generation,

              tools: [],
            }
          );

        if (isStale()) {
          return;
        }

        finalText =
          llmResp2.text;
      }

      if (isStale()) {
        return;
      }

      /*
       * ----------------------------------------------------
       * 6. FALLBACK RESPONSE
       * ----------------------------------------------------
       */
      if (
        !finalText ||
        !finalText.trim()
      ) {
        finalText =
          'I apologize, I do not have a response for that.';
      }

      finalText =
        finalText.trim();

      /*
       * ----------------------------------------------------
       * 7. PERSIST ASSISTANT MESSAGE
       * ----------------------------------------------------
       */
      session.sequenceNumber += 1;

      session.messages.push({
        role: 'assistant',
        content: finalText,
      });

      if (this.supabase) {
        try {
          assistantMessageRecord =
            await db.addMessage(
              this.supabase,
              {
                conversation_id:
                  session.conversationId,

                role: 'assistant',

                content: finalText,

                sequence_number:
                  session.sequenceNumber,

                /*
                 * Keep streaming while TTS is being
                 * produced.
                 */
                status: 'streaming',

                generation,
              }
            );
        } catch (err) {
          this.log.error(
            'Failed to persist assistant message',
            {
              error:
                err.message,
            }
          );
        }
      }

      /*
       * Emit the COMPLETE LLM text before TTS.
       *
       * Frontend can immediately render the assistant
       * response while audio is being generated.
       */
      if (!isStale()) {
        onLLMResponse({
          text: finalText,

          generation,

          messageId:
            assistantMessageRecord?.id,
        });
      }

      if (isStale()) {
        return;
      }

      /*
       * ----------------------------------------------------
       * 8. TTS
       * ----------------------------------------------------
       */
      onStateChange({
        state: 'SPEAKING',
        generation,
      });

      streamingEnabled =
        this.config?.streaming?.enabled !== false;

      if (
        streamingEnabled &&
        this.rime &&
        typeof this.rime
          .synthesizeStream ===
          'function'
      ) {
        /*
         * --------------------------------------------------
         * STREAMING TTS
         *
         * Rime synthesizes sentence by sentence.
         * Each sentence is emitted immediately.
         * --------------------------------------------------
         */
        await this.rime.synthesizeStream(
          finalText,
          {
            signal:
              controller.signal,

            generation,

            onChunk: (chunk) => {
              if (isStale()) {
                this.log.info(
                  'Stream chunk discarded — stale',
                  {
                    seq:
                      chunk?.seq ?? null,

                    generation,
                  }
                );

                return;
              }

              if (
                !chunk ||
                chunk.error ||
                !chunk.audio
              ) {
                this.log.warn(
                  'Stream chunk error',
                  {
                    seq:
                      chunk?.seq ?? null,

                    error:
                      chunk?.error ||
                      'Missing audio',

                    generation,
                  }
                );

                return;
              }

              /*
               * Important:
               * do NOT update the assistant transcript
               * with sentence/chunk text here.
               *
               * The complete assistant text was already
               * emitted through onLLMResponse().
               */
              void emitAudio({
                audio:
                  chunk.audio,

                mimeType:
                  chunk.mimeType,

                format:
                  chunk.format,

                durationMs:
                  chunk.durationMs,

                latencyMs:
                  chunk.latencyMs,

                provider:
                  chunk.provider,

                model:
                  chunk.model,

                voice:
                  chunk.voice,

                text:
                  chunk.sentenceText,

                messageId:
                  assistantMessageRecord?.id,

                seq:
                  chunk.seq,

                isLast:
                  chunk.isLast,

                isStreaming: true,
              });
            },
          }
        );

        /*
         * The entire stream has finished.
         */
        if (isStale()) {
          if (
            assistantMessageRecord &&
            this.supabase
          ) {
            try {
              await db.updateMessage(
                this.supabase,
                assistantMessageRecord.id,
                {
                  status:
                    'discarded',
                }
              );
            } catch {}
          }

          return;
        }
      } else {
        /*
         * --------------------------------------------------
         * LEGACY / SINGLE-SHOT TTS
         * --------------------------------------------------
         */
        const rimeResult =
          await this.rime.synthesize(
            finalText,
            {
              signal:
                controller.signal,

              generation,
            }
          );

        if (isStale()) {
          this.log.info(
            'Rime audio discarded — stale generation',
            {
              sessionId,
              generation,
            }
          );

          if (
            assistantMessageRecord &&
            this.supabase
          ) {
            try {
              await db.updateMessage(
                this.supabase,
                assistantMessageRecord.id,
                {
                  status:
                    'discarded',
                }
              );
            } catch {}
          }

          return;
        }

        await emitAudio({
          audio:
            rimeResult.audio,

          mimeType:
            rimeResult.mimeType,

          format:
            rimeResult.format,

          durationMs:
            rimeResult.durationMs,

          latencyMs:
            rimeResult.latencyMs,

          provider:
            rimeResult.provider,

          model:
            rimeResult.model,

          voice:
            rimeResult.voice,

          text: finalText,

          messageId:
            assistantMessageRecord?.id,

          isStreaming: false,
        });
      }

      if (isStale()) {
        return;
      }

      /*
       * ----------------------------------------------------
       * 9. MARK ASSISTANT MESSAGE COMPLETE
       * ----------------------------------------------------
       */
      if (
        assistantMessageRecord &&
        this.supabase
      ) {
        try {
          await db.updateMessage(
            this.supabase,
            assistantMessageRecord.id,
            {
              status: 'complete',

              tts_provider:
                'rime',
            }
          );
        } catch (err) {
          this.log.error(
            'Failed to update assistant message',
            {
              error:
                err.message,
            }
          );
        }
      }

      /*
       * ----------------------------------------------------
       * 10. VOICE EVENT
       * ----------------------------------------------------
       */
      if (this.supabase) {
        try {
          await db.addVoiceEvent(
            this.supabase,
            {
              conversation_id:
                session.conversationId,

              event_type:
                'tts_audio_received',

              generation,

              metadata: {
                streaming:
                  streamingEnabled,

                first_audio_latency_ms:
                  firstAudioSent
                    ? Math.round(
                        timer.elapsed()
                      )
                    : null,

                total_latency_ms:
                  Math.round(
                    timer.elapsed()
                  ),
              },
            }
          );
        } catch {}
      }

      /*
       * ----------------------------------------------------
       * 11. COMPLETE
       * ----------------------------------------------------
       */
      if (!isStale()) {
        onStateChange({
          state: 'COMPLETED',
          generation,
        });
      }
    } catch (error) {
      /*
       * Cancellation is expected during interruption.
       * Never expose it as an application error.
       */
      if (
        error?.message ===
          'Tool aborted' ||
        error?.message ===
          'LLM request cancelled' ||
        error?.message ===
          'Rime synthesis cancelled' ||
        error?.message ===
          'Rime synthesis aborted' ||
        error?.code ===
          'ERR_CANCELED' ||
        controller.signal.aborted ||
        !tracker.isCurrent(generation)
      ) {
        this.log.info(
          'Processing cancelled',
          {
            sessionId,
            generation,
          }
        );

        return;
      }

      this.log.error(
        'Processing failed',
        {
          sessionId,
          generation,
          error:
            error?.message ||
            String(error),
        }
      );

      onError({
        error:
          error?.message ||
          String(error),

        generation,
      });

      if (
        tracker.isCurrent(generation)
      ) {
        onStateChange({
          state: 'ERROR',
          generation,
        });
      }
    } finally {
      /*
       * Do not cancel the current generation here.
       *
       * The interruption service owns cancellation.
       */
      this.log.debug?.(
        'Processing finished',
        {
          sessionId,
          generation,
          elapsedMs:
            Math.round(
              timer.elapsed()
            ),
        }
      );
    }
  }

  /**
   * Handle interruption and immediately start processing
   * the user's new speech.
   */
  async handleInterruptionAndProcess(
    sessionId,
    newUserText,
    interruptionMeta = {},
    callbacks = {}
  ) {
    const session =
      this.sessions.get(sessionId);

    if (!session) {
      throw new Error(
        `Session not found: ${sessionId}`
      );
    }

    /*
     * Recovery timer begins when the interruption is
     * handled, not after the old generation finishes.
     */
    const recoveryTimer =
      new LatencyTimer(
        'recovery'
      ).start();

    /*
     * ----------------------------------------------------
     * 1. CANCEL OLD GENERATION
     * ----------------------------------------------------
     */
    const {
      newGeneration,
      cancelledCount,
    } =
      await this.interruption
        .handleInterruption({
          sessionId,

          conversationId:
            session.conversationId,

          reason:
            interruptionMeta.reason ||
            'user_speech',

          oldRequest:
            interruptionMeta.oldRequest,

          newRequest:
            newUserText,

          interruptedMessageId:
            interruptionMeta
              .interruptedMessageId,

          detectionLatencyMs:
            interruptionMeta
              .detectionLatencyMs,

          audioStopLatencyMs:
            interruptionMeta
              .audioStopLatencyMs,
        });

    /*
     * ----------------------------------------------------
     * 2. ADD INTERRUPTION CONTEXT
     * ----------------------------------------------------
     */
    session.messages.push({
      role: 'system',

      content:
        '[The previous assistant response was interrupted by the user. Do not repeat information already spoken.]',
    });

    /*
     * ----------------------------------------------------
     * 3. PROCESS NEW GENERATION
     * ----------------------------------------------------
     */
    let recoveryCompleted = false;

    await this.processUserInput(
      sessionId,
      newUserText,
      {
        ...callbacks,

        /*
         * Wrap audio so recovery is measured from
         * interruption -> FIRST NEW AUDIO.
         */
        onAudio: (audioEvent) => {
          if (
            !recoveryCompleted
          ) {
            recoveryCompleted =
              true;

            const recoveryLatencyMs =
              Math.round(
                recoveryTimer.elapsed()
              );

            /*
             * Mark recovery using the actual first
             * audio availability point.
             */
            void this.interruption
              .markRecoveryComplete(
                sessionId,
                recoveryLatencyMs
              )
              .catch(() => {});

            this.log.info(
              'Interruption recovery completed',
              {
                sessionId,
                generation:
                  audioEvent.generation,
                recoveryLatencyMs,
              }
            );

            /*
             * Forward the metric immediately.
             */
            if (
              callbacks.onAudio
            ) {
              callbacks.onAudio({
                ...audioEvent,

                recoveryLatencyMs,
              });
            }

            return;
          }

          /*
           * Subsequent audio chunks do not
           * recalculate recovery.
           */
          if (
            callbacks.onAudio
          ) {
            callbacks.onAudio(
              audioEvent
            );
          }
        },
      }
    );

    return {
      newGeneration,
      cancelledCount,
    };
  }

  /**
   * Cleanup a session.
   */
  endSession(sessionId) {
    this.interruption
      .cleanupSession(
        sessionId
      );

    this.registry.remove(
      sessionId
    );

    this.sessions.delete(
      sessionId
    );

    this.log.info(
      'Session ended',
      {
        sessionId,
      }
    );
  }

  /**
   * Get session.
   */
  getSession(sessionId) {
    return this.sessions.get(
      sessionId
    );
  }
}

module.exports = {
  OrchestrationService,
};