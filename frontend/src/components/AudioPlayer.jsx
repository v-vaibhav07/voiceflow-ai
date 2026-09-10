import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * Small AudioPlayer status indicator.
 *
 * The actual audio element is owned by useAudio() — this component
 * just subscribes to state changes for display.
 */
export function AudioPlayer({ isPlaying = false, currentText, provider = 'rime', className = '' }) {
  const [bars, setBars] = useState([4, 6, 3, 8, 5]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setBars(Array.from({ length: 5 }, () => Math.floor(Math.random() * 16) + 4));
    }, 180);
    return () => clearInterval(id);
  }, [isPlaying]);

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${
        isPlaying ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/40'
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          isPlaying ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'
        }`}
      >
        {isPlaying ? (
          <Volume2 className="w-4 h-4" aria-hidden="true" />
        ) : (
          <VolumeX className="w-4 h-4" aria-hidden="true" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-slate-300">
            {isPlaying ? 'Playing' : 'Idle'} · {provider.toUpperCase()}
          </span>
        </div>
        {currentText && (
          <p className="text-xs text-slate-400 truncate" title={currentText}>
            {currentText}
          </p>
        )}
      </div>

      {isPlaying && (
        <div className="flex items-end gap-0.5 h-5 shrink-0" aria-hidden="true">
          {bars.map((h, i) => (
            <span
              key={i}
              className="w-1 rounded-sm bg-emerald-400 transition-all duration-150"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default AudioPlayer;