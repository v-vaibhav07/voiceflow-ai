import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { LoadingState } from './components/LoadingState';

const Home = lazy(() => import('./pages/Home'));
const Demo = lazy(() => import('./pages/Demo'));
const Conversation = lazy(() => import('./pages/Conversation'));
const Evaluation = lazy(() => import('./pages/Evaluation'));
const StressTest = lazy(() => import('./pages/StressTest'));
const About = lazy(() => import('./pages/About'));

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AppShell>
            <Suspense fallback={<LoadingState label="Loading…" className="min-h-[60vh]" />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/app" element={<Demo />} />
                <Route path="/conversation/:id" element={<Conversation />} />
                <Route path="/evaluation" element={<Evaluation />} />
                <Route path="/stress-test" element={<StressTest />} />
                <Route path="/about" element={<About />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </Suspense>
          </AppShell>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}