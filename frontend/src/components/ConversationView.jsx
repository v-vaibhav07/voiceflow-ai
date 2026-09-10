import { Transcript } from './Transcript';
import { InterruptionBanner } from './InterruptionBanner';

export function ConversationView({
  messages = [],
  interimText,
  latestInterruption = null,
  header,
  footer,
  className = '',
}) {
  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {header && <div className="mb-3 shrink-0">{header}</div>}

      {latestInterruption && (
        <div className="mb-3 shrink-0">
          <InterruptionBanner interruption={latestInterruption} />
        </div>
      )}

      <div className="flex-1 min-h-0">
        <Transcript messages={messages} interimText={interimText} />
      </div>

      {footer && <div className="mt-3 shrink-0">{footer}</div>}
    </div>
  );
}

export default ConversationView;