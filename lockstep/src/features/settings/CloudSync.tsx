/**
 * Settings → Cloud sync. Optional: LOCKSTEP works fully as a guest.
 *
 * Three honest states:
 *   1. Not configured (no Supabase env vars) → explain, show NO inputs.
 *   2. Configured, signed out → email field + "Email me a sign-in link".
 *   3. Signed in → who you are, last sync time, "Sync now", "Sign out".
 */
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Cloud, CloudOff, LogOut, Mail, RefreshCw, UserX } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { db } from '@/db/db';
import { getKv } from '@/db/repo';
import { cloudConfigured, getSupabase } from '@/lib/sync/client';
import { SYNC_KEYS, signInWithEmail, signOut, syncNow, useSession, type SyncCounts } from '@/lib/sync/sync';

export function CloudSync() {
  if (!cloudConfigured) return <NotConfigured />;
  return <Configured />;
}

function NotConfigured() {
  return (
    <SyncSection icon={<CloudOff className="size-4" />}>
      <p className="text-sm text-muted">
        Cloud sync isn't set up on this copy of LOCKSTEP, so everything stays on this device. That's the
        normal way to use LOCKSTEP: nothing is missing, and no account is needed.
      </p>
      <p className="mt-2 text-xs text-muted">
        Developers can turn on optional sync across devices by setting{' '}
        <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
        <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> and running the database migration. See{' '}
        <code className="font-mono">docs/notes/sync.md</code>.
      </p>
    </SyncSection>
  );
}

function Configured() {
  const { session, ready } = useSession();
  useAuthLinkErrorToast();

  if (!ready) {
    return (
      <SyncSection icon={<Cloud className="size-4" />}>
        <p role="status" className="text-sm text-muted">
          Checking whether you're signed in…
        </p>
      </SyncSection>
    );
  }
  if (!session) return <SignedOut />;
  return <SignedIn userId={session.user.id} email={session.user.email ?? 'your account'} />;
}

function SignedOut() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const r = await signInWithEmail(email);
    setBusy(false);
    if (r.ok) {
      const address = email.trim();
      setSentTo(address);
      toast.success('Check your email', { description: `We sent a sign-in link to ${address}.` });
    } else {
      setError(r.message);
      toast.error("Couldn't send the link", { description: r.message });
    }
  }

  return (
    <SyncSection
      icon={<Cloud className="size-4" />}
      description="Optional. Sign in with your email to keep your goals in step across devices. LOCKSTEP keeps working without an account."
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-3">
        <Field label="Email" hint="No password. We email you a one-time sign-in link." error={error}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              required
            />
          )}
        </Field>
        <Button type="submit" loading={busy} icon={<Mail className="size-4" strokeWidth={1.5} aria-hidden />}>
          Email me a sign-in link
        </Button>
      </form>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
        {sentTo
          ? `Link sent to ${sentTo}. Open it in this browser to finish signing in. It can take a minute, so check spam too.`
          : ''}
      </p>
      <p className="mt-1 text-xs text-muted">
        The first time you sync, the goals already on this device are added to your account.
      </p>
    </SyncSection>
  );
}

function SignedIn({ userId, email }: { userId: string; email: string }) {
  const [syncing, setSyncing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lastSyncedAt = useLiveQuery(() => getKv<string>(SYNC_KEYS.lastSyncedAt), []);
  const linked = useLiveQuery(() => getKv<{ id: string; email: string | null }>(SYNC_KEYS.account), []);
  const goalCount = useLiveQuery(() => db.goals.count(), []);
  const linkedElsewhere = linked && linked.id !== userId;

  async function onSync() {
    setSyncing(true);
    const r = await syncNow();
    setSyncing(false);
    if (r.ok) {
      const summary = describeCounts(r.total);
      setStatus(summary);
      toast.success('Synced', { description: summary });
    } else {
      setStatus(r.message);
      toast.error("Sync didn't finish", { description: r.message });
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    const r = await signOut();
    setSigningOut(false);
    if (r.ok) toast.success('Signed out', { description: 'Your data stays on this device.' });
    else toast.error("Couldn't sign out", { description: r.message });
  }

  /** Deletes the cloud account (server verifies our token, then removes the user; rows cascade). */
  async function onDeleteAccount() {
    setDeleting(true);
    try {
      const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? 'Could not delete the account right now.');
      await signOut();
      toast.success('Cloud account deleted', {
        description:
          'Everything stored in the cloud is gone. Data on this device is untouched. Delete it below if you want.',
      });
    } catch (e) {
      toast.error("Couldn't delete the account", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SyncSection
      icon={<Cloud className="size-4" />}
      description="Keeps your goals, plans, progress and wallpaper designs in step across your devices."
    >
      <p className="text-sm">
        Signed in as <span className="font-semibold text-text">{email}</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        Last synced:{' '}
        <span className="text-text">
          {lastSyncedAt
            ? new Date(lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : goalCount
              ? `not yet. Tap Sync now to add the ${goalCount === 1 ? 'goal' : `${goalCount} goals`} on this device to your account.`
              : 'not yet.'}
        </span>
      </p>
      {linkedElsewhere && (
        <p className="mt-2 text-sm text-warning">
          This device's data is linked to {linked.email ?? 'another account'}. Sync is paused so two accounts
          never get mixed.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => void onSync()}
          loading={syncing}
          icon={<RefreshCw className="size-4" strokeWidth={1.5} aria-hidden />}
        >
          Sync now
        </Button>
        <Button
          variant="ghost"
          onClick={() => void onSignOut()}
          loading={signingOut}
          icon={<LogOut className="size-4" strokeWidth={1.5} aria-hidden />}
        >
          Sign out
        </Button>
        <Button
          variant="destructive"
          onClick={() => setConfirmDelete(true)}
          loading={deleting}
          icon={<UserX className="size-4" strokeWidth={1.5} aria-hidden />}
        >
          Delete account
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete your cloud account?"
        description="This permanently deletes your LOCKSTEP account and every goal, plan and design stored in the cloud. Data on this device stays until you delete it in Settings. This cannot be undone."
        confirmLabel="Delete account"
        onConfirm={() => void onDeleteAccount()}
      />
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
        {status}
      </p>
      <p className="mt-1 text-xs text-muted">
        Sync runs when you tap Sync now. If the same item was edited on two devices, the most recent edit
        wins. Living Wallpaper links, uploaded photos and thumbnails stay on the device that made them.
      </p>
    </SyncSection>
  );
}

/** "3 uploaded, 5 downloaded" — or a clear "nothing to do". */
function describeCounts(t: SyncCounts): string {
  const parts = [
    t.pushed ? `${t.pushed} uploaded` : null,
    t.pulled ? `${t.pulled} downloaded` : null,
    t.deleted ? `${t.deleted} removed` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')}.` : 'Everything was already up to date.';
}

/**
 * If a magic link was expired or already used, Supabase sends the user back with
 * "#error_description=…" in the address. Say so plainly, then tidy the address bar.
 */
function useAuthLinkErrorToast() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (!params.get('error_description') && !params.get('error')) return;
    toast.error("That sign-in link didn't work", {
      description: 'It may have expired or already been used. Request a new one below.',
    });
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
}

/** Same look as the other Settings sections. */
function SyncSection({
  icon,
  description,
  children,
}: {
  icon: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section id="sync" className="card p-5" aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-1 flex items-center gap-2 font-sans text-base font-semibold">
        <span className="text-accent-text" aria-hidden>
          {icon}
        </span>
        Cloud sync
      </h2>
      {description && <p className="mb-3 text-sm text-muted">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}
