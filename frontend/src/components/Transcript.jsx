import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './EmptyState';
import { MessageSquare } from 'lucide-react';

export function Transcript({ messages = [], interimText, className = '' }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, interimText]);

  const hasContent = messages.length > 0 || interimText;

  return (
    <div
      ref={scrollRef}
      className={`h-full overflow-y-auto space-y-3 px-1 ${className}`}
      role="log"
      aria-live="polite"
      aria-label="Conversation transcript"
    >
      {!hasContent ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversation yet"
          description="Click the microphone and start speaking to begin."
        />
      ) : (
        <>
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {interimText && (
            <div className="flex justify-end animate-fade-in">
              <div className="max-w-[80%] px-4 py-2 rounded-2xl bg-brand-500/40 text-brand-50 text-sm italic border border-brand-500/40">
                {interimText}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Transcript;