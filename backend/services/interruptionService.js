/**
 * Interruption Service
 *
 * Coordinates the interruption lifecycle:
 *  1. Detects/receives interruption event
 *  2. Increments the generation ID
 *  3. Aborts all in-flight controllers for the old generation
 *  4. Marks old messages as interrupted in DB
 *  5. Records interruption record with timing
 *  6. Signals orchestration to process new request
 */

const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/supabase');
const logger = require('../utils/logger');

class InterruptionService {
  constructor({ supabase, generationRegistry }) {
    this.supabase = supabase;
    this.registry = generationRegistry;
    this.log = logger.child({ service: 'interruption' });

    // Per-session AbortController maps
    // sessionId -> Map(generation -> Set(AbortController))
    this.controllers = new Map();

    // Per-session interruption tracking
    // sessionId -> { pendingInterruption }
    this.pending = new Map();
  }

  /**
   * Register an AbortController for a specific generation.
   * When that generation is invalidated, the controller will be aborted.
   */
  registerController(sessionId, generation, controller) {
    if (!this.controllers.has(sessionId)) {
      this.controllers.set(sessionId, new Map());
    }
    const sessionCtrls = this.controllers.get(sessionId);
    if (!sessionCtrls.has(generation)) {
      sessionCtrls.set(generation, new Set());
    }
    sessionCtrls.get(generation).add(controller);
  }

  /**
   * Handle an incoming interruption.
   *
   * @param {object} params
   * @param {string} params.sessionId
   * @param {string} params.conversationId
   * @param {string} params.reason
   * @param {string} params.oldRequest
   * @param {string} params.newRequest
   * @param {string} params.interruptedMessageId
   * @param {number} params.detectionLatencyMs
   * @param {number} params.audioStopLatencyMs
   */
  async handleInterruption({
    sessionId,
    conversationId,
    reason = 'user_speech',
    oldRequest = null,
    newRequest = null,
    interruptedMessageId = null,
    detectionLatencyMs = null,
    audioStopLatencyMs = null,
  }) {
    const tracker = this.registry.get(sessionId);
    const oldGeneration = tracker.get();
    const newGeneration = tracker.next();

    this.log.info('Interruption handling started', {
      sessionId,
      conversationId,
      oldGeneration,
      newGeneration,
      reason,
    });

    // 1. Abort all controllers for the old generation
    const cancelledCount = this.cancelGeneration(sessionId, oldGeneration);

    // 2. Mark old message as interrupted in DB
    if (interruptedMessageId && this.supabase) {
      try {
        await db.updateMessage(this.supabase, interruptedMessageId, {
          interrupted: true,
          status: 'interrupted',
        });
      } catch (err) {
        this.log.error('Failed to update interrupted message', { error: err.message });
      }
    }

    // 3. Create interruption record
    let interruptionRecord = null;
    if (this.supabase && conversationId) {
      try {
        interruptionRecord = await db.addInterruption(this.supabase, {
          conversation_id: conversationId,
          interrupted_message_id: interruptedMessageId,
          reason,
          old_request: oldRequest,
          new_request: newRequest,
          old_generation: oldGeneration,
          new_generation: newGeneration,
          recovery_status: 'recovering',
          detection_latency_ms: detectionLatencyMs,
          audio_stop_latency_ms: audioStopLatencyMs,
          stale_results_blocked: cancelledCount,
        });
      } catch (err) {
        this.log.error('Failed to record interruption', { error: err.message });
      }
    }

    // 4. Add voice event
    if (this.supabase && conversationId) {
      try {
        await db.addVoiceEvent(this.supabase, {
          conversation_id: conversationId,
          event_type: 'interruption_detected',
          generation: newGeneration,
          metadata: {
            old_generation: oldGeneration,
            reason,
            cancelled_controllers: cancelledCount,
          },
        });
      } catch (err) {
        this.log.error('Failed to record voice event', { error: err.message });
      }
    }

    // Store pending recovery info
    this.pending.set(sessionId, {
      interruptionId: interruptionRecord?.id || uuidv4(),
      oldGeneration,
      newGeneration,
      startTime: Date.now(),
    });

    this.log.info('Interruption handled', {
      sessionId,
      oldGeneration,
      newGeneration,
      cancelledCount,
    });

    return {
      interruptionId: interruptionRecord?.id,
      oldGeneration,
      newGeneration,
      cancelledCount,
    };
  }

  /**
   * Abort all controllers for a given generation.
   * Returns the count of aborted controllers.
   */
  cancelGeneration(sessionId, generation) {
    const sessionCtrls = this.controllers.get(sessionId);
    if (!sessionCtrls) return 0;

    const ctrls = sessionCtrls.get(generation);
    if (!ctrls) return 0;

    let count = 0;
    for (const controller of ctrls) {
      try {
        if (!controller.signal.aborted) {
          controller.abort();
          count++;
        }
      } catch (err) {
        this.log.warn('Failed to abort controller', { error: err.message });
      }
    }

    sessionCtrls.delete(generation);
    this.log.info('Generation cancelled', { sessionId, generation, count });
    return count;
  }

  /**
   * Mark recovery as complete.
   */
  async markRecoveryComplete(sessionId, recoveryLatencyMs) {
    const pending = this.pending.get(sessionId);
    if (!pending) return;

    if (this.supabase && pending.interruptionId) {
      try {
        await db.updateInterruption(this.supabase, pending.interruptionId, {
          recovery_status: 'recovered',
          recovery_latency_ms: recoveryLatencyMs || Date.now() - pending.startTime,
        });
      } catch (err) {
        this.log.error('Failed to mark recovery complete', { error: err.message });
      }
    }

    this.pending.delete(sessionId);
  }

  /**
   * Clean up all controllers for a session.
   */
  cleanupSession(sessionId) {
    const sessionCtrls = this.controllers.get(sessionId);
    if (sessionCtrls) {
      for (const [, ctrls] of sessionCtrls) {
        for (const c of ctrls) {
          try { if (!c.signal.aborted) c.abort(); } catch {}
        }
      }
      this.controllers.delete(sessionId);
    }
    this.pending.delete(sessionId);
  }

  /**
   * Check if a generation is still current (not superseded by an interruption).
   */
  isCurrent(sessionId, generation) {
    return this.registry.get(sessionId).isCurrent(generation);
  }

  /**
   * Check if a generation is stale.
   */
  isStale(sessionId, generation) {
    return this.registry.get(sessionId).isStale(generation);
  }
}

module.exports = { InterruptionService };