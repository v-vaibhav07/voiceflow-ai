import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { formatDateTime } from '../utils/formatters';

export function EvaluationCard({ run, className = '' }) {
  if (!run) return null;
  const results = run.evaluation_results || [];
  const passed = results.filter((r) => r.passed === true).length;
  const failed = results.filter((r) => r.passed === false).length;
  const untested = results.filter((r) => r.passed == null).length;

  return (
    <div className={`card ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{run.test_name}</h3>
          <p className="text-xs text-slate-400 truncate">{run.description || '—'}</p>
        </div>
        <span
          className={`badge shrink-0 ${
            run.status === 'completed'
              ? 'badge-success'
              : run.status === 'failed'
              ? 'badge-danger'
              : 'badge-warning'
          }`}
        >
          {run.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-emerald-300 text-xs">
            <CheckCircle2 className="w-3 h-3" /> {passed}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">passed</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-red-300 text-xs">
            <XCircle className="w-3 h-3" /> {failed}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">failed</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-slate-400 text-xs">
            <MinusCircle className="w-3 h-3" /> {untested}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">n/a</p>
        </div>
      </div>

      {results.slice(0, 4).map((r) => (
        <div key={r.id || r.metric_name} className="flex items-center justify-between text-xs py-1">
          <span className="text-slate-400 truncate">{r.metric_name}</span>
          <span className="text-slate-200 font-mono tabular-nums shrink-0 ml-2">
            {r.metric_value} {r.unit}
          </span>
        </div>
      ))}

      <p className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
        {formatDateTime(run.started_at)}
      </p>
    </div>
  );
}

export default EvaluationCard;