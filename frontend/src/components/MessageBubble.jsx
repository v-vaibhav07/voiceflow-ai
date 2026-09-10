import { User, Bot, Zap } from 'lucide-react';
import { formatLatency } from '../utils/formatters';

export function MessageBubble({ message, className = '' }) {
  const isUser = message.role === 'user';
  const isInterrupted = message.interrupted === true;
  const isDiscarded = message.status === 'discarded';

  return (
    <div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-fade-in ${className}`}
      role="article"
      aria-label={isUser ? 'User message' : 'Assistant message'}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? 'bg-brand-500/20 text-brand-300' : 'bg-slate-800 text-slate-300'
        }`}
        aria-hidden="true"
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`
            px-4 py-2.5 rounded-2xl text-sm
            ${isUser
              ? 'bg-brand-500 text-white rounded-tr-sm'
              : isDiscarded
              ? 'bg-slate-900 text-slate-500 border border-slate-800 rounded-tl-sm line-through'
              : 'bg-slate-800 text-slate-100 rounded-tl-sm'}
            ${isInterrupted ? 'ring-1 ring-red-500/40' : ''}
          `}
        >
          {message.text || <span className="italic opacity-60">…</span>}
        </div>

        <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-slate-500">
          {isInterrupted && (
            <span className="inline-flex items-center gap-1 text-red-400">
              <Zap className="w-3 h-3" />
              interrupted
            </span>
          )}
          {isDiscarded && !isInterrupted && (
            <span className="text-slate-500">discarded (stale)</span>
          )}
          {message.audioDurationMs != null && !isUser && (
            <span>{formatLatency(message.audioDurationMs)} audio</span>
          )}
          {message.provider && !isUser && (
            <span className="uppercase tracking-wide">{message.provider}</span>
          )}
          {message.generation != null && (
            <span className="text-slate-600">g{message.generation}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;