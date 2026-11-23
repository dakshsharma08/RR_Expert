/**
 * TEST-ONLY API server for Playwright E2E runs.
 *
 * It starts the real LOCKSTEP Express app, but MSW intercepts the HTTPS calls the
 * Gemini SDK makes and answers with deterministic fixtures. This file is never used by
 * `npm run dev`, `npm start` or the deployed app. The fake model is named
 * "gemini-e2e-mock" so evidence screenshots can't be mistaken for real Gemini output.
 */
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

process.env.GEMINI_API_KEY = 'e2e-fake-key-not-real';
process.env.GEMINI_MODEL = 'gemini-e2e-mock';
process.env.ALLOWED_ORIGINS = 'http://localhost:4173,http://localhost:5173';

const STREAM =
  /^https:\/\/generativelanguage\.googleapis\.com\/v1[a-z0-9]*\/models\/[^/:]+:streamGenerateContent/;
const GENERATE =
  /^https:\/\/generativelanguage\.googleapis\.com\/v1[a-z0-9]*\/models\/[^/:]+:generateContent/;

type Body = {
  systemInstruction?: { parts: { text: string }[] };
  generationConfig?: {
    responseJsonSchema?: {
      properties?: Record<string, { items?: { properties?: Record<string, { enum?: string[] }> } }>;
    };
  };
};

function allowedDates(body: Body): string[] {
  const en =
    body.generationConfig?.responseJsonSchema?.properties?.milestones?.items?.properties?.targetDate?.enum;
  if (en?.length) return en;
  const sys = body.systemInstruction?.parts.map((p) => p.text).join('\n') ?? '';
  return [...new Set(sys.match(/\d{4}-\d{2}-\d{2}/g) ?? [])].sort();
}

function capacity(body: Body): number {
  const sys = body.systemInstruction?.parts.map((p) => p.text).join('\n') ?? '';
  const m = /capacity[^0-9]{0,40}([0-9]+(?:\.[0-9]+)?)\s*h/i.exec(sys);
  return m ? Number(m[1]) : 40;
}

function fixturePlan(body: Body) {
  const dates = allowedDates(body).filter((d) => d > new Date().toISOString().slice(0, 10));
  const pick = (f: number) =>
    dates[Math.min(dates.length - 1, Math.max(0, Math.round(f * (dates.length - 1))))]!;
  const cap = capacity(body);
  const per = Math.max(1, Math.floor((cap * 0.7) / 4));
  const titles = [
    'Map the exam domains',
    'Core services deep-dive',
    'Practice question sprint',
    'Full mock exam + review',
  ];
  return {
    goal: 'E2E fixture goal',
    deadline: 'fixture',
    timezone: 'fixture',
    feasibility: 'Achievable',
    feasibilityReason: 'Fixture: fits within 70% of the available hours.',
    totalEstimatedHours: per * 4,
    milestones: titles.map((title, i) => ({
      id: `m${i + 1}`,
      title,
      description: `Fixture milestone ${i + 1} for the end-to-end test.`,
      targetDate: pick((i + 1) / 4),
      estimatedHours: per,
      difficulty: i === 3 ? 'Hard' : 'Medium',
      tasks: [
        { id: `m${i + 1}-t1`, title: `${title}: part A`, estimatedMinutes: 60 },
        { id: `m${i + 1}-t2`, title: `${title}: part B`, estimatedMinutes: 45 },
      ],
    })),
    risks: ['Fixture risk: busy weeks'],
    recoveryStrategy: 'Fixture: move the practice sprint one day later.',
    dailyRitual: 'Fixture: 25 focused minutes after dinner.',
  };
}

const enc = new TextEncoder();
function sse(text: string) {
  const parts = text.match(/.{1,180}/gs) ?? [text];
  const chunks = parts.map((t, i) =>
    enc.encode(
      `data: ${JSON.stringify({
        candidates: [
          {
            content: { role: 'model', parts: [{ text: t }] },
            index: 0,
            ...(i === parts.length - 1 ? { finishReason: 'STOP' } : {}),
          },
        ],
        ...(i === parts.length - 1 ? { usageMetadata: { totalTokenCount: 1234 } } : {}),
        modelVersion: 'gemini-e2e-mock',
      })}\r\n\r\n`,
    ),
  );
  let i = 0;
  return new HttpResponse(
    new ReadableStream({
      async pull(c) {
        await new Promise((r) => setTimeout(r, 60));
        const next = chunks[i++];
        if (next) c.enqueue(next);
        else c.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function json(obj: unknown) {
  return HttpResponse.json({
    candidates: [
      { content: { role: 'model', parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP', index: 0 },
    ],
    usageMetadata: { totalTokenCount: 120 },
    modelVersion: 'gemini-e2e-mock',
  });
}

const mock = setupServer(
  http.post(STREAM, async ({ request }) => sse(JSON.stringify(fixturePlan((await request.json()) as Body)))),
  http.post(GENERATE, async ({ request }) => {
    const body = (await request.json()) as Body & { tools?: unknown };
    const keys = Object.keys(body.generationConfig?.responseJsonSchema?.properties ?? {});
    if (keys.includes('line')) return json({ line: 'Fixture line: one focused session today.' });
    if (keys.includes('summary')) return json({ summary: 'Fixture summary: steady week.' });
    if (keys.includes('milestones')) return json(fixturePlan(body));
    return HttpResponse.json({
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Fixture coach reply: you are on track.' }] },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: { totalTokenCount: 80 },
    });
  }),
);
mock.listen(); // MSW v3: unmatched requests pass through to the network by default

const { createApp } = await import('../server/app');
const port = Number(process.env.PORT) || 8787;
createApp({ tuning: { rateLimit: { windowMax: 1000, dayMax: 10000 } } }).listen(port, () =>
  console.log(`E2E mock API (fixtures, NOT real Gemini) on :${port}`),
);
