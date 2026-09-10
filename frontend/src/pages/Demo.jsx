import { useState } from 'react';
import { useVoice } from '../hooks/useVoice';
import { VoiceInterface } from '../components/VoiceInterface';

export default function Demo() {
  const [
    vadSensitivity,
    setVadSensitivity,
  ] = useState('medium');

  const voice = useVoice({
    autoConnect: true,
    vadSensitivity,
  });

  return (
    <div className="max-w-7xl w-full mx-auto p-4 lg:p-6 flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Voice Agent
          </h1>

          <p className="text-sm text-slate-400">
            Click the mic, speak your request,
            and interrupt whenever you need to.

            {voice.capabilities
              ?.streamingTTS && (
              <>
                {' '}
                Streaming audio is
                active.
              </>
            )}

            {voice.capabilities
              ?.serverSTT && (
              <>
                {' '}
                Server-side STT
                (Deepgram) is
                available.
              </>
            )}
          </p>
        </div>

        {/* Capability badges */}
        <div className="flex items-center gap-2 text-xs">
          {voice.capabilities
            ?.serverSTT && (
            <span className="badge badge-success">
              Deepgram STT Ready
            </span>
          )}

          {voice.capabilities
            ?.streamingTTS && (
            <span className="badge badge-info">
              Streaming TTS
            </span>
          )}

          {!voice.connected && (
            <span className="badge badge-warning">
              Connecting...
            </span>
          )}

          {voice.connected && (
            <span className="badge badge-success">
              Connected
            </span>
          )}
        </div>
      </div>

      {/* Main voice interface */}
      <div className="flex-1 min-h-0">
        <VoiceInterface
          voice={voice}
        />
      </div>
    </div>
  );
}