import { Loader2 } from 'lucide-react';

export function LoadingState({ label = 'Loading…', size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
  };
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 py-8 ${className}`}
    >
      <Loader2 className={`${sizes[size]} text-brand-400 animate-spin`} />
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}

export default LoadingState;