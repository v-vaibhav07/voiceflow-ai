import { Mic, MicOff, Square } from 'lucide-react';
import { VOICE_STATE } from '../utils/constants';

/**
 * The primary voice interaction control.
 *
 * Behavior:
 *  - Off:               shows mic-off icon; click starts the mic
 *  - On (listening):    shows mic + subtle pulse; click stops the mic
 *  - AI speaking:       overlays a red stop indicator to signal that
 *                       clicking will interrupt playback
 */
export function MicButton({
  active = false,
  state = VOICE_STATE.IDLE,
  disabled = false,
  onToggle,
  onManualStop,
  size = 'lg',
  className = '',
}) {
  const isSpeaking = state === VOICE_STATE.SPEAKING;
  const isProcessing = state === VOICE_STATE.PROCESSING || state === VOICE_STATE.TOOL_RUNNING;

  const sizes = {
    md: 'w-16 h-16',
    lg: 'w-24 h-24 sm:w-28 sm:h-28',
    xl: 'w-32 h-32 sm:w-36 sm:h-36',
  };
  const iconSizes = {
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
    xl: 'w-12 h-12',
  };

  const handleClick = () => {
    if (disabled) return;
    if (isSpeaking && onManualStop) {
      onManualStop();
      return;
    }
    onToggle?.();
  };

  const baseGradient = active
    ? 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/30'
    : isSpeaking
    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30'
    : 'bg-gradient-to-br from-brand-500 to-purple-600 shadow-brand-500/30';

  const label = isSpeaking
    ? 'Stop AI speech'
    : active
    ? 'Stop microphone'
    : 'Start microphone';

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Pulse rings */}
      {(active || isProcessing || isSpeaking) && (
        <>
          <span
            className={`absolute inset-0 rounded-full ${
              isSpeaking ? 'bg-emerald-500/30' : active ? 'bg-red-500/30' : 'bg-brand-500/30'
            } animate-ring-pulse`}
            aria-hidden="true"
          />
          <span
            className={`absolute inset-0 rounded-full ${
              isSpeaking ? 'bg-emerald-500/20' : active ? 'bg-red-500/20' : 'bg-brand-500/20'
            } animate-ring-pulse`}
            style={{ animationDelay: '0.6s' }}
            aria-hidden="true"
          />
        </>
      )}

      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={handleClick}
        className={`
          relative ${sizes[size]} rounded-full shadow-2xl
          ${baseGradient}
          flex items-center justify-center
          transition-all duration-150 active:scale-95
          disabled:opacity-40 disabled:cursor-not-allowed
          focus-visible:ring-4 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950
          ${active ? 'focus-visible:ring-red-400' : 'focus-visible:ring-brand-400'}
        `}
      >
        {isSpeaking ? (
          <Square className={`${iconSizes[size]} text-white fill-white`} aria-hidden="true" />
        ) : active ? (
          <MicOff className={`${iconSizes[size]} text-white`} aria-hidden="true" />
        ) : (
          <Mic className={`${iconSizes[size]} text-white`} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export default MicButton;