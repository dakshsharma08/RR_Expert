import { Link, useRouteError } from 'react-router';
import { AlertTriangle, Compass } from 'lucide-react';
import { Skeleton, EmptyState } from '@/components/ui/misc';

export function RouteFallback() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <EmptyState
        icon={<Compass className="size-5" strokeWidth={1.5} />}
        title="This page doesn't exist. Your goals are safe."
        action={
          <Link
            to="/app"
            className="inline-flex h-11 items-center rounded-[14px] bg-gold px-5 text-sm font-semibold text-obsidian"
          >
            Go home
          </Link>
        }
      />
    </div>
  );
}

/** Router-level error screen (also catches failed lazy chunk loads, e.g. after a deploy). */
export function RouteError() {
  const err = useRouteError() as Error | undefined;
  const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
    err?.message ?? '',
  );
  return (
    <div
      role="alert"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-text"
    >
      <div className="flex size-12 items-center justify-center rounded-full border border-danger/40 text-danger">
        <AlertTriangle className="size-5" strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl">{chunk ? 'A new version is available' : 'This screen hit a snag'}</h1>
      <p className="text-sm text-muted">
        {chunk
          ? 'Reload to get the latest LOCKSTEP. Your data is safe on this device.'
          : 'Your data is safe on this device. Reload to try again.'}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => window.location.reload()}
          className="h-11 rounded-[14px] bg-gold px-5 text-sm font-semibold text-obsidian"
        >
          Reload
        </button>
        <Link
          to="/app"
          className="inline-flex h-11 items-center rounded-[14px] px-5 text-sm text-text hover:bg-surface-2"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
