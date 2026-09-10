import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (options) => {
      const id = ++idCounter;
      const toast = {
        id,
        variant: 'info',
        duration: 4000,
        ...(typeof options === 'string' ? { message: options } : options),
      };
      setToasts((prev) => [...prev, toast]);
      if (toast.duration > 0) {
        setTimeout(() => dismiss(id), toast.duration);
      }
      return id;
    },
    [dismiss]
  );

  const api = {
    show,
    success: (message, opts) => show({ ...opts, message, variant: 'success' }),
    error: (message, opts) => show({ ...opts, message, variant: 'error' }),
    info: (message, opts) => show({ ...opts, message, variant: 'info' }),
    warning: (message, opts) => show({ ...opts, message, variant: 'warning' }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const VARIANT_STYLES = {
  success: { icon: CheckCircle2, ring: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
  error:   { icon: AlertCircle, ring: 'border-red-500/30', bg: 'bg-red-500/10', text: 'text-red-300' },
  warning: { icon: AlertTriangle, ring: 'border-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-300' },
  info:    { icon: Info, ring: 'border-brand-500/30', bg: 'bg-brand-500/10', text: 'text-brand-300' },
};

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const { variant = 'info', message, title } = toast;
  const { icon: Icon, ring, bg, text } = VARIANT_STYLES[variant] || VARIANT_STYLES.info;

  useEffect(() => {
    // ensure focus-visible works even for auto-added toasts
  }, []);

  return (
    <div
      role="status"
      className={`pointer-events-auto animate-slide-up flex gap-3 items-start p-3 rounded-lg border ${ring} ${bg} backdrop-blur-md shadow-lg`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${text}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && <p className={`text-sm font-semibold ${text}`}>{title}</p>}
        <p className="text-sm text-slate-200 break-words">{message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="text-slate-400 hover:text-white transition-colors shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default ToastProvider;