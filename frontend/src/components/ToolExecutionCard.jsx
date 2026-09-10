import { Wrench, CheckCircle2, XCircle, Loader2, Ban } from 'lucide-react';
import { formatLatency } from '../utils/formatters';

const STATUS_META = {
  pending:   { icon: Loader2, color: 'text-slate-400', label: 'Pending', spin: true },
  running:   { icon: Loader2, color: 'text-amber-400', label: 'Running', spin: true },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Completed' },
  cancelled: { icon: Ban, color: 'text-red-400', label: 'Cancelled' },
  stale:     { icon: Ban, color: 'text-red-400', label: 'Blocked (stale)' },
  error:     { icon: XCircle, color: 'text-red-400', label: 'Error' },
};

export function ToolExecutionCard({ toolCall, className = '' }) {
  if (!toolCall) return null;
  const meta = STATUS_META[toolCall.status] || STATUS_META.pending;
  const Icon = meta.icon;
  const durationMs = toolCall.completedAt && toolCall.startedAt
    ? toolCall.completedAt - toolCall.startedAt
    : null;

  return (
    <div className={`card !p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
          <Wrench className="w-4 h-4 text-brand-300" aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-white truncate">{toolCall.toolName || toolCall.tool_name}</h4>
            <span className={`inline-flex items-center gap-1 text-xs ${meta.color}`}>
              <Icon className={`w-3.5 h-3.5 ${meta.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
              {meta.label}
            </span>
            {toolCall.generation != null && (
              <span className="text-[10px] text-slate-600">g{toolCall.generation}</span>
            )}
          </div>

          {toolCall.args && (
            <p className="text-xs text-slate-400 mt-1 font-mono truncate">
              {JSON.stringify(toolCall.args)}
            </p>
          )}

          {toolCall.result && toolCall.status === 'completed' && (
            <div className="mt-2 text-xs text-slate-300">
              {toolCall.result.count != null && (
                <p><span className="text-slate-500">Results:</span> {toolCall.result.count}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
            {durationMs != null && <span>{formatLatency(durationMs)}</span>}
            {toolCall.artificial_delay_ms > 0 && (
              <span className="badge badge-warning !px-2 !py-0.5 !text-[10px]">
                +{toolCall.artificial_delay_ms}ms delay (test)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ToolExecutionCard;