/**
 * Request Generation Tracker
 *
 * Every request cycle gets a unique, monotonically increasing generation ID.
 * When the user interrupts, the generation is incremented, and any in-flight
 * response tagged with an older generation is considered STALE and discarded.
 *
 * This is the core primitive that prevents stale async results from being
 * spoken after an interruption.
 */

class GenerationTracker {
  constructor(initial = 0) {
    this.current = initial;
    this.history = [];
  }

  /**
   * Increment and return the new generation ID.
   * Call this whenever a new user request begins OR an interruption occurs.
   */
  next() {
    this.current += 1;
    this.history.push({
      generation: this.current,
      timestamp: Date.now(),
    });
    return this.current;
  }

  /**
   * Get the current active generation.
   */
  get() {
    return this.current;
  }

  /**
   * Check if a generation is the current one.
   * Returns false for stale or future generations.
   */
  isCurrent(generation) {
    return generation === this.current;
  }

  /**
   * Check if a generation is stale (older than current).
   */
  isStale(generation) {
    return generation < this.current;
  }

  /**
   * Reset the tracker (useful for tests).
   */
  reset() {
    this.current = 0;
    this.history = [];
  }
}

/**
 * Per-session tracker registry.
 * Each conversation/session gets its own generation counter.
 */
class GenerationRegistry {
  constructor() {
    this.trackers = new Map();
  }

  get(sessionId) {
    if (!this.trackers.has(sessionId)) {
      this.trackers.set(sessionId, new GenerationTracker());
    }
    return this.trackers.get(sessionId);
  }

  remove(sessionId) {
    this.trackers.delete(sessionId);
  }

  clear() {
    this.trackers.clear();
  }
}

module.exports = { GenerationTracker, GenerationRegistry };