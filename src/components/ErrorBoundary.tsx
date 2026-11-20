import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordError } from '../lib/errorBuffer';
import { cacheBustReload, isChunkLoadError, isReloadPending, tryAutoReload } from '../lib/chunkReload';
import { Loading } from './ui';
import { ReportProblemButton } from './ReportProblem';

/** Global error fallback (0027): a friendly screen with Reload and "Report a problem" instead of a blank page. */
/**
 * Stale app files after a deploy (a lazy screen's chunk 404s) trigger one automatic cache-busting
 * reload instead (src/lib/chunkReload.ts); if that already happened in the last minute, we show this screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; reloading: boolean }> {
  state = { error: null as Error | null, reloading: false };
  static getDerivedStateFromError(error: Error) {
    // Tentative: componentDidCatch decides whether the automatic reload is actually allowed.
    return { error, reloading: isReloadPending() || isChunkLoadError(error) };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isReloadPending()) return;
    if (isChunkLoadError(error)) {
      console.warn('[YACquest] app files changed since this page loaded; reloading', error);
      if (tryAutoReload()) return;
      this.setState({ reloading: false });
    }
    recordError(error);
    console.error('[YACquest] screen crashed', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.state.reloading) return <div className="app-shell" role="main" style={{ paddingTop: 32 }}><Loading lines={3} /></div>;
    return (
      <div className="app-shell" role="main" style={{ paddingTop: 32 }}>
        <section className="panel stack" role="alert">
          <h1 style={{ margin: 0 }}>Oops, a glitch!</h1>
          <p style={{ margin: 0 }}>Something on this screen broke. Your points and progress are safe.</p>
          <button type="button" className="btn blue block" onClick={cacheBustReload}>Reload the app</button>
          <button type="button" className="btn ghost block" onClick={() => { window.location.hash = '#/'; this.setState({ error: null, reloading: false }); }}>Go to Home</button>
          <ReportProblemButton />
        </section>
      </div>
    );
  }
}
