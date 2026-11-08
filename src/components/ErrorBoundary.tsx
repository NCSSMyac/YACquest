import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordError } from '../lib/errorBuffer';
import { ReportProblemButton } from './ReportProblem';

/** Global error fallback (0027): a friendly screen with Reload and "Report a problem" instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    recordError(error);
    console.error('[YACquest] screen crashed', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell" role="main" style={{ paddingTop: 32 }}>
        <section className="panel stack" role="alert">
          <h1 style={{ margin: 0 }}>Oops, a glitch!</h1>
          <p style={{ margin: 0 }}>Something on this screen broke. Your points and progress are safe.</p>
          <button type="button" className="btn blue block" onClick={() => window.location.reload()}>Reload the app</button>
          <button type="button" className="btn ghost block" onClick={() => { window.location.hash = '#/'; this.setState({ error: null }); }}>Go to Home</button>
          <ReportProblemButton />
        </section>
      </div>
    );
  }
}
