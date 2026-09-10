/**
 * useLatency hook
 *
 * Simple registry for tracking latency values across a session.
 */

import { useCallback, useRef, useState } from 'react';
import { average, percentile } from '../utils/latency';

export function useLatency() {
  const [metrics, setMetrics] = useState({});
  const historyRef = useRef({}); // metricName -> [values]

  const record = useCallback((name, value) => {
    if (value == null || Number.isNaN(Number(value))) return;
    const v = Number(value);
    if (!historyRef.current[name]) historyRef.current[name] = [];
    historyRef.current[name].push(v);
    setMetrics((prev) => ({ ...prev, [name]: v }));
  }, []);

  const getHistory = useCallback((name) => historyRef.current[name] || [], []);

  const getStats = useCallback((name) => {
    const arr = historyRef.current[name] || [];
    return {
      count: arr.length,
      last: arr[arr.length - 1] ?? null,
      avg: average(arr),
      p50: percentile(arr, 50),
      p95: percentile(arr, 95),
      max: arr.length ? Math.max(...arr) : null,
      min: arr.length ? Math.min(...arr) : null,
    };
  }, []);

  const reset = useCallback(() => {
    historyRef.current = {};
    setMetrics({});
  }, []);

  return { metrics, record, getHistory, getStats, reset };
}