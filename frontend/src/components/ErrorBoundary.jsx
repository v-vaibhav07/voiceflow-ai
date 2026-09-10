import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full card border-red-500/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
                <p className="text-sm text-slate-400">The application encountered an unexpected error.</p>
              </div>
            </div>

            {this.state.error?.message && (
              <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 mb-4">
                <code className="text-xs text-slate-400 break-all">
                  {this.state.error.message}
                </code>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={this.handleReset} className="btn-secondary flex-1">
                Try again
              </button>
              <button onClick={this.handleReload} className="btn-primary flex-1">
                <RefreshCw className="w-4 h-4" />
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;