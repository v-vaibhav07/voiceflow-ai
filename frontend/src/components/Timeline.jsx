import { formatLatency, formatDateTime } from '../utils/formatters';

/**
 * Simple vertical timeline of events.
 *
 * @param items - [{ id, title, description, timestamp, tone }]
 */
export function Timeline({ items = [], className = '' }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500 italic">No events recorded.</p>;
  }

  return (
    <ol className={`relative ${className}`}>
      <span className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-800" aria-hidden="true" />
      {items.map((item, idx) => (
        <li key={item.id || idx} className="relative pl-8 pb-4 last:pb-0">
          <span
            className={`absolute left-0 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              item.tone === 'danger'
                ? 'border-red-400 bg-red-500/20'
                : item.tone === 'success'
                ? 'border-emerald-400 bg-emerald-500/20'
                : item.tone === 'warning'
                ? 'border-amber-400 bg-amber-500/20'
                : 'border-brand-400 bg-brand-500/20'
            }`}
            aria-hidden="true"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
          </span>

          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-slate-200">{item.title}</p>
            <span className="text-[11px] text-slate-500 shrink-0">
              {typeof item.timestamp === 'number'
                ? formatLatency(item.timestamp)
                : formatDateTime(item.timestamp)}
            </span>
          </div>
          {item.description && (
            <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

export default Timeline;