/**
 * DELETE /api/account: permanently deletes a signed-in user's cloud account.
 *
 * Only the server holds the Supabase service-role key, so only the server can
 * delete an auth user. We first verify the caller's own access token with Supabase
 * (so nobody can delete someone else). Then we delete the auth user. Every row
 * cascades away (goals.user_id → auth.users ON DELETE CASCADE; children → goals).
 */
import { Router } from 'express';
import { AppError } from './lib/errors';

export function createAccountRouter(
  cfg: { supabase: { url: string; serviceKey: string } | null },
  fetchImpl: typeof fetch = fetch,
): Router {
  const r = Router();
  r.delete('/account', async (req, res, next) => {
    try {
      if (!cfg.supabase)
        throw new AppError(
          'AI_NOT_CONFIGURED',
          "Cloud accounts aren't enabled on this server. Your on-device data can be deleted in Settings.",
        );
      const token = /^Bearer\s+(.+)$/i.exec(req.header('authorization') ?? '')?.[1];
      if (!token) throw new AppError('INVALID_INPUT', 'Sign in again to delete your account.');
      const { url, serviceKey } = cfg.supabase;
      const who = await fetchImpl(`${url}/auth/v1/user`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
      });
      if (!who.ok)
        throw new AppError('INVALID_INPUT', 'Your session expired. Sign in again to delete your account.');
      const user = (await who.json()) as { id?: string };
      if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id))
        throw new AppError('INVALID_INPUT', 'Your session expired. Sign in again to delete your account.');
      const del = await fetchImpl(`${url}/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!del.ok)
        throw new AppError('INTERNAL', 'Could not delete the account right now. Please try again.');
      res.json({ ok: true, deleted: true });
    } catch (e) {
      next(e);
    }
  });
  return r;
}
