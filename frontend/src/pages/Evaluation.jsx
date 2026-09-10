import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Zap, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchEvaluationRuns, fetchEvaluationSummary } from '../api/api';
import { MetricCard } from '../components/MetricCard';
import { EvaluationCard } from '../components/EvaluationCard';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { formatLatency } from '../utils/formatters';

export default function Evaluation() {
  const [runs, setRuns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [runsRes, sumRes] = await Promise.all([fetchEvaluationRuns(20), fetchEvaluationSummary()]);
        if (!cancelled) {
          setRuns(runsRes.runs || []);
          setSummary(sumRes || null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const latencyChart = runs
    .slice()
    .reverse()
    .flatMap((r) =>
      (r.evaluation_results || [])
        .filter((res) => res.metric_name === 'audio_stop_latency' || res.metric_name === 'recovery_latency')
        .map((res) => ({
          run: r.test_name?.slice(0, 12) || 'run',
          [res.metric_name]: Number(res.metric_value),
        }))
    );

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-brand-400" />
          Evaluation Dashboard
        </h1>
        <p className="text-sm text-slate-400">
          Real measurements from stress tests and integration runs. Metrics without measurements are labeled "NOT YET MEASURED".
        </p>
      </div>

      {loading && <LoadingState label="Loading evaluation data…" />}

      {error && (
        <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={TrendingUp}
              label="Total runs"
              value={summary?.totalRuns ?? 0}
              tone="brand"
            />
            <MetricCard
              icon={Zap}
              label="Metrics recorded"
              value={summary?.totalMetrics ?? 0}
            />
            <MetricCard
              icon={Clock}
              label="Avg latency"
              value={summary?.avgLatencyMs != null ? formatLatency(summary.avgLatencyMs) : 'NOT YET MEASURED'}
              tone={summary?.avgLatencyMs != null ? 'success' : 'neutral'}
            />
            <MetricCard
              icon={TrendingUp}
              label="Pass rate"
              value={summary?.passRate != null ? `${summary.passRate}` : '—'}
              unit={summary?.passRate != null ? '%' : ''}
              tone={summary?.passRate != null && summary.passRate >= 80 ? 'success' : 'warning'}
            />
          </div>

          {latencyChart.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-white mb-3">Latency trend</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latencyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="run" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} unit="ms" />
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="audio_stop_latency" stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="recovery_latency" stroke="#818cf8" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Recent runs</h2>
            {runs.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No evaluation runs yet"
                description="Trigger a run from the Stress Test page or execute evaluation/acceptance-test.js."
              />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {runs.map((run) => (
                  <EvaluationCard key={run.id} run={run} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}