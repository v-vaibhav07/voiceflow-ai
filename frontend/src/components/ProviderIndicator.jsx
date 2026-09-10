import { Sparkles, ShieldAlert } from 'lucide-react';

export function ProviderIndicator({ provider = 'rime', configured = true, fallbackActive = false, className = '' }) {
  if (fallbackActive) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium ${className}`}
        role="status"
      >
        <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
        Fallback TTS active (browser)
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${
        configured ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-400'
      } text-xs font-medium ${className}`}
      role="status"
      aria-label={`Text-to-speech provider: ${provider.toUpperCase()}`}
    >
      <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
      {provider.toUpperCase()} {configured ? 'ACTIVE' : 'NOT CONFIGURED'}
    </div>
  );
}

export default ProviderIndicator;