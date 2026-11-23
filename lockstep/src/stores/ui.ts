/**
 * Small UI preferences (theme mode, sidebar). Zustand + localStorage persistence.
 * Big data lives in IndexedDB (Dexie); this is only for tiny view state.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Mode = 'dark' | 'light' | 'system';

interface UiState {
  mode: Mode;
  sidebarCollapsed: boolean;
  paletteOpen: boolean;
  remindersEnabled: boolean;
  reminderTime: string; // HH:mm local
  defaultTimezone: string | null;
  setDefaultTimezone: (tz: string | null) => void;
  setMode: (m: Mode) => void;
  toggleSidebar: () => void;
  setPaletteOpen: (o: boolean) => void;
  setReminders: (on: boolean, time?: string) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      mode: 'dark',
      sidebarCollapsed: false,
      paletteOpen: false,
      remindersEnabled: false,
      reminderTime: '19:00',
      defaultTimezone: null,
      setDefaultTimezone: (defaultTimezone) => set({ defaultTimezone }),
      setMode: (mode) => set({ mode }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setReminders: (remindersEnabled, reminderTime) =>
        set((s) => ({ remindersEnabled, reminderTime: reminderTime ?? s.reminderTime })),
    }),
    {
      name: 'lockstep-ui',
      partialize: (s) => ({
        mode: s.mode,
        sidebarCollapsed: s.sidebarCollapsed,
        remindersEnabled: s.remindersEnabled,
        reminderTime: s.reminderTime,
        defaultTimezone: s.defaultTimezone,
      }),
    },
  ),
);

/** Apply light/dark to <html data-mode>. "system" follows the OS setting live. */
export function applyMode(mode: Mode) {
  const root = document.documentElement;
  const resolve = () =>
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : mode;
  root.dataset.mode = resolve();
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', root.dataset.mode === 'light' ? '#F5F0E4' : '#090909');
}
