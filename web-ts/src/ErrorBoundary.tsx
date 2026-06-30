import React from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Human label for the wrapped view, shown in the fallback. */
  label?: string;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time errors in a subtree so one crashing view (e.g. the graph
 * renderer choking on malformed data) shows a recoverable fallback instead of
 * blanking the entire app.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('UI crash caught by ErrorBoundary:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center bg-[#252523] animate-fade-in">
          <p className="text-[15px] font-geist font-semibold text-[#F4F0EB]">
            Couldn’t render {this.props.label || 'this view'}.
          </p>
          <p className="text-[12px] font-geist text-[#8C8880] max-w-[460px] break-words">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button onClick={this.reset} className="btn-bump btn-bump-accent px-4 py-2 text-[13px] mt-1">
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
