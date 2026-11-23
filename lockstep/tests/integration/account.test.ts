/** DELETE /api/account verifies the caller's own token, then deletes that user only. */
import { describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAccountRouter } from '../../server/account';
import { errorHandler } from '../../server/app';

async function serve(supabase: { url: string; serviceKey: string } | null, fake: typeof fetch) {
  const app = express();
  app.use('/api', createAccountRouter({ supabase }, fake));
  app.use(errorHandler);
  const s = app.listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  return { base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, close: () => s.close() };
}

const UID = '11111111-2222-3333-4444-555555555555';

describe('DELETE /api/account', () => {
  it('is unavailable without Supabase on the server', async () => {
    const { base, close } = await serve(null, fetch);
    const r = await fetch(`${base}/api/account`, { method: 'DELETE' });
    expect(r.status).toBe(503);
    close();
  });

  it('deletes exactly the user who owns the token', async () => {
    const calls: { url: string; method: string; auth: string | null }[] = [];
    const fake = (async (url: string, init: RequestInit = {}) => {
      const h = new Headers(init.headers);
      calls.push({ url, method: init.method ?? 'GET', auth: h.get('authorization') });
      if (url.endsWith('/auth/v1/user'))
        return h.get('authorization') === 'Bearer user-token'
          ? Response.json({ id: UID })
          : new Response('no', { status: 401 });
      return Response.json({});
    }) as typeof fetch;
    const { base, close } = await serve(
      { url: 'https://proj.supabase.test', serviceKey: 'service-key' },
      fake,
    );

    const bad = await fetch(`${base}/api/account`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer stolen' },
    });
    expect(bad.status).toBe(400);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    const ok = await fetch(`${base}/api/account`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer user-token' },
    });
    expect(ok.status).toBe(200);
    const del = calls.find((c) => c.method === 'DELETE')!;
    expect(del.url).toBe(`https://proj.supabase.test/auth/v1/admin/users/${UID}`);
    expect(del.auth).toBe('Bearer service-key');
    close();
  });
});
