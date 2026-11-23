/**
 * ONE shared 1-second clock for the whole app.
 * Every countdown subscribes to the same ticker (no per-component setInterval),
 * ticks are aligned to the start of each second, and ticking pauses while the tab
 * is hidden (saves battery) and resyncs instantly when it becomes visible again.
 */
import { useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
let now = Date.now();
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  if (timer || listeners.size === 0) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const delay = 1000 - (Date.now() % 1000) + 5;
  timer = setTimeout(() => {
    timer = null;
    now = Date.now();
    listeners.forEach((l) => l());
    schedule();
  }, delay);
}

function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
    else {
      now = Date.now();
      listeners.forEach((l) => l());
      schedule();
    }
  });
}

function subscribe(l: Listener) {
  listeners.add(l);
  now = Date.now();
  schedule();
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) stop();
  };
}

/** Current time in ms, re-rendering once per second. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  );
}

/** Minute-granularity clock for things that don't need seconds (cheaper re-renders). */
export function useMinute(): number {
  const n = useNow();
  return Math.floor(n / 60000) * 60000;
}
