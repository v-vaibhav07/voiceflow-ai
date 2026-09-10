import { Link } from 'react-router-dom';
import { ArchitectureDiagram } from '../components/ArchitectureDiagram';
import { RimeConfigCard } from '../components/RimeConfigCard';
import { useEffect, useState } from 'react';
import { fetchVoiceConfig } from '../api/api';
import { Radio, Shield, Layers, GitBranch } from 'lucide-react';

export default function About() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetchVoiceConfig().then((c) => setConfig(c?.rime || null)).catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">About VoiceFlow</h1>
        <p className="text-slate-400">
          Built for the DataForge × Rime Hackathon — Rime AI Track.
        </p>
      </div>

      <section className="card">
        <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-400" />
          The core technical claim
        </h2>
        <p className="text-slate-300 leading-relaxed">
          An interruptible voice agent can remain conversationally consistent by{' '}
          <span className="text-brand-300 font-medium">stopping obsolete audio</span>{' '}
          and <span className="text-brand-300 font-medium">fencing stale asynchronous results</span>{' '}
          whenever the user changes their request during AI speech or tool execution.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
          <Layers className="w-5 h-5 text-brand-400" />
          Architecture
        </h2>
        <div className="card !p-4">
          <ArchitectureDiagram />
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
            <Radio className="w-4 h-4 text-brand-400" />
            Rime's role
          </h3>
          <p className="text-sm text-slate-300">
            Rime TTS is the primary spoken output. Every AI response in the judged
            flow is synthesized by Rime. A browser <code>SpeechSynthesis</code>{' '}
            fallback exists only for resilience and is clearly labeled in the UI when active.
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-brand-400" />
            Generation fencing
          </h3>
          <p className="text-sm text-slate-300">
            Every request cycle gets an incrementing generation ID. On interruption
            the generation is bumped, all AbortControllers for the old generation
            are aborted, and any late response tagged with an older generation is
            discarded before it can reach Rime or the audio player.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-white mb-3">Rime configuration in use</h2>
        <RimeConfigCard rime={config} />
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold text-white mb-3">Try it</h2>
        <div className="flex flex-wrap gap-2">
          <Link to="/app" className="btn-primary">Open Voice App</Link>
          <Link to="/stress-test" className="btn-secondary">Run the Stress Test</Link>
          <Link to="/evaluation" className="btn-secondary">See Evaluation Metrics</Link>
        </div>
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold text-white mb-3">Honesty notes</h2>
        <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
          <li>Flight search is simulated. Delays are injected server-side for reproducible stress testing.</li>
          <li>Latency numbers are measured live at test time — metrics without measurements are labeled "NOT YET MEASURED".</li>
          <li>Browser SpeechRecognition accuracy depends on your browser and mic.</li>
          <li>No API secrets are ever exposed to the browser.</li>
        </ul>
      </section>
    </div>
  );
}