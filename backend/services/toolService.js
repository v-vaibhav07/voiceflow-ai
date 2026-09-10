/**
 * Tool Service
 *
 * Executes tools with configurable delays (for stress testing) and
 * proper cancellation support via AbortController.
 *
 * When a tool call is cancelled (due to interruption), it is marked
 * as 'cancelled' or 'stale' in the database, and its result is never
 * used in the conversation.
 */

const logger = require('../utils/logger');

// Simulated flight database
const FLIGHT_DB = [
  { airline: 'IndiGo', flightNumber: '6E-2001', from: 'Delhi', to: 'Mumbai', departure: '06:00', arrival: '08:10', price: 4500, timeOfDay: 'morning' },
  { airline: 'SpiceJet', flightNumber: 'SG-8169', from: 'Delhi', to: 'Mumbai', departure: '07:15', arrival: '09:20', price: 4200, timeOfDay: 'morning' },
  { airline: 'Air India', flightNumber: 'AI-805', from: 'Delhi', to: 'Mumbai', departure: '09:30', arrival: '11:40', price: 5100, timeOfDay: 'morning' },
  { airline: 'Vistara', flightNumber: 'UK-995', from: 'Delhi', to: 'Mumbai', departure: '13:20', arrival: '15:35', price: 5800, timeOfDay: 'afternoon' },
  { airline: 'IndiGo', flightNumber: '6E-6202', from: 'Delhi', to: 'Mumbai', departure: '16:45', arrival: '18:55', price: 4800, timeOfDay: 'afternoon' },
  { airline: 'Air India', flightNumber: 'AI-865', from: 'Delhi', to: 'Mumbai', departure: '19:30', arrival: '21:45', price: 5400, timeOfDay: 'evening' },
  { airline: 'SpiceJet', flightNumber: 'SG-8153', from: 'Delhi', to: 'Mumbai', departure: '22:15', arrival: '00:25', price: 3900, timeOfDay: 'night' },
];

class ToolService {
  constructor(config) {
    this.config = config;
    this.log = logger.child({ service: 'tool' });
    this.activeCalls = new Map(); // callId -> AbortController
  }

  /**
   * Execute a tool by name with given arguments.
   *
   * @param {string} name - Tool name
   * @param {object} args - Tool arguments
   * @param {object} options - { signal, delayMs, callId, generation }
   */
  async execute(name, args, options = {}) {
    const { signal, delayMs = 0, callId, generation = null } = options;

    this.log.info('Tool execution started', { name, args, delayMs, generation, callId });

    if (callId && signal) {
      this.activeCalls.set(callId, signal);
    }

    try {
      // Apply artificial delay (for stress testing) — abortable
      if (delayMs > 0) {
        await this.abortableDelay(delayMs, signal);
      }

      let result;
      switch (name) {
        case 'search_flights':
          result = this.searchFlights(args);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      this.log.info('Tool execution completed', { name, generation, callId });
      return result;
    } catch (error) {
      if (error.message === 'Tool aborted' || signal?.aborted) {
        this.log.info('Tool execution cancelled', { name, generation, callId });
        throw new Error('Tool aborted');
      }
      this.log.error('Tool execution failed', { name, error: error.message, generation });
      throw error;
    } finally {
      if (callId) this.activeCalls.delete(callId);
    }
  }

  /**
   * Abortable delay — resolves after delayMs OR rejects if signal aborts.
   */
  abortableDelay(delayMs, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Tool aborted'));
        return;
      }

      const timeout = setTimeout(resolve, delayMs);

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            reject(new Error('Tool aborted'));
          },
          { once: true }
        );
      }
    });
  }

  /**
   * Simulated flight search.
   */
  searchFlights(args) {
    const { from, to, date, time_of_day = 'any' } = args;

    let results = FLIGHT_DB.filter(
      (f) =>
        f.from.toLowerCase() === (from || '').toLowerCase() &&
        f.to.toLowerCase() === (to || '').toLowerCase()
    );

    if (time_of_day && time_of_day !== 'any') {
      results = results.filter((f) => f.timeOfDay === time_of_day);
    }

    return {
      query: { from, to, date, time_of_day },
      count: results.length,
      flights: results,
    };
  }

  /**
   * Get list of active tool calls (for debugging).
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.keys());
  }
}

module.exports = { ToolService };