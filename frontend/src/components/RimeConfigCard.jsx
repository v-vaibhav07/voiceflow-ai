import { Radio, Info } from 'lucide-react';

export function RimeConfigCard({ rime, className = '' }) {
  if (!rime) {
    return (
      <div className={`card ${className}`}>
        <div className="flex items-center gap-2 mb-2 text-slate-400">
          <Info className="w-4 h-4" />
          <span className="text-sm">Rime configuration not loaded</span>
        </div>
      </div>
    );
  }

  const rows = [
    { label: 'Model', value: rime.model },
    { label: 'Voice', value: rime.voice },
    { label: 'Language', value: rime.language },
    { label: 'Audio format', value: rime.audioFormat },
    { label: 'Sample rate', value: rime.sampleRate ? `${rime.sampleRate} Hz` : null },
    { label: 'Transport', value: rime.transport },
    { label: 'Region', value: rime.region },
  ];

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg gradient-brand flex items-center justify-center">
          <Radio className="w-4 h-4 text-white" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Rime Configuration</h3>
          <p className="text-xs text-slate-400">Primary spoken output</p>
        </div>
        <span
          className={`ml-auto badge ${rime.configured ? 'badge-success' : 'badge-warning'}`}
        >
          {rime.configured ? 'Configured' : 'Not configured'}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map((row) =>
          row.value ? (
            <div key={row.label} className="contents">
              <dt className="text-slate-500 truncate">{row.label}</dt>
              <dd className="text-slate-200 font-mono text-xs truncate" title={row.value}>
                {row.value}
              </dd>
            </div>
          ) : null
        )}
      </dl>

      {rime.endpoint && (
        <p className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 break-all">
          Endpoint: <span className="font-mono">{rime.endpoint}</span>
        </p>
      )}

      <p className="mt-3 text-[11px] text-slate-500 italic">
        API credentials are server-side only. Never exposed to the browser.
      </p>
    </div>
  );
}

export default RimeConfigCard;