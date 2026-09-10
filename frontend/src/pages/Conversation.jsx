import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Zap, Wrench } from 'lucide-react';
import { fetchConversation } from '../api/api';
import { MessageBubble } from '../components/MessageBubble';
import { ToolExecutionCard } from '../components/ToolExecutionCard';
import { Timeline } from '../components/Timeline';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { formatDateTime, formatLatency } from '../utils/formatters';

export default function Conversation() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchConversation(id)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <LoadingState label="Loading conversation…" />;

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <EmptyState
          icon={MessageSquare}
          title="Could not load conversation"
          description={error}
          action={<Link to="/app" className="btn-secondary">Back to voice app</Link>}
        />
      </div>
    );
  }

  if (!data?.conversation) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <EmptyState icon={MessageSquare} title="Conversation not found" />
      </div>
    );
  }

  const { conversation, messages, interruptions, toolCalls, voiceEvents } = data;

  const timelineItems = [
    ...(voiceEvents || []).map((e) => ({
      id: `ve-${e.id}`,
      title: e.event_type.replace(/_/g, ' '),
      timestamp: e.timestamp,
      description: e.audio_duration_ms ? `Audio ${formatLatency(e.audio_duration_ms)}` : undefined,
      tone: e.event_type.includes('interruption') ? 'danger' : e.event_type.includes('audio') ? 'success' : 'brand',
    })),
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/app" className="btn-ghost !p-2" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">{conversation.title || 'Conversation'}</h1>
          <p className="text-xs text-slate-500">Started {formatDateTime(conversation.created_at)}</p>
        </div>
        <span
          className={`badge ml-auto ${
            conversation.status === 'completed' ? 'badge-success' : 'badge-neutral'
          }`}
        >
          {conversation.status}
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm uppercase tracking-wide text-slate-500">Messages</h2>
          {messages.length === 0 ? (
            <EmptyState title="No messages" />
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={{
                    id: m.id,
                    role: m.role,
                    text: m.content,
                    interrupted: m.interrupted,
                    status: m.status,
                    generation: m.generation,
                    audioDurationMs: m.audio_duration_ms,
                    provider: m.tts_provider,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section>
            <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" /> Interruptions ({interruptions?.length || 0})
            </h2>
            {interruptions?.length ? (
              <div className="space-y-2">
                {interruptions.map((it) => (
                  <div key={it.id} className="card !p-3 text-xs space-y-1">
                    <p className="text-slate-300">
                      <span className="text-slate-500">Reason:</span> {it.reason}
                    </p>
                    <p className="text-slate-400">→ Detection: {formatLatency(it.detection_latency_ms)}</p>
                    <p className="text-slate-400">→ Audio stop: {formatLatency(it.audio_stop_latency_ms)}</p>
                    <p className="text-slate-400">→ Recovery: {formatLatency(it.recovery_latency_ms)}</p>
                    <p className="text-slate-500">Stale blocked: {it.stale_results_blocked ?? 0}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">None</p>
            )}
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5" /> Tool calls ({toolCalls?.length || 0})
            </h2>
            <div className="space-y-2">
              {toolCalls?.map((t) => (
                <ToolExecutionCard
                  key={t.id}
                  toolCall={{
                    toolName: t.tool_name,
                    args: t.request_payload,
                    result: t.response_payload,
                    status: t.status,
                    generation: t.generation,
                    artificial_delay_ms: t.artificial_delay_ms,
                    startedAt: t.started_at ? new Date(t.started_at).getTime() : null,
                    completedAt: t.completed_at ? new Date(t.completed_at).getTime() : null,
                  }}
                />
              ))}
              {!toolCalls?.length && <p className="text-xs text-slate-500 italic">None</p>}
            </div>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2">Voice event timeline</h2>
            <div className="card !p-4 max-h-[400px] overflow-y-auto">
              <Timeline items={timelineItems.slice(0, 60)} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}