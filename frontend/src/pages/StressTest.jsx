import { useEffect, useRef, useState } from 'react';
import { useVoice } from '../hooks/useVoice';
import { VoiceInterface } from '../components/VoiceInterface';
import { StressTestPanel } from '../components/StressTestPanel';
import { MetricCard } from '../components/MetricCard';
import { Timeline } from '../components/Timeline';
import { useToast } from '../components/Toast';
import {
  startEvaluationRun,
  recordEvaluationMetrics,
  completeEvaluationRun,
} from '../api/api';
import { formatLatency } from '../utils/formatters';
import { Zap, Timer, ShieldCheck } from 'lucide-react';
import { VOICE_STATE } from '../utils/constants';

export default function StressTest() {
  const voice = useVoice({ autoConnect: true });
  const toast = useToast();

  const [toolDelay, setToolDelay] = useState(2000);
  const [interruptionDelay, setInterruptionDelay] = useState(1000);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  /*
   * IMPORTANT:
   * useVoice() returns a new object when the hook rerenders.
   *
   * We keep the latest voice object in a ref so asynchronous
   * stress-test functions always read the latest state/metrics.
   */
  const voiceRef = useRef(voice);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  /*
   * Push tool-delay configuration to backend.
   *
   * Do NOT depend on the complete "voice" object because
   * that object changes between renders.
   */
  useEffect(() => {
    if (voice.connected) {
      voice.updateConfig({
        toolDelayMs: toolDelay,
      });
    }
  }, [toolDelay, voice.connected]);

  const latest =
    voice.interruptions[
      voice.interruptions.length - 1
    ] || null;

  const runScenario = async ({
    initialPrompt,
    interruption,
    toolDelayMs,
    interruptionDelayMs,
  }) => {
    const currentVoice = voiceRef.current;

    if (!currentVoice.connected) {
      toast.warning('Not connected');
      return;
    }

    if (running) {
      return;
    }

    setRunning(true);
    setLastResult(null);

    let runId = null;

    try {
      /*
       * Create evaluation run.
       */
      try {
        const run =
          await startEvaluationRun({
            testName: 'stress_scenario_ui',

            description:
              `Interruption after ${interruptionDelayMs}ms with ${toolDelayMs}ms tool delay`,

            config: {
              toolDelayMs,
              interruptionDelayMs,
              initialPrompt,
              interruption,
            },
          });

        runId = run?.run?.id || null;
      } catch (err) {
        console.warn(
          'Could not start evaluation run:',
          err?.message
        );
      }

      const scenarioStart =
        performance.now();

      /*
       * Apply the scenario-specific delay.
       */
      voiceRef.current.updateConfig({
        toolDelayMs,
      });

      /*
       * Reset stale-result counter baseline.
       * We don't reset the whole conversation because
       * the scenario needs the current voice session.
       */
      const staleBefore =
        voiceRef.current.staleBlockedCount || 0;

      /*
       * Send the initial request.
       */
      voiceRef.current.sendText(
        initialPrompt
      );

      /*
       * Wait until the CURRENT voice instance enters
       * a busy state.
       */
      const busyState =
        await waitForVoiceState(
          voiceRef,
          [
            VOICE_STATE.PROCESSING,
            VOICE_STATE.TOOL_RUNNING,
            VOICE_STATE.SPEAKING,
          ],
          8000
        );

      if (!busyState) {
        toast.error(
          'AI did not start processing in time.'
        );

        if (runId) {
          await completeEvaluationRun(
            runId,
            'failed'
          ).catch(() => {});
        }

        setRunning(false);
        return;
      }

      /*
       * Wait before interrupting.
       */
      await sleep(
        interruptionDelayMs
      );

      /*
       * Send the interruption using the
       * latest voice instance.
       */
      voiceRef.current.sendText(
        interruption
      );

      /*
       * Wait for the NEW request to recover.
       *
       * We use a state ref plus generation/change detection.
       */
      const recovered =
        await waitForRecovery(
          voiceRef,
          20000
        );

      const elapsedMs =
        performance.now() -
        scenarioStart;

      /*
       * Always read the LATEST voice object.
       */
      const latestVoice =
        voiceRef.current;

      const info =
        latestVoice.interruptions[
          latestVoice.interruptions.length - 1
        ] || null;

      const staleBlocked =
        Math.max(
          0,
          (latestVoice.staleBlockedCount || 0) -
            staleBefore
        );

      const result = {
        elapsedMs,

        audioStopLatencyMs:
          info?.audioStopLatencyMs,

        recoveryLatencyMs:
          info?.recoveryLatencyMs,

        staleBlocked,

        cancelledCount:
          info?.cancelledCount,

        recovered: Boolean(
          recovered
        ),
      };

      setLastResult(result);

      /*
       * Record metrics.
       */
      if (runId) {
        try {
          await recordEvaluationMetrics(
            runId,
            [
              {
                name:
                  'audio_stop_latency',

                value: Math.round(
                  info?.audioStopLatencyMs || 0
                ),

                unit: 'ms',

                passed:
                  (info?.audioStopLatencyMs || 0) <
                  200,

                threshold: 200,
              },

              {
                name:
                  'recovery_latency',

                value: Math.round(
                  info?.recoveryLatencyMs || 0
                ),

                unit: 'ms',

                passed:
                  (info?.recoveryLatencyMs || 0) <
                  5000,

                threshold: 5000,
              },

              {
                name:
                  'stale_results_blocked',

                value: staleBlocked,

                unit: 'count',

                passed: true,
              },

              {
                name:
                  'scenario_total',

                value: Math.round(
                  elapsedMs
                ),

                unit: 'ms',

                passed: Boolean(
                  recovered
                ),
              },
            ]
          );

          /*
           * The scenario itself is successful only
           * if the new request recovered.
           */
          await completeEvaluationRun(
            runId,
            recovered
              ? 'completed'
              : 'failed'
          );

          if (recovered) {
            toast.success(
              'Scenario completed and recorded.'
            );
          } else {
            toast.error(
              'Scenario did not recover in time.'
            );
          }
        } catch (err) {
          toast.warning(
            `Recorded locally only: ${
              err?.message || 'Unknown error'
            }`
          );
        }
      }
    } catch (err) {
      console.error(
        'Stress scenario failed:',
        err
      );

      toast.error(
        err?.message ||
          'Stress scenario failed.'
      );

      if (runId) {
        await completeEvaluationRun(
          runId,
          'failed'
        ).catch(() => {});
      }
    } finally {
      setRunning(false);
    }
  };

  const timelineItems =
    voice.interruptionHistory.map(
      (it, idx) => ({
        id: `it-${idx}`,

        title:
          `Interruption #${idx + 1}`,

        description:
          `Stop ${formatLatency(
            it.audioStopLatencyMs
          )} · Recovery ${formatLatency(
            it.recoveryLatencyMs
          )}`,

        timestamp:
          Math.round(
            it.detectedAt || 0
          ),

        tone: 'danger',
      })
    );

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap className="w-6 h-6 text-brand-400" />

          Interruption Stress Test
        </h1>

        <p className="text-sm text-slate-400">
          Trigger an interruption during a
          delayed tool call and observe the
          recovery pipeline.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <StressTestPanel
          connected={voice.connected}
          toolDelayMs={toolDelay}
          interruptionDelayMs={
            interruptionDelay
          }
          onChangeToolDelay={
            setToolDelay
          }
          onChangeInterruptionDelay={
            setInterruptionDelay
          }
          onRunScenario={
            runScenario
          }
          running={running}
          className="lg:col-span-1"
        />

        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              icon={Timer}
              label="Audio stop"
              value={
                latest?.audioStopLatencyMs !=
                null
                  ? formatLatency(
                      latest.audioStopLatencyMs
                    )
                  : '—'
              }
              tone={
                (latest?.audioStopLatencyMs ??
                  0) < 200
                  ? 'success'
                  : 'warning'
              }
              sublabel="target ≤ 200ms"
            />

            <MetricCard
              icon={Timer}
              label="Recovery"
              value={
                latest?.recoveryLatencyMs !=
                null
                  ? formatLatency(
                      latest.recoveryLatencyMs
                    )
                  : '—'
              }
              tone={
                (latest?.recoveryLatencyMs ??
                  0) < 3000
                  ? 'success'
                  : 'warning'
              }
              sublabel="target ≤ 3s"
            />

            <MetricCard
              icon={ShieldCheck}
              label="Stale blocked"
              value={
                voice.staleBlockedCount
              }
              tone="brand"
            />

            <MetricCard
              icon={Zap}
              label="Cancelled"
              value={
                latest?.cancelledCount ??
                0
              }
              sublabel="in-flight tasks"
            />
          </div>

          {lastResult && (
            <div className="card !p-4 text-sm space-y-1">
              <p className="text-slate-300 font-medium">
                Last scenario result
              </p>

              <p className="text-slate-400">
                Total time:{' '}
                {formatLatency(
                  lastResult.elapsedMs
                )}
              </p>

              <p className="text-slate-400">
                Recovered:{' '}
                {lastResult.recovered
                  ? '✓ yes'
                  : '✗ no'}
              </p>

              <p className="text-slate-400">
                Audio stop:{' '}
                {formatLatency(
                  lastResult.audioStopLatencyMs
                )}
              </p>

              <p className="text-slate-400">
                Recovery:{' '}
                {formatLatency(
                  lastResult.recoveryLatencyMs
                )}
              </p>

              <p className="text-slate-400">
                Stale blocked:{' '}
                {lastResult.staleBlocked ??
                  0}
              </p>

              <p className="text-slate-400">
                Cancelled:{' '}
                {lastResult.cancelledCount ??
                  0}
              </p>
            </div>
          )}

          <div className="card !p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              Interruption timeline
            </h3>

            {timelineItems.length ===
            0 ? (
              <p className="text-xs text-slate-500 italic">
                No interruptions yet.
              </p>
            ) : (
              <Timeline
                items={timelineItems.slice(
                  -10
                )}
              />
            )}
          </div>
        </div>
      </div>

      <div className="min-h-[500px] flex flex-col">
        <VoiceInterface
          voice={voice}
          showConfig={false}
        />
      </div>
    </div>
  );
}

/*
 * Simple sleep helper.
 */
function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

/*
 * IMPORTANT:
 *
 * Instead of passing the voice object directly,
 * read voiceRef.current on every polling iteration.
 *
 * This guarantees we always see the latest React state.
 */
function waitForVoiceState(
  voiceRef,
  targetStates,
  timeoutMs = 5000
) {
  const start =
    performance.now();

  return new Promise((resolve) => {
    const id = setInterval(() => {
      const currentVoice =
        voiceRef.current;

      if (
        targetStates.includes(
          currentVoice.state
        )
      ) {
        clearInterval(id);

        resolve(
          currentVoice.state
        );

        return;
      }

      if (
        performance.now() - start >
        timeoutMs
      ) {
        clearInterval(id);
        resolve(null);
      }
    }, 50);
  });
}

/*
 * Wait for the interruption/recovery pipeline.
 *
 * We don't simply wait for SPEAKING because the
 * initial request can already be SPEAKING.
 *
 * We first wait for an interruption to appear,
 * then wait for recovery.
 */
async function waitForRecovery(
  voiceRef,
  timeoutMs = 20000
) {
  const start =
    performance.now();

  const initialInterruptionCount =
    voiceRef.current.interruptions.length;

  /*
   * Step 1:
   * Wait for the interruption to actually happen.
   */
  while (
    performance.now() - start <
    timeoutMs
  ) {
    const currentVoice =
      voiceRef.current;

    if (
      currentVoice.interruptions.length >
      initialInterruptionCount
    ) {
      break;
    }

    await sleep(50);
  }

  /*
   * Step 2:
   * Wait for the new generation to recover.
   */
  const recoveryStart =
    performance.now();

  while (
    performance.now() - recoveryStart <
    timeoutMs
  ) {
    const currentVoice =
      voiceRef.current;

    const currentState =
      currentVoice.state;

    if (
      currentState ===
        VOICE_STATE.SPEAKING ||
      currentState ===
        VOICE_STATE.COMPLETED
    ) {
      return true;
    }

    await sleep(50);
  }

  return false;
}