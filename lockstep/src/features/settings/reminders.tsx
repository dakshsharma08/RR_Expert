/**
 * In-app + local notification reminders. While the app is open, once a day at the
 * chosen time we remind you of today's focus. (iOS only allows web notifications
 * for apps installed to the Home Screen; Web Push for closed apps is a later tier.)
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useUi } from '@/stores/ui';
import { db } from '@/db/db';
import { getKv, setKv } from '@/db/repo';

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied')
    return Notification.permission;
  return Notification.requestPermission();
}

export function ReminderScheduler() {
  const { remindersEnabled, reminderTime } = useUi();
  useEffect(() => {
    if (!remindersEnabled) return;
    const check = async () => {
      const now = new Date();
      // Local calendar date (not UTC), matching the local reminder time.
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const [h, m] = reminderTime.split(':').map(Number);
      const due = now.getHours() > (h ?? 19) || (now.getHours() === h && now.getMinutes() >= (m ?? 0));
      if (!due) return;
      if ((await getKv<string>('lastReminder')) === today) return;
      await setKv('lastReminder', today);
      const active = await db.goals.where('status').equals('active').toArray();
      if (!active.length) return;
      const body =
        active.length === 1
          ? `Today's focus for "${active[0]!.title}" is waiting.`
          : `${active.length} countdowns are running. Check today's focus.`;
      toast('LOCKSTEP reminder', { description: body });
      if (notificationsSupported() && Notification.permission === 'granted') {
        try {
          new Notification('LOCKSTEP', { body, icon: '/pwa-192.png', tag: 'lockstep-daily' });
        } catch {
          /* some mobile browsers only allow notifications from a service worker */
        }
      }
    };
    void check();
    const id = setInterval(() => void check(), 60_000);
    return () => clearInterval(id);
  }, [remindersEnabled, reminderTime]);
  return null;
}
