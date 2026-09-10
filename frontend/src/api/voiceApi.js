// /**
//  * WebSocket client for real-time voice communication.
//  *
//  * Handles reconnection, message routing, and per-message-type
//  * subscribers. State is kept minimal — orchestration lives in
//  * the useVoice hook.
//  */

// import { WS_URL, WS_MESSAGE_TYPES, DEBUG } from '../utils/constants';

// function log(...args) {
//   if (DEBUG) console.log('[ws]', ...args);
// }

// export class VoiceSocket {
//   constructor(url = WS_URL) {
//     this.url = url;
//     this.ws = null;
//     this.listeners = new Map(); // type -> Set of handlers
//     this.globalListeners = new Set();
//     this.connectionListeners = new Set();
//     this.reconnectAttempts = 0;
//     this.maxReconnectAttempts = 5;
//     this.reconnectTimeoutId = null;
//     this.explicitlyClosed = false;
//     this.connected = false;
//     this.sessionId = null;
//     this.pingInterval = null;
//   }

//   connect() {
//     if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
//       log('already connecting/connected');
//       return;
//     }

//     this.explicitlyClosed = false;
//     log('connecting to', this.url);
//     this.ws = new WebSocket(this.url);

//     this.ws.onopen = () => {
//       log('open');
//       this.connected = true;
//       this.reconnectAttempts = 0;
//       this._notifyConnection({ connected: true });
//       this._startPing();
//     };

//     this.ws.onmessage = (event) => {
//       let msg;
//       try { msg = JSON.parse(event.data); }
//       catch (e) { log('bad JSON', e); return; }

//       log('recv', msg.type);

//       if (msg.type === WS_MESSAGE_TYPES.HELLO || msg.type === WS_MESSAGE_TYPES.SESSION_STARTED) {
//         if (msg.sessionId) this.sessionId = msg.sessionId;
//       }

//       // Type-specific handlers
//       const typedHandlers = this.listeners.get(msg.type);
//       if (typedHandlers) {
//         for (const h of typedHandlers) {
//           try { h(msg); } catch (e) { console.error('handler error', e); }
//         }
//       }

//       // Global handlers
//       for (const h of this.globalListeners) {
//         try { h(msg); } catch (e) { console.error('global handler error', e); }
//       }
//     };

//     this.ws.onerror = (event) => {
//       log('error', event);
//     };

//     this.ws.onclose = () => {
//       log('close');
//       this.connected = false;
//       this._stopPing();
//       this._notifyConnection({ connected: false });

//       if (!this.explicitlyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
//         const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
//         this.reconnectAttempts += 1;
//         log(`reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
//         this.reconnectTimeoutId = setTimeout(() => this.connect(), delay);
//       }
//     };
//   }

//   disconnect() {
//     this.explicitlyClosed = true;
//     if (this.reconnectTimeoutId) {
//       clearTimeout(this.reconnectTimeoutId);
//       this.reconnectTimeoutId = null;
//     }
//     this._stopPing();
//     if (this.ws) {
//       try { this.ws.close(1000, 'client disconnect'); } catch {}
//       this.ws = null;
//     }
//     this.connected = false;
//   }

//   send(obj) {
//     if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
//       log('send skipped — socket not open', obj?.type);
//       return false;
//     }
//     try {
//       this.ws.send(JSON.stringify(obj));
//       log('send', obj.type);
//       return true;
//     } catch (e) {
//       console.error('ws send failed', e);
//       return false;
//     }
//   }

//   /**
//    * Subscribe to a specific message type.
//    * Returns unsubscribe function.
//    */
//   on(type, handler) {
//     if (!this.listeners.has(type)) this.listeners.set(type, new Set());
//     this.listeners.get(type).add(handler);
//     return () => {
//       const set = this.listeners.get(type);
//       if (set) set.delete(handler);
//     };
//   }

//   /**
//    * Subscribe to all messages.
//    */
//   onAny(handler) {
//     this.globalListeners.add(handler);
//     return () => this.globalListeners.delete(handler);
//   }

//   /**
//    * Subscribe to connection state changes.
//    */
//   onConnectionChange(handler) {
//     this.connectionListeners.add(handler);
//     handler({ connected: this.connected });
//     return () => this.connectionListeners.delete(handler);
//   }

//   _notifyConnection(state) {
//     for (const h of this.connectionListeners) {
//       try { h(state); } catch (e) { console.error(e); }
//     }
//   }

//   _startPing() {
//     this._stopPing();
//     this.pingInterval = setInterval(() => {
//       this.send({ type: WS_MESSAGE_TYPES.PING });
//     }, 30000);
//   }

//   _stopPing() {
//     if (this.pingInterval) {
//       clearInterval(this.pingInterval);
//       this.pingInterval = null;
//     }
//   }

//   /**
//    * High-level helpers
//    */
//   startSession(opts = {}) {
//     return this.send({ type: WS_MESSAGE_TYPES.START_SESSION, ...opts });
//   }

//   updateConfig(config) {
//     return this.send({ type: WS_MESSAGE_TYPES.UPDATE_CONFIG, config });
//   }

//   sendUserSpeech(text, opts = {}) {
//     return this.send({ type: WS_MESSAGE_TYPES.USER_SPEECH, text, ...opts });
//   }

//   sendInterruption(opts = {}) {
//     return this.send({ type: WS_MESSAGE_TYPES.INTERRUPTION, ...opts });
//   }
// }










/**
 * WebSocket client for real-time voice communication.
 *
 * v2: Added support for:
 *   - Binary audio streaming (server-side STT)
 *   - Chunked TTS audio reception
 */

/**
 * WebSocket client for real-time voice communication.
 *
 * v3: Reconnect logic tuned for Render free-tier cold starts
 * (which can take 50s+ to wake a sleeping instance).
 *   - Longer retry budget (~2 minutes) instead of ~25s
 *   - Exposes reconnect attempt count so the UI can show
 *     "waking up" instead of a flat "disconnected"
 *   - Binary audio streaming (server-side STT)
 *   - Chunked TTS audio reception
 */

import { WS_URL, WS_MESSAGE_TYPES, DEBUG } from '../utils/constants';

function log(...args) {
  if (DEBUG) console.log('[ws]', ...args);
}

export class VoiceSocket {
  constructor(url = WS_URL) {
    this.url = url;
    this.ws = null;
    this.listeners = new Map();
    this.globalListeners = new Set();
    this.connectionListeners = new Set();

    // ── Reconnect tuning ──
    // Render free-tier instances can take 50s+ to wake from sleep.
    // 12 attempts with a cap of 8s between tries gives roughly
    // 2 minutes of total retry budget, which comfortably covers
    // a cold start instead of giving up at ~25s.
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 12;
    this.baseDelayMs = 1000;
    this.maxDelayMs = 8000;

    this.reconnectTimeoutId = null;
    this.explicitlyClosed = false;
    this.connected = false;
    this.sessionId = null;
    this.pingInterval = null;
    this.serverCapabilities = {};
  }

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.explicitlyClosed = false;
    log('connecting to', this.url, `(attempt ${this.reconnectAttempts + 1})`);

    // Let listeners know we're actively trying (used for "waking up" UI)
    this._notifyConnection({
      connected: false,
      reconnecting: this.reconnectAttempts > 0,
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
    });

    this.ws = new WebSocket(this.url);

    // Enable binary type for audio streaming
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      log('open');
      this.connected = true;
      this.reconnectAttempts = 0;
      this._notifyConnection({ connected: true, reconnecting: false });
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      // Handle binary messages
      if (event.data instanceof ArrayBuffer) {
        log('binary message received', event.data.byteLength);
        return;
      }

      let msg;

      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        log('bad JSON', e);
        return;
      }

      log('recv', msg.type);

      if (
        msg.type === WS_MESSAGE_TYPES.HELLO ||
        msg.type === WS_MESSAGE_TYPES.SESSION_STARTED
      ) {
        if (msg.sessionId) {
          this.sessionId = msg.sessionId;
        }

        if (msg.capabilities) {
          this.serverCapabilities = msg.capabilities;
        }
      }

      const typedHandlers = this.listeners.get(msg.type);

      if (typedHandlers) {
        for (const h of typedHandlers) {
          try {
            h(msg);
          } catch (e) {
            console.error('handler error', e);
          }
        }
      }

      for (const h of this.globalListeners) {
        try {
          h(msg);
        } catch (e) {
          console.error('global handler error', e);
        }
      }
    };

    this.ws.onerror = (event) => {
      log('error', event);
    };

    this.ws.onclose = () => {
      log('close');

      this.connected = false;
      this._stopPing();

      if (
        !this.explicitlyClosed &&
        this.reconnectAttempts < this.maxReconnectAttempts
      ) {
        const delay = Math.min(
          this.baseDelayMs * 2 ** this.reconnectAttempts,
          this.maxDelayMs
        );

        this.reconnectAttempts += 1;

        log(
          `reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
        );

        this._notifyConnection({
          connected: false,
          reconnecting: true,
          attempt: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts,
        });

        this.reconnectTimeoutId = setTimeout(() => this.connect(), delay);
      } else {
        // Out of retries (or explicitly closed) — now it's a "real" disconnect
        this._notifyConnection({
          connected: false,
          reconnecting: false,
          gaveUp: !this.explicitlyClosed,
        });
      }
    };
  }

  /** Manually reset the retry budget and try again (e.g. user clicks "Retry"). */
  retryNow() {
    this.reconnectAttempts = 0;

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.connect();
  }

  disconnect() {
    this.explicitlyClosed = true;

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this._stopPing();

    if (this.ws) {
      try {
        this.ws.close(1000, 'client disconnect');
      } catch {}

      this.ws = null;
    }

    this.connected = false;
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log('send skipped — socket not open', obj?.type);
      return false;
    }

    try {
      this.ws.send(JSON.stringify(obj));
      log('send', obj.type);
      return true;
    } catch (e) {
      console.error('ws send failed', e);
      return false;
    }
  }

  /**
   * Send binary audio data for server-side STT.
   * @param {ArrayBuffer|Int16Array} data - PCM audio data
   */
  sendAudio(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const buffer = data instanceof ArrayBuffer ? data : data.buffer;
      this.ws.send(buffer);
      return true;
    } catch (e) {
      console.error('ws sendAudio failed', e);
      return false;
    }
  }

  /** Subscribe to a specific message type. Returns unsubscribe function. */
  on(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type).add(handler);

    return () => {
      const set = this.listeners.get(type);
      if (set) set.delete(handler);
    };
  }

  /** Subscribe to all messages. */
  onAny(handler) {
    this.globalListeners.add(handler);
    return () => this.globalListeners.delete(handler);
  }

  /** Subscribe to connection state changes. */
  onConnectionChange(handler) {
    this.connectionListeners.add(handler);

    handler({
      connected: this.connected,
      reconnecting: false,
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
    });

    return () => this.connectionListeners.delete(handler);
  }

  _notifyConnection(state) {
    for (const h of this.connectionListeners) {
      try {
        h(state);
      } catch (e) {
        console.error(e);
      }
    }
  }

  _startPing() {
    this._stopPing();

    this.pingInterval = setInterval(() => {
      this.send({ type: WS_MESSAGE_TYPES.PING });
    }, 30000);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ─── High-level helpers ───

  startSession(opts = {}) {
    return this.send({ type: WS_MESSAGE_TYPES.START_SESSION, ...opts });
  }

  updateConfig(config) {
    return this.send({ type: WS_MESSAGE_TYPES.UPDATE_CONFIG, config });
  }

  sendUserSpeech(text, opts = {}) {
    return this.send({ type: WS_MESSAGE_TYPES.USER_SPEECH, text, ...opts });
  }

  sendInterruption(opts = {}) {
    return this.send({ type: WS_MESSAGE_TYPES.INTERRUPTION, ...opts });
  }

  // Server STT audio streaming
  startAudioStream(opts = {}) {
    return this.send({ type: WS_MESSAGE_TYPES.AUDIO_STREAM_START, ...opts });
  }

  stopAudioStream() {
    return this.send({ type: WS_MESSAGE_TYPES.AUDIO_STREAM_END });
  }
}