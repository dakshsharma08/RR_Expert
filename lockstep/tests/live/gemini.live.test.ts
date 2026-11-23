/**
 * Live smoke test against the REAL Gemini API (no mocks).
 *
 *   GEMINI_API_KEY=... npm run test:live
 *
 * Without a key every test here is reported as SKIPPED (never PASSED), and we
 * print an explicit "SKIPPED: no GEMINI_API_KEY" line. We use
 * process.stdout.write because Vitest hides console.log for passing/skipped tests.
 */
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import type {
  ApiError,
  CoachResponse,
  HealthResponse,
  MotivationResponse,
  PlanResult,
} from '../../shared/api';
import { addDays, dayKey } from '../../shared/time';

const hasKey = !!process.env.GEMINI_API_KEY?.trim();

if (!hasKey) {
  process.stdout.write(
    '\nSKIPPED: no GEMINI_API_KEY — the live Gemini smoke test did not run (this is NOT a pass).\n\n',
  );
}

describe.skipIf(!hasKey)('live Gemini smoke test', () => {
  let server: Server;
  let base = '';
  const say = (line: string) => process.stdout.write(`LIVE: ${line}\n`);

  beforeAll(async () => {
    server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server?.closeAllConnections();
    server?.close();
  });

  it('health resolves a real model', async () => {
    const health = (await (await fetch(`${base}/api/health`)).json()) as HealthResponse;
    say(`health model=${health.ai.model} heavy=${health.ai.heavyModel}`);
    expect(health.ai.configured).toBe(true);
    expect(health.ai.model).toMatch(/gemini/);
  });

  it('streams a plan that passes every hard check', async () => {
    const today = dayKey(new Date(), 'UTC');
    const res = await fetch(`${base}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: 'Read and summarise a 300-page book on habit formation',
        deadlineDate: addDays(today, 14),
        deadlineTime: '18:00',
        timezone: 'UTC',
        level: 'Beginner',
        hoursPerDay: 1.5,
        workingDays: [1, 2, 3, 4, 5],
        constraints: 'Weekday evenings only.',
        pace: 'Steady',
      }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const events = text
      .split('\n\n')
      .map((block) => ({
        event: /^event: (.*)$/m.exec(block)?.[1],
        data: /^data: (.*)$/m.exec(block)?.[1],
      }))
      .filter((e) => e.event && e.data);
    const last = events.at(-1)!;
    if (last.event === 'error')
      throw new Error(`Plan failed: ${JSON.stringify(JSON.parse(last.data!) as ApiError)}`);
    expect(last.event).toBe('result');
    const result = JSON.parse(last.data!) as PlanResult;
    const milestoneEvents = events.filter((e) => e.event === 'milestone').length;
    say(
      `plan milestones=${result.plan.milestones.length} streamed=${milestoneEvents} repaired=${result.repaired} ` +
        `feasibility=${result.plan.feasibility}/${result.code.feasibility} runs=${JSON.stringify(result.runs)}`,
    );
    const hard = result.checks.filter((c) => c.id !== 'capacity');
    expect(hard.every((c) => c.ok)).toBe(true);
    expect(milestoneEvents).toBeGreaterThan(0);
  }, 180_000);

  it('writes a motivation line and answers a coach question with tools', async () => {
    const today = dayKey(new Date(), 'UTC');
    const mot = await fetch(`${base}/api/motivation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: 'Read and summarise a book',
        daysLeft: 14,
        percentDone: 20,
        nextMilestone: 'Finish chapters 1-4',
        streak: 3,
        pace: 'on-track',
        state: 'active',
        dateKey: today,
      }),
    });
    const line = (await mot.json()) as MotivationResponse;
    say(`motivation "${line.line}"`);
    expect(line.line.length).toBeGreaterThan(0);
    expect(line.line.length).toBeLessThanOrEqual(90);

    const coach = await fetch(`${base}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chip: 'on-track',
        context: {
          goal: {
            title: 'Read and summarise a book',
            deadlineUtc: `${addDays(today, 14)}T18:00:00.000Z`,
            timezone: 'UTC',
            hoursPerDay: 1.5,
            workingDays: [1, 2, 3, 4, 5],
            pace: 'Steady',
          },
          todayKey: today,
          milestones: [
            {
              id: 'm1',
              title: 'Chapters 1-4',
              targetDate: addDays(today, 4),
              estimatedHours: 5,
              status: 'pending',
              tasksDone: 1,
              tasksTotal: 4,
            },
          ],
          progress: {
            percentDone: 20,
            timePct: 25,
            pace: 'on-track',
            streak: 3,
            minutesLast7Days: 240,
            daysLeft: 14,
          },
        },
      }),
    });
    const body = (await coach.json()) as CoachResponse;
    say(`coach tools=${body.toolCalls.join(',')} reply="${body.reply}"`);
    expect(body.reply.length).toBeGreaterThan(0);
  }, 120_000);
});
