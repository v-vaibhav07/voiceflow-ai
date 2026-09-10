import { STATE_LABELS, STATE_COLORS, VOICE_STATE } from '../utils/constants';

const DOT_COLORS = {
  neutral: 'bg-slate-400',
  info: 'bg-brand-400',
  warning: 'bg-amber-400',
  success: 'bg-emerald-400',
  danger: 'bg-red-400',
};

const PULSE_STATES = new Set([
  VOICE_STATE.LISTENING,
  VOICE_STATE.PROCESSING,
  VOICE_STATE.TOOL_RUNNING,
  VOICE_STATE.SPEAKING,
  VOICE_STATE.RECOVERING,
]);

export function VoiceStatus({ state = VOICE_STATE.IDLE, className = '' }) {
  const label = STATE_LABELS[state] || state;
  const color = STATE_COLORS[state] || 'neutral';
  const dot = DOT_COLORS[color];
  const shouldPulse = PULSE_STATES.has(state);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-800 text-sm ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex items-center justify-center w-2.5 h-2.5">
        {shouldPulse && (
          <span className={`absolute inline-flex w-full h-full rounded-full ${dot} opacity-60 animate-ping`} />
        )}
        <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${dot}`} />
      </span>
      <span className="text-slate-200 font-medium">{label}</span>
      <span className="sr-only-live">Voice status: {label}</span>
    </div>
  );
}

export default VoiceStatus;