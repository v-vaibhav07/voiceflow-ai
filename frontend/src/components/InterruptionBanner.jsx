import { Zap } from 'lucide-react';
import { formatLatency } from '../utils/formatters';

export function InterruptionBanner({ interruption, className = '' }) {
  if (!interruption) return null;

  const { oldRequest, newRequest, audioStopLatencyMs, recoveryLatencyMs, cancelledCount, staleBlocked } = interruption;

  return (
    <div
      className={`animate-slide-up border border-red-500/30 bg-gradient-to-r from-red-500/10 to-amber-500/5 rounded-xl p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-red-300" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-200 mb-2">Interruption detected — recovering</p>
          <ul className="space-y-1 text-xs text-slate-300">
            <li>✓ Previous speech stopped ({formatLatency(audioStopLatencyMs)})</li>
            <li>✓ Previous request invalidated</li>
            <li>✓ New instruction received{newRequest ? `: “${newRequest}”` : ''}</li>
            <li>✓ Stale result blocked{typeof staleBlocked === 'number' ? ` (${staleBlocked})` : ''}</li>
            <li>✓ {cancelledCount ?? 0} in-flight request(s) cancelled</li>
            {recoveryLatencyMs != null && <li>✓ New response generated in {formatLatency(recoveryLatencyMs)}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default InterruptionBanner;