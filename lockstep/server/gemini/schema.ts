/**
 * JSON Schemas sent to Gemini as `config.responseJsonSchema`.
 *
 * Why (for learners): with `responseMimeType: 'application/json'` plus a
 * schema, Gemini's decoder is constrained to produce JSON of exactly this shape.
 * The schema mirrors PlanSchema in shared/plan.ts (zod still re-checks it, as we
 * never trust the model blindly).
 *
 * `propertyOrdering` is a Gemini extension: it makes the model write the keys
 * in this order. We want feasibility FIRST and milestones before the long
 * trailing text, so the streaming parser can show them as early as possible.
 *
 * When there are few enough valid dates we also list them as an `enum` for
 * targetDate, so the model physically cannot pick a weekend or a past date.
 */
import { DIFFICULTY, FEASIBILITY, LIMITS } from '../../shared/plan';

export const PLAN_PROPERTY_ORDER = [
  'goal',
  'deadline',
  'timezone',
  'feasibility',
  'feasibilityReason',
  'totalEstimatedHours',
  'fullScopeHours',
  'milestones',
  'risks',
  'recoveryStrategy',
  'dailyRitual',
] as const;

const MILESTONE_ORDER = [
  'id',
  'title',
  'description',
  'targetDate',
  'estimatedHours',
  'difficulty',
  'tasks',
] as const;
const TASK_ORDER = ['id', 'title', 'estimatedMinutes'] as const;

/** Above this many allowed dates we describe the rule instead of enumerating dates. */
export const MAX_ENUM_DATES = 90;

export function buildPlanJsonSchema(allowedDates: readonly string[]): Record<string, unknown> {
  const targetDate: Record<string, unknown> = {
    type: 'string',
    format: 'date',
    description: 'YYYY-MM-DD. A working day after today and on or before the deadline day.',
  };
  if (allowedDates.length > 0 && allowedDates.length <= MAX_ENUM_DATES) targetDate.enum = [...allowedDates];

  return {
    type: 'object',
    properties: {
      goal: { type: 'string', description: "The user's goal restated in one short line." },
      deadline: { type: 'string', description: 'The deadline exactly as given (ISO 8601, UTC).' },
      timezone: { type: 'string', description: 'The IANA time zone exactly as given.' },
      feasibility: { type: 'string', enum: [...FEASIBILITY] },
      feasibilityReason: { type: 'string', description: 'One or two sentences with the real numbers.' },
      totalEstimatedHours: { type: 'number', minimum: 0, description: 'Sum of milestone estimatedHours.' },
      fullScopeHours: {
        type: 'number',
        minimum: 0,
        description:
          'Hours the COMPLETE goal would need when that exceeds the capacity (so this plan keeps only the essentials). Use 0 when the full goal fits.',
      },
      milestones: {
        type: 'array',
        minItems: 1,
        maxItems: LIMITS.maxMilestones,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'm1, m2, …' },
            title: { type: 'string', description: 'Specific and measurable outcome.' },
            description: { type: 'string' },
            targetDate,
            estimatedHours: { type: 'number', minimum: 0.25 },
            difficulty: { type: 'string', enum: [...DIFFICULTY] },
            tasks: {
              type: 'array',
              minItems: 1,
              maxItems: LIMITS.maxTasksPerMilestone,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'm1-t1, m1-t2, …' },
                  title: { type: 'string' },
                  estimatedMinutes: { type: 'integer', minimum: 5, maximum: 600 },
                },
                required: [...TASK_ORDER],
                propertyOrdering: [...TASK_ORDER],
              },
            },
          },
          required: [...MILESTONE_ORDER],
          propertyOrdering: [...MILESTONE_ORDER],
        },
      },
      risks: { type: 'array', maxItems: 8, items: { type: 'string' } },
      recoveryStrategy: { type: 'string' },
      dailyRitual: { type: 'string' },
    },
    required: [...PLAN_PROPERTY_ORDER],
    propertyOrdering: [...PLAN_PROPERTY_ORDER],
  };
}

/** `{ "line": "…" }` for the motivation line. */
export const LINE_SCHEMA = {
  type: 'object',
  properties: { line: { type: 'string' } },
  required: ['line'],
} as const;

/** `{ "summary": "…" }` for the weekly insight. */
export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
} as const;
