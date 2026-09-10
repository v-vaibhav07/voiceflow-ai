/**
 * REST API client
 */

import { API_URL } from '../utils/constants';

async function request(path, options = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message = (isJson && data?.error?.message) || res.statusText || 'Request failed';
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};

/**
 * Health check
 */
export function fetchHealth() {
  return api.get('/api/health');
}

/**
 * Voice config
 */
export function fetchVoiceConfig() {
  return api.get('/api/voice/config');
}

/**
 * Conversations
 */
export function fetchConversations(userId) {
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return api.get(`/api/conversations${q}`);
}

export function fetchConversation(id) {
  return api.get(`/api/conversations/${id}`);
}

export function createConversation(body) {
  return api.post('/api/conversations', body);
}

export function deleteConversation(id) {
  return api.delete(`/api/conversations/${id}`);
}

/**
 * Evaluation
 */
export function fetchEvaluationRuns(limit = 20) {
  return api.get(`/api/evaluation/runs?limit=${limit}`);
}

export function fetchEvaluationSummary() {
  return api.get('/api/evaluation/summary');
}

export function startEvaluationRun(body) {
  return api.post('/api/evaluation/runs', body);
}

export function recordEvaluationMetrics(runId, metrics) {
  return api.post(`/api/evaluation/runs/${runId}/metrics`, { metrics });
}

export function completeEvaluationRun(runId, status = 'completed') {
  return api.post(`/api/evaluation/runs/${runId}/complete`, { status });
}