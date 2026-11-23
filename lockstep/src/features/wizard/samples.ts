import type { Level, PaceStyle } from '@shared/plan';

/** Realistic sample goals. "Try a sample goal" fills one in — Gemini still plans it for real. */
export const SAMPLE_GOALS: {
  goal: string;
  daysOut: number;
  time: string;
  level: Level;
  hoursPerDay: number;
  workingDays: number[];
  constraints: string;
  pace: PaceStyle;
}[] = [
  {
    goal: 'Pass the AWS Certified Cloud Practitioner exam',
    daysOut: 35,
    time: '10:00',
    level: 'Beginner',
    hoursPerDay: 1.5,
    workingDays: [1, 2, 3, 4, 6],
    constraints:
      'Full-time job, so I study in the evenings. I learn best with practice questions. I want a full mock exam in the final week.',
    pace: 'Balanced',
  },
  {
    goal: 'Launch my portfolio website with 3 case studies',
    daysOut: 21,
    time: '18:00',
    level: 'Intermediate',
    hoursPerDay: 2,
    workingDays: [1, 2, 3, 4, 5],
    constraints:
      'I have the designs half done in Figma. Hosting on Vercel. I need one week of buffer for feedback.',
    pace: 'Steady',
  },
  {
    goal: 'Submit my final-year dissertation (10,000 words)',
    daysOut: 49,
    time: '12:00',
    level: 'Intermediate',
    hoursPerDay: 3,
    workingDays: [1, 2, 3, 4, 5, 6],
    constraints:
      'Literature review is done. Data collection is still needed (survey, about 2 weeks). My supervisor needs a draft 10 days before the deadline.',
    pace: 'Balanced',
  },
  {
    goal: 'Run my first 10K race in under 60 minutes',
    daysOut: 42,
    time: '08:00',
    level: 'Beginner',
    hoursPerDay: 1,
    workingDays: [1, 3, 5, 6],
    constraints:
      'I can currently run 3K without stopping. I have a knee that needs rest days. Race morning starts at 8am.',
    pace: 'Steady',
  },
];
