import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { MotionConfig } from 'framer-motion';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyMode, useUi } from '@/stores/ui';
import { router } from './router';
import { PwaUpdater } from './PwaUpdater';
import { ReminderScheduler } from '@/features/settings/reminders';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } },
});

export function App() {
  const mode = useUi((s) => s.mode);
  useEffect(() => {
    applyMode(mode);
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => applyMode('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mode]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" makes every Framer Motion animation respect the OS setting */}
      <MotionConfig reducedMotion="user" transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position="top-center" closeButton toastOptions={{ duration: 4500 }} />
          <PwaUpdater />
          <ReminderScheduler />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
