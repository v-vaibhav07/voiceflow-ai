import { CheckCircle2, Loader2, RotateCw } from 'lucide-react';

export function RecoveryStatus({ status = 'idle', className = '' }) {
  const items = [
    { key: 'audio_stopped', label: 'Audio stopped' },
    { key: 'request_invalidated', label: 'Old request invalidated' },
    { key: 'stale_blocked', label: 'Stale results blocked' },
    { key: 'new_processing', label: 'New request processing' },
    { key: 'new_audio', label: 'New Rime audio' },
  ];

  const statusOrder = {
    idle: -1,
    audio_stopped: 0,
    request_invalidated: 1,
    stale_blocked: 2,
    new_processing: 3,
    new_audio: 4,
    complete: 5,
  };

  const currentStep = statusOrder[status] ?? -1;

  return (
    <div className={`card !p-4 ${className}`} role="region" aria-label="Recovery status">
      <div className="flex items-center gap-2 mb-3">
        <RotateCw className="w-4 h-4 text-brand-300" />
        <h3 className="text-sm font-semibold text-white">Recovery Pipeline</h3>
      </div>
      <ol className="space-y-2">
        {items.map((item, idx) => {
          const done = currentStep >= idx || status === 'complete';
          const active = currentStep === idx && status !== 'complete';
          return (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              ) : active ? (
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-slate-700 shrink-0" aria-hidden="true" />
              )}
              <span className={done ? 'text-slate-200' : active ? 'text-amber-200' : 'text-slate-500'}>
                {item.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default RecoveryStatus;