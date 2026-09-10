/**
 * useConversation hook
 *
 * Maintains an in-memory conversation transcript synchronized
 * with real-time voice events. Persistence happens on the backend;
 * this is the UI-facing model.
 *
 * A message has:
 *   id, role, text, generation, status, interrupted,
 *   audioDurationMs, playedDurationMs, provider, model, voice, createdAt
 */

import { useCallback, useState } from 'react';

let localCounter = 0;
function localId() {
  localCounter += 1;
  return `local-${Date.now()}-${localCounter}`;
}

export function useConversation() {
  const [messages, setMessages] = useState([]);
  const [interruptions, setInterruptions] = useState([]);
  const [toolCalls, setToolCalls] = useState([]);

  const addUserMessage = useCallback((text, meta = {}) => {
    const msg = {
      id: localId(),
      role: 'user',
      text,
      status: 'complete',
      interrupted: false,
      createdAt: new Date().toISOString(),
      ...meta,
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const addAssistantMessage = useCallback((meta = {}) => {
    const msg = {
      id: meta.id || localId(),
      role: 'assistant',
      text: meta.text || '',
      status: meta.status || 'streaming',
      interrupted: false,
      createdAt: new Date().toISOString(),
      ...meta,
    };
    setMessages((prev) => {
      // Avoid duplicates if the same message id already exists
      if (msg.id && prev.some((m) => m.id === msg.id)) {
        return prev.map((m) => (m.id === msg.id ? { ...m, ...meta } : m));
      }
      return [...prev, msg];
    });
    return msg;
  }, []);

  const updateMessage = useCallback((id, patch) => {
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const markInterrupted = useCallback((messageId, playedDurationMs) => {
    if (!messageId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, interrupted: true, status: 'interrupted', playedDurationMs }
          : m
      )
    );
  }, []);

  const addInterruption = useCallback((interruption) => {
    setInterruptions((prev) => [...prev, { id: localId(), ...interruption }]);
  }, []);

  const addToolCall = useCallback((toolCall) => {
    setToolCalls((prev) => [...prev, { id: toolCall.callId || localId(), ...toolCall, status: 'running', startedAt: Date.now() }]);
  }, []);

  const updateToolCall = useCallback((callId, patch) => {
    setToolCalls((prev) => prev.map((t) => (t.id === callId ? { ...t, ...patch } : t)));
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setInterruptions([]);
    setToolCalls([]);
  }, []);

  return {
    messages,
    interruptions,
    toolCalls,
    addUserMessage,
    addAssistantMessage,
    updateMessage,
    markInterrupted,
    addInterruption,
    addToolCall,
    updateToolCall,
    reset,
  };
}