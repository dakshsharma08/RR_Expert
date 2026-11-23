import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** One error boundary per route: a crash in one screen never takes down the app. */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[LOCKSTEP] screen error', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border border-danger/40 text-danger">
          <AlertTriangle className="size-5" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl">This screen hit a snag</h1>
        <p className="text-sm text-muted">
          Your data is safe on this device. Reload the screen to try again.
        </p>
        <p className="max-w-full truncate font-mono text-xs text-muted/80">{this.state.error.message}</p>
        <div className="flex gap-2">
          <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          <Button variant="ghost" onClick={() => (window.location.href = '/app')}>
            Go home
          </Button>
        </div>
      </div>
    );
  }
}
