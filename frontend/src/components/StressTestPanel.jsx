import { useState } from 'react';
import { Play, Zap, Wand2 } from 'lucide-react';
import { TOOL_DELAY_PRESETS, INTERRUPTION_DELAY_PRESETS, SAMPLE_PROMPTS, INTERRUPTION_PHRASES } from '../utils/constants';

/**
 * Control panel for the stress test.
 * Emits configuration changes and can trigger a scripted scenario.
 */
export function StressTestPanel({
  connected = false,
  toolDelayMs = 2000,
  interruptionDelayMs = 1000,
  onChangeToolDelay,
  onChangeInterruptionDelay,
  onRunScenario,
  running = false,
  className = '',
}) {
  const [initialPrompt, setInitialPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [interruption, setInterruption] = useState(INTERRUPTION_PHRASES[0]);

  const handleRun = () => {
    if (!connected || running) return;
    onRunScenario?.({
      toolDelayMs,
      interruptionDelayMs,
      initialPrompt,
      interruption,
    });
  };

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg bg-brand-500/15 text-brand-300 flex items-center justify-center">
          <Wand2 className="w-4 h-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Stress Test Configuration</h2>
          <p className="text-xs text-slate-400">Simulate delayed tools + user interruption</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Tool delay */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Tool delay (artificial)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TOOL_DELAY_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onChangeToolDelay?.(preset.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  toolDelayMs === preset.value
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interruption delay */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Interruption timing (after tool starts)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {INTERRUPTION_DELAY_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onChangeInterruptionDelay?.(preset.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  interruptionDelayMs === preset.value
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompts */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Initial prompt</label>
          <select
            className="input"
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
          >
            {SAMPLE_PROMPTS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Interruption phrase</label>
          <select
            className="input"
            value={interruption}
            onChange={(e) => setInterruption(e.target.value)}
          >
            {INTERRUPTION_PHRASES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={!connected || running}
          className="btn-primary w-full"
        >
          {running ? (
            <>
              <Zap className="w-4 h-4 animate-pulse" />
              Running scenario…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run scripted scenario
            </>
          )}
        </button>

        <p className="text-[11px] text-slate-500 italic">
          This is a synthetic test condition. Delays are injected server-side to
          make interruption timing reproducible.
        </p>
      </div>
    </div>
  );
}

export default StressTestPanel;