import { Link } from 'react-router';
import { Compass } from 'lucide-react';
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
          <Link to="/app" className="inline-flex h-11 items-center rounded-[14px] bg-gold px-5 text-sm font-semibold text-obsidian">
            Go home
          </Link>
        }
      />
    </div>
  );
}
