export function MetricCard({ label, value, unit, sublabel, tone = 'neutral', icon: Icon, className = '' }) {
  const toneClass = {
    neutral: 'text-white',
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    danger: 'text-red-300',
    brand: 'text-brand-300',
  }[tone] || 'text-white';

  return (
    <div className={`card !p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</p>
          <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>
            {value ?? '—'}
            {unit && <span className="text-sm text-slate-500 ml-1 font-normal">{unit}</span>}
          </p>
          {sublabel && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-brand-500/15 text-brand-300 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

export default MetricCard;