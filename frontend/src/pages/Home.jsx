import { Link } from 'react-router-dom';
import { ArrowRight, Zap, Mic, Radio, Shield, Sparkles } from 'lucide-react';
import { ArchitectureDiagram } from '../components/ArchitectureDiagram';

export default function Home() {
  return (
    <div className="mesh-bg">
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 lg:px-6 pt-14 pb-20">
        <div className="max-w-3xl">
          <span className="badge badge-info mb-5">
            <Sparkles className="w-3 h-3" />
            DataForge × Rime Hackathon
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-balance">
            <span className="gradient-text">Interrupt the AI.</span>
            <br />
            <span className="text-white">And it actually stops.</span>
          </h1>
          <p className="mt-6 text-lg text-slate-300 text-balance max-w-2xl">
            VoiceFlow is a voice-native assistant that solves the hardest problem in
            real-time voice AI:{' '}
            <span className="text-white font-medium">interruption and recovery</span>.
            Change your mind mid-sentence and the system stops instantly, fences stale
            work, and speaks only the answer you actually asked for.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app" className="btn-primary text-base !px-5 !py-2.5">
              <Mic className="w-4 h-4" />
              Try the voice agent
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/stress-test" className="btn-secondary text-base !px-5 !py-2.5">
              <Zap className="w-4 h-4" />
              Run the stress test
            </Link>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-6xl mx-auto px-4 lg:px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={Zap}
            title="Sub-200ms audio stop"
            body="Interruptions stop Rime audio synchronously the moment the user starts speaking."
          />
          <Feature
            icon={Shield}
            title="Stale result fencing"
            body="Every request carries a generation ID. Late responses tagged with old generations are refused before they reach your ears."
          />
          <Feature
            icon={Radio}
            title="Rime as primary output"
            body="Every word the AI speaks is synthesized by Rime TTS. No hidden fallbacks in the judged flow."
          />
          <Feature
            icon={Mic}
            title="Natural turn-taking"
            body="Speak while the AI is speaking. VoiceFlow treats it as an interruption, not an error."
          />
          <Feature
            icon={Zap}
            title="Cancellable tools"
            body="AbortControllers cancel in-flight tool calls the instant they become obsolete."
          />
          <Feature
            icon={Shield}
            title="Auditable state"
            body="Every interruption, cancellation, and stale block is recorded in Supabase for evaluation."
          />
        </div>
      </section>

      {/* Problem statement */}
      <section className="max-w-6xl mx-auto px-4 lg:px-6 pb-16">
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div>
            <h2 className="text-2xl font-bold text-white mb-3">The hard voice problem</h2>
            <p className="text-slate-300">
              Turn-taking voice systems assume the user waits politely. Real users
              don't. They correct, refine, and change their mind mid-response —
              often before a slow tool call has even returned.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-400">
              <li>❌ Wait 10 seconds for the wrong answer, then repeat yourself</li>
              <li>❌ Late tool result speaks over your correction</li>
              <li>❌ UI shows an assistant reply the user never actually heard</li>
              <li className="text-emerald-300">✓ VoiceFlow makes all three impossible.</li>
            </ul>
          </div>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Core technical claim</p>
            <p className="text-slate-200 leading-relaxed">
              An interruptible voice agent can remain conversationally consistent by{' '}
              <span className="text-brand-300 font-medium">stopping obsolete audio</span>{' '}
              and{' '}
              <span className="text-brand-300 font-medium">fencing stale asynchronous results</span>{' '}
              whenever the user changes their request during AI speech or tool
              execution.
            </p>
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="max-w-6xl mx-auto px-4 lg:px-6 pb-20">
        <h2 className="text-2xl font-bold text-white mb-4">How it works</h2>
        <div className="card !p-4">
          <ArchitectureDiagram />
        </div>
      </section>
    </div>
  );
}

function Feature({ icon: Icon, title, body }) {
  return (
    <div className="card hover:border-brand-500/30 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-brand-500/15 text-brand-300 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-400">{body}</p>
    </div>
  );
}