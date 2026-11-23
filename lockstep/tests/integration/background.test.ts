/** AI backgrounds: offered only when an image-capable model is listed; hidden again if it fails. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';
import { buildBackgroundPrompt, pickImageModel } from '../../server/gemini/background';

const LIST = /^https:\/\/generativelanguage\.googleapis\.com\/v1[a-z0-9]*\/models(\?.*)?$/;
const GEN = /^https:\/\/generativelanguage\.googleapis\.com\/v1[a-z0-9]*\/models\/([^/:]+):generateContent/;
const imageListed = true;
let imageWorks = true;
const sent: { model: string; body: { generationConfig?: { responseModalities?: string[] } } }[] = [];

const mock = setupServer(
  http.get(LIST, () =>
    HttpResponse.json({
      models: [
        { name: 'models/gemini-3-flash', supportedActions: ['generateContent'] },
        ...(imageListed
          ? [
              { name: 'models/gemini-3-flash-image', supportedActions: ['generateContent'] },
              { name: 'models/gemini-3-pro-image-preview', supportedActions: ['generateContent'] },
            ]
          : []),
      ],
    }),
  ),
  http.post(GEN, async ({ request }) => {
    const model = GEN.exec(request.url)![1]!;
    sent.push({ model, body: (await request.json()) as never });
    if (!imageWorks)
      return HttpResponse.json(
        { error: { code: 400, message: 'Model does not support image output', status: 'INVALID_ARGUMENT' } },
        { status: 400 },
      );
    return HttpResponse.json({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } }],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { totalTokenCount: 1290 },
    });
  }),
);

let server: Server;
let base = '';
beforeAll(async () => {
  mock.listen({
    onUnhandledFrame({ frame, defaults }) {
      const r = (frame.data as { request?: Request }).request;
      if (r && new URL(r.url).hostname === '127.0.0.1') return;
      defaults.error();
    },
  });
  server = createApp({
    env: { GEMINI_API_KEY: 'test-key', ALLOWED_ORIGINS: '' },
    tuning: { retryBaseMs: 1, retryMaxMs: 2 },
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  mock.close();
});

const post = (body: unknown) =>
  fetch(`${base}/api/background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('AI backgrounds', () => {
  it('picks the newest stable image model (flash over pro)', () => {
    expect(
      pickImageModel([
        'models/gemini-2.5-flash-image',
        'models/gemini-3-pro-image-preview',
        'models/gemini-3-flash-image',
        'models/gemini-3-pro-image',
      ]),
    ).toBe('gemini-3-flash-image');
    expect(pickImageModel(['models/gemini-3-flash'])).toBeNull();
  });

  it('asks for an abstract, text-free, people-free image', () => {
    const p = buildBackgroundPrompt({ theme: 'champagne-gold', mood: 'calm' });
    expect(p).toMatch(/no text/i);
    expect(p).toMatch(/people, faces/);
  });

  it('health reports the image model and the route returns an image', async () => {
    const h = await (await fetch(`${base}/api/health`)).json();
    expect(h.ai.imageModel).toBe('gemini-3-flash-image');
    const r = await post({ theme: 'midnight-sapphire', mood: 'focused' });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.image).toMatch(/^data:image\/png;base64,/);
    expect(j.run).toMatchObject({ kind: 'background', model: 'gemini-3-flash-image', ok: true });
    expect(sent.at(-1)!.body.generationConfig?.responseModalities).toEqual(['IMAGE']);
  });

  it('validates input', async () => {
    expect((await post({ theme: 'neon' })).status).toBe(400);
  });

  it('hides the feature after the model fails with this key', async () => {
    imageWorks = false;
    const r = await post({ theme: 'ivory', mood: 'calm' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    const h = await (await fetch(`${base}/api/health`)).json();
    expect(h.ai.imageModel).toBeNull();
    const again = await post({ theme: 'ivory', mood: 'calm' });
    expect(again.status).toBe(503);
  });
});
