import { NavLink, Link } from 'react-router-dom';
import { Mic, Home, Activity, Zap, Info, MessageSquare } from 'lucide-react';
import { useState } from 'react';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/app', label: 'Voice App', icon: Mic },
  { to: '/stress-test', label: 'Stress Test', icon: Zap },
  { to: '/evaluation', label: 'Evaluation', icon: Activity },
  { to: '/about', label: 'About', icon: Info },
];

export function AppShell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 lg:px-6 h-14">
          <Link to="/" className="flex items-center gap-2 group" aria-label="VoiceFlow home">
            <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center shadow-lg">
              <MessageSquare className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <span className="font-semibold text-white group-hover:text-brand-300 transition-colors">
              VoiceFlow
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-4" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-brand-500/15 text-brand-200'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`
                }
              >
                <item.icon className="w-4 h-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <a
              href="https://rime.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline text-xs text-slate-500 hover:text-slate-300"
            >
              Powered by Rime TTS
            </a>
            <button
              className="md:hidden btn-ghost !p-2"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-2" aria-label="Mobile">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                    isActive ? 'bg-brand-500/15 text-brand-200' : 'text-slate-300'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1 min-h-0 flex flex-col">{children}</main>

      <footer className="border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 text-xs text-slate-500 flex flex-wrap gap-3 items-center justify-between">
          <span>VoiceFlow — Interruptible Voice AI</span>
          <span className="flex items-center gap-3">
            <Link to="/about" className="hover:text-slate-300">About</Link>
            <a href="https://github.com" className="hover:text-slate-300" target="_blank" rel="noreferrer">Source</a>
            <span>© {new Date().getFullYear()}</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

export default AppShell;