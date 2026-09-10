// import { useMemo } from 'react';
// import { MicButton } from './MicButton';
// import { VoiceStatus } from './VoiceStatus';
// import { ConversationView } from './ConversationView';
// import { AudioPlayer } from './AudioPlayer';
// import { ProviderIndicator } from './ProviderIndicator';
// import { LatencyMeter } from './LatencyMeter';
// import { ToolExecutionCard } from './ToolExecutionCard';
// import { RecoveryStatus } from './RecoveryStatus';
// import { RimeConfigCard } from './RimeConfigCard';
// import { AlertCircle, MicOff, Trash2, Send } from 'lucide-react';
// import { useState } from 'react';
// import { VOICE_STATE } from '../utils/constants';

// /**
//  * The main voice interface — composes MicButton, Transcript, and status panels
//  * into a full experience. Accepts a `voice` object from useVoice().
//  */
// export function VoiceInterface({ voice, showConfig = true, className = '' }) {
//   const [textInput, setTextInput] = useState('');

//   const latestInterruption = voice.interruptions[voice.interruptions.length - 1] || null;
//   const activeTools = voice.toolCalls.filter((t) => t.status === 'running');
//   const currentAssistant = useMemo(() => {
//     for (let i = voice.messages.length - 1; i >= 0; i--) {
//       if (voice.messages[i].role === 'assistant') return voice.messages[i];
//     }
//     return null;
//   }, [voice.messages]);

//   const recoveryStatus =
//     voice.state === VOICE_STATE.INTERRUPTED
//       ? 'audio_stopped'
//       : voice.state === VOICE_STATE.RECOVERING
//       ? 'new_processing'
//       : voice.state === VOICE_STATE.SPEAKING
//       ? 'new_audio'
//       : voice.state === VOICE_STATE.COMPLETED
//       ? 'complete'
//       : 'idle';

//   const handleSendText = (e) => {
//     e.preventDefault();
//     if (textInput.trim()) {
//       voice.sendText(textInput.trim());
//       setTextInput('');
//     }
//   };

//   return (
//     <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 h-full min-h-0 ${className}`}>
//       {/* LEFT: conversation */}
//       <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
//         {/* Header row */}
//         <div className="flex flex-wrap items-center gap-2">
//           <VoiceStatus state={voice.state} />
//           <ProviderIndicator
//             provider={voice.rimeInfo?.model ? 'rime' : 'rime'}
//             configured={voice.rimeInfo?.configured}
//           />
//           {!voice.connected && (
//             <span className="badge badge-warning">Disconnected</span>
//           )}
//           {voice.staleBlockedCount > 0 && (
//             <span className="badge badge-danger">
//               {voice.staleBlockedCount} stale blocked
//             </span>
//           )}
//           <button
//             type="button"
//             onClick={voice.resetConversation}
//             className="btn-ghost !py-1 !px-2 ml-auto text-xs"
//             aria-label="Clear conversation"
//           >
//             <Trash2 className="w-3.5 h-3.5" />
//             Clear
//           </button>
//         </div>

//         {/* Error banner */}
//         {voice.error && (
//           <div
//             className="flex items-start gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10"
//             role="alert"
//           >
//             <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
//             <div className="flex-1 text-sm text-red-200">{voice.error}</div>
//             <button
//               type="button"
//               onClick={voice.clearError}
//               className="text-red-300 hover:text-white text-xs"
//             >
//               Dismiss
//             </button>
//           </div>
//         )}

//         {/* Mic support warning */}
//         {!voice.recognitionSupported && (
//           <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
//             <MicOff className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
//             <p className="text-sm text-amber-200">
//               Your browser does not support the Web Speech API. Use Chrome or Edge, or type your message below.
//             </p>
//           </div>
//         )}

//         {/* Conversation */}
//         <div className="card !p-4 flex-1 min-h-[320px] lg:min-h-0 flex flex-col">
//           <ConversationView
//             messages={voice.messages}
//             interimText={voice.interimText}
//             latestInterruption={
//               voice.state === VOICE_STATE.INTERRUPTED || voice.state === VOICE_STATE.RECOVERING
//                 ? latestInterruption
//                 : null
//             }
//           />
//         </div>

//         {/* Text input fallback */}
//         <form onSubmit={handleSendText} className="flex gap-2">
//           <input
//             type="text"
//             className="input"
//             placeholder="Or type your message and press Enter"
//             value={textInput}
//             onChange={(e) => setTextInput(e.target.value)}
//             aria-label="Type a message"
//           />
//           <button type="submit" className="btn-primary" disabled={!textInput.trim() || !voice.connected}>
//             <Send className="w-4 h-4" />
//             Send
//           </button>
//         </form>

//         {/* Mic + status */}
//         <div className="card !p-6 flex flex-col items-center gap-4">
//           <MicButton
//             active={voice.micActive}
//             state={voice.state}
//             disabled={!voice.connected}
//             onToggle={voice.toggleMic}
//             onManualStop={voice.manualStop}
//           />
//           <p className="text-xs text-slate-500 text-center max-w-xs">
//             {voice.state === VOICE_STATE.SPEAKING
//               ? 'Click the button or start speaking to interrupt.'
//               : voice.micActive
//               ? 'Listening — speak naturally.'
//               : 'Click the microphone to start.'}
//           </p>
//         </div>
//       </div>

//       {/* RIGHT: side panels */}
//       <div className="flex flex-col gap-4 min-h-0 overflow-y-auto">
//         <AudioPlayer
//           isPlaying={voice.isPlaying}
//           provider={voice.rimeInfo?.model ? 'rime' : 'rime'}
//           currentText={currentAssistant?.text}
//         />

//         {/* Live metrics */}
//         <div className="grid grid-cols-1 gap-3">
//           <LatencyMeter
//             label="End-to-end latency"
//             value={voice.metrics.endToEnd}
//             threshold={3000}
//             hint="STT → LLM → Rime → audio"
//           />
//           <LatencyMeter
//             label="Rime synthesis"
//             value={voice.metrics.rime}
//             threshold={2000}
//           />
//           {voice.metrics.recovery != null && (
//             <LatencyMeter
//               label="Recovery latency"
//               value={voice.metrics.recovery}
//               threshold={3000}
//               hint="Interruption → new audio"
//             />
//           )}
//         </div>

//         {/* Active tools */}
//         {activeTools.length > 0 && (
//           <div className="space-y-2">
//             <p className="text-xs uppercase tracking-wide text-slate-500">Active tools</p>
//             {activeTools.map((t) => (
//               <ToolExecutionCard key={t.id} toolCall={t} />
//             ))}
//           </div>
//         )}

//         {/* Recovery pipeline */}
//         {(voice.state === VOICE_STATE.INTERRUPTED ||
//           voice.state === VOICE_STATE.RECOVERING ||
//           voice.interruptions.length > 0) && (
//           <RecoveryStatus status={recoveryStatus} />
//         )}

//         {/* Rime config */}
//         {showConfig && <RimeConfigCard rime={voice.rimeInfo} />}
//       </div>
//     </div>
//   );
// }

// export default VoiceInterface;



















import { useMemo, useState } from 'react';
import { MicButton } from './MicButton';
import { VoiceStatus } from './VoiceStatus';
import { ConversationView } from './ConversationView';
import { AudioPlayer } from './AudioPlayer';
import { ProviderIndicator } from './ProviderIndicator';
import { LatencyMeter } from './LatencyMeter';
import { ToolExecutionCard } from './ToolExecutionCard';
import { RecoveryStatus } from './RecoveryStatus';
import { RimeConfigCard } from './RimeConfigCard';

import {
  AlertCircle,
  MicOff,
  Trash2,
  Send,
  Radio,
  Waves,
} from 'lucide-react';

import {
  VOICE_STATE,
  VAD_SENSITIVITY_PRESETS,
} from '../utils/constants';

export function VoiceInterface({
  voice,
  showConfig = true,
  className = '',
}) {
  const [textInput, setTextInput] =
    useState('');

  const [
    vadSensitivity,
    setVadSensitivity,
  ] = useState('medium');

  const latestInterruption =
    voice.interruptions[
      voice.interruptions.length - 1
    ] || null;

  const activeTools =
    voice.toolCalls.filter(
      (tool) =>
        tool.status === 'running'
    );

  const currentAssistant =
    useMemo(() => {
      for (
        let i =
          voice.messages.length - 1;
        i >= 0;
        i--
      ) {
        if (
          voice.messages[i].role ===
          'assistant'
        ) {
          return voice.messages[i];
        }
      }

      return null;
    }, [voice.messages]);

  const recoveryStatus =
    voice.state ===
    VOICE_STATE.INTERRUPTED
      ? 'audio_stopped'
      : voice.state ===
        VOICE_STATE.RECOVERING
      ? 'new_processing'
      : voice.state ===
        VOICE_STATE.SPEAKING
      ? 'new_audio'
      : voice.state ===
        VOICE_STATE.COMPLETED
      ? 'complete'
      : 'idle';

  const handleSendText = (event) => {
    event.preventDefault();

    const text =
      textInput.trim();

    if (!text) return;

    voice.sendText(text);

    setTextInput('');
  };

  const energyPercent = Math.min(
    100,
    Math.round(
      (voice.vadEnergy || 0) * 3000
    )
  );

  const handleSensitivityChange = (
    value
  ) => {
    setVadSensitivity(value);

    /*
     * The actual VAD hook receives its
     * sensitivity from the parent hook.
     *
     * This config call is optional and
     * harmless if the backend ignores it.
     */
    voice.updateConfig?.({
      vadSensitivity: value,
    });
  };

  return (
    <div
      className={`grid grid-cols-1 lg:grid-cols-3 gap-4 h-full min-h-0 ${className}`}
    >
      {/* LEFT */}
      <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <VoiceStatus
            state={voice.state}
          />

          <ProviderIndicator
            provider="rime"
            configured={
              voice.rimeInfo?.configured
            }
          />

          {voice.streamingMode && (
            <span className="badge badge-info flex items-center gap-1">
              <Waves className="w-3 h-3" />
              Streaming
            </span>
          )}

          {voice.serverSTTActive && (
            <span className="badge badge-success flex items-center gap-1">
              <Radio className="w-3 h-3" />
              Server STT
            </span>
          )}

          {voice.vadActive && (
            <span className="badge badge-warning">
              VAD Active
            </span>
          )}

          {!voice.connected && (
            <span className="badge badge-warning">
              Disconnected
            </span>
          )}

          {voice.staleBlockedCount > 0 && (
            <span className="badge badge-danger">
              {voice.staleBlockedCount}{' '}
              stale blocked
            </span>
          )}

          <button
            type="button"
            onClick={
              voice.resetConversation
            }
            className="btn-ghost !py-1 !px-2 ml-auto text-xs"
            aria-label="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        {/* VAD meter */}
        {voice.vadActive && (
          <div className="card !p-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-20 shrink-0">
                Voice Energy
              </span>

              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    voice.vadSpeaking
                      ? 'bg-red-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{
                    width: `${energyPercent}%`,
                  }}
                />
              </div>

              <span className="text-[10px] text-slate-500 w-12 text-right tabular-nums">
                {energyPercent}%
              </span>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-slate-500">
                Sensitivity:
              </span>

              {VAD_SENSITIVITY_PRESETS.map(
                (preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() =>
                      handleSensitivityChange(
                        preset.value
                      )
                    }
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      vadSensitivity ===
                      preset.value
                        ? 'bg-brand-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                    title={
                      preset.description
                    }
                  >
                    {preset.label}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {voice.error && (
          <div
            className="flex items-start gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />

            <div className="flex-1 text-sm text-red-200">
              {voice.error}
            </div>

            <button
              type="button"
              onClick={
                voice.clearError
              }
              className="text-red-300 hover:text-white text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* STT warning */}
        {!voice.recognitionSupported &&
          !voice.capabilities?.serverSTT && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
              <MicOff className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />

              <p className="text-sm text-amber-200">
                Browser STT unavailable.
                Use Chrome/Edge, or
                configure server-side STT
                (Deepgram).
              </p>
            </div>
          )}

        {/* Conversation */}
        <div className="card !p-4 flex-1 min-h-[320px] lg:min-h-0 flex flex-col">
          <ConversationView
            messages={
              voice.messages
            }
            interimText={
              voice.interimText
            }
            latestInterruption={
              voice.state ===
                VOICE_STATE.INTERRUPTED ||
              voice.state ===
                VOICE_STATE.RECOVERING
                ? latestInterruption
                : null
            }
          />
        </div>

        {/* Text input */}
        <form
          onSubmit={
            handleSendText
          }
          className="flex gap-2"
        >
          <input
            type="text"
            className="input"
            placeholder="Or type your message and press Enter"
            value={textInput}
            onChange={(event) =>
              setTextInput(
                event.target.value
              )
            }
            aria-label="Type a message"
          />

          <button
            type="submit"
            className="btn-primary"
            disabled={
              !textInput.trim() ||
              !voice.connected
            }
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>

        {/* Microphone */}
        <div className="card !p-6 flex flex-col items-center gap-4">
          <MicButton
            active={
              voice.micActive
            }
            state={voice.state}
            disabled={
              !voice.connected
            }
            onToggle={
              voice.toggleMic
            }
            onManualStop={
              voice.manualStop
            }
          />

          <p className="text-xs text-slate-500 text-center max-w-xs">
            {voice.state ===
            VOICE_STATE.SPEAKING
              ? 'Click the button or start speaking to interrupt.'
              : voice.micActive
              ? voice.serverSTTActive
                ? 'Listening via server STT — speak naturally.'
                : 'Listening — speak naturally.'
              : 'Click the microphone to start.'}
          </p>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex flex-col gap-4 min-h-0 overflow-y-auto">
        <AudioPlayer
          isPlaying={
            voice.isPlaying
          }
          provider="rime"
          currentText={
            currentAssistant?.text
          }
        />

        {/* Metrics */}
        <div className="grid grid-cols-1 gap-3">
          <LatencyMeter
            label="End-to-end latency"
            value={
              voice.metrics
                .endToEnd
            }
            threshold={3000}
            hint="STT → LLM → Rime → audio"
          />

          <LatencyMeter
            label="Rime synthesis"
            value={
              voice.metrics.rime ||
              voice.metrics.rime_chunk
            }
            threshold={2000}
          />

          {voice.metrics
            .firstAudio != null && (
            <LatencyMeter
              label="Time to first audio"
              value={
                voice.metrics
                  .firstAudio
              }
              threshold={1500}
              hint={
                voice.streamingMode
                  ? 'Streaming (first sentence)'
                  : 'Full response'
              }
            />
          )}

          {voice.metrics
            .recovery != null && (
            <LatencyMeter
              label="Recovery latency"
              value={
                voice.metrics
                  .recovery
              }
              threshold={3000}
              hint="Interruption → new audio"
            />
          )}
        </div>

        {/* Active tools */}
        {activeTools.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Active tools
            </p>

            {activeTools.map(
              (tool) => (
                <ToolExecutionCard
                  key={
                    tool.id ||
                    tool.callId
                  }
                  toolCall={tool}
                />
              )
            )}
          </div>
        )}

        {/* Recovery */}
        {(voice.state ===
          VOICE_STATE.INTERRUPTED ||
          voice.state ===
            VOICE_STATE.RECOVERING ||
          voice.interruptions
            .length > 0) && (
          <RecoveryStatus
            status={
              recoveryStatus
            }
          />
        )}

        {/* Rime */}
        {showConfig && (
          <RimeConfigCard
            rime={
              voice.rimeInfo
            }
          />
        )}
      </div>
    </div>
  );
}

export default VoiceInterface;