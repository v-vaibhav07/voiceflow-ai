import { Mic, Cpu, Wrench, Radio, Database, Speaker } from 'lucide-react';

/**
 * Pure-SVG architecture diagram (no external deps).
 * Shows the interruption-aware pipeline visually.
 */
export function ArchitectureDiagram({ className = '' }) {
  const Node = ({ x, y, w = 140, h = 56, icon: Icon, label, sub, tone = 'brand' }) => {
    const stroke = {
      brand: '#818cf8',
      emerald: '#34d399',
      amber: '#fbbf24',
      slate: '#475569',
    }[tone];
    const fill = {
      brand: 'rgba(99,102,241,0.12)',
      emerald: 'rgba(16,185,129,0.10)',
      amber: 'rgba(245,158,11,0.10)',
      slate: 'rgba(51,65,85,0.30)',
    }[tone];

    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx="10" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <foreignObject x={x + 10} y={y + 8} width={w - 20} height={h - 16}>
          <div className="flex items-center gap-2 h-full">
            <div className="w-7 h-7 rounded-md bg-slate-900/60 flex items-center justify-center shrink-0" style={{ color: stroke }}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100 truncate">{label}</p>
              {sub && <p className="text-[10px] text-slate-400 truncate">{sub}</p>}
            </div>
          </div>
        </foreignObject>
      </g>
    );
  };

  const Arrow = ({ x1, y1, x2, y2, dashed = false, color = '#475569' }) => (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth="1.5"
      strokeDasharray={dashed ? '4,4' : undefined}
      markerEnd="url(#arrow)"
    />
  );

  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <svg viewBox="0 0 720 380" className="w-full min-w-[680px]" role="img" aria-label="Architecture diagram">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 Z" fill="#475569" />
          </marker>
        </defs>

        {/* Row 1: user + mic */}
        <Node x={20}  y={30}  icon={Mic}     label="Browser Mic" sub="SpeechRecognition" tone="emerald" />
        <Arrow x1={160} y1={58} x2={220} y2={58} />

        {/* Row 2: orchestration */}
        <Node x={220} y={30}  icon={Cpu}     label="Orchestration" sub="Generation ID + Fencing" tone="brand" />
        <Arrow x1={360} y1={58} x2={420} y2={58} />

        <Node x={420} y={30}  icon={Cpu}     label="LLM" sub="OpenAI" tone="brand" />

        {/* Row 3: tools + rime */}
        <Arrow x1={290} y1={86} x2={290} y2={140} />
        <Node x={220} y={140} icon={Wrench}  label="Tool Service" sub="Abortable + delay" tone="amber" />

        <Arrow x1={490} y1={86} x2={490} y2={140} />
        <Node x={420} y={140} icon={Radio}   label="Rime TTS" sub="Primary spoken output" tone="brand" />

        {/* Row 4: audio out */}
        <Arrow x1={490} y1={196} x2={490} y2={250} />
        <Node x={420} y={250} icon={Speaker} label="Audio Player" sub="Immediate stop" tone="emerald" />

        {/* Row 5: DB */}
        <Arrow x1={290} y1={196} x2={290} y2={250} dashed />
        <Node x={220} y={250} icon={Database} label="Supabase" sub="Events + interruptions" tone="slate" />

        {/* Interruption feedback loop */}
        <path
          d="M 490 306 C 490 340, 90 340, 90 86"
          stroke="#f87171"
          strokeWidth="1.5"
          strokeDasharray="5,4"
          fill="none"
          markerEnd="url(#arrow)"
        />
        <text x="270" y="332" fill="#fca5a5" fontSize="11" fontFamily="ui-monospace, monospace">
          interruption → bump generation → cancel controllers → stop audio
        </text>
      </svg>
    </div>
  );
}

export default ArchitectureDiagram;