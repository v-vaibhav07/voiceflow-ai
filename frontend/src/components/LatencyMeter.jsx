import { Gauge } from 'lucide-react';
import { formatLatency } from '../utils/formatters';

export function LatencyMeter({ label, value, threshold, unit = 'ms', hint, className = '' }) {
  const numericValue = value == null ? null : Number(value);
  const overThreshold = threshold != null && numericValue != null && numericValue > threshold;
  const displayValue = numericValue == null ? '—' : unit === 'ms' ? formatLatency(numericValue) : `${numericValue}${unit}`;

  return (
    <div className={`card !p-4 flex items-center gap-3 ${className}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${overThreshold ? 'bg-red-500/15 text-red-400' : 'bg-brand-500/15 text-brand-300'}`}>
        <Gauge className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400 truncate">{label}</p>
        <p className={`text-xl font-semibold tabular-nums ${overThreshold ? 'text-red-300' : 'text-white'}`}>
          {displayValue}
        </p>
        {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
      </div>
      {threshold != null && (
        <div className="text-right shrink-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Target</p>
          <p className="text-xs text-slate-400 tabular-nums">≤ {formatLatency(threshold)}</p>
        </div>
      )}
    </div>
  );
}

export default LatencyMeter;