/**
 * Routes. Heavy screens (Studio, Insights, Landing 3D) are code-split with `lazy`
 * so the first load stays small.
 */
import { createBrowserRouter, type RouteObject } from 'react-router';
import { RouteFallback, NotFound, RouteError } from './RouteFallback';

const lazy = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

const routes: RouteObject[] = [
  {
    path: '/',
    lazy: lazy(() => import('@/features/landing/LandingPage')),
    HydrateFallback: RouteFallback,
    errorElement: <RouteError />,
  },
  {
    path: '/cover',
    lazy: lazy(() => import('@/features/cover/CoverPage')),
    HydrateFallback: RouteFallback,
    errorElement: <RouteError />,
  },
  {
    path: '/focus/:goalId',
    lazy: lazy(() => import('@/features/focus/FocusPage')),
    HydrateFallback: RouteFallback,
    errorElement: <RouteError />,
  },
  {
    // The app frame is lazy too, so the landing page doesn't download the sidebar/palette code.
    lazy: async () => ({ Component: (await import('@/components/layout/AppShell')).AppShell }),
    HydrateFallback: RouteFallback,
    errorElement: <RouteError />,
    children: [
      { path: '/app', lazy: lazy(() => import('@/features/dashboard/DashboardPage')) },
      { path: '/goals', lazy: lazy(() => import('@/features/goals/GoalsPage')) },
      { path: '/new', lazy: lazy(() => import('@/features/wizard/WizardPage')) },
      { path: '/goals/:goalId', lazy: lazy(() => import('@/features/goals/GoalPage')) },
      { path: '/goals/:goalId/plan', lazy: lazy(() => import('@/features/planning/PlanningPage')) },
      { path: '/goals/:goalId/review', lazy: lazy(() => import('@/features/review/ReviewPage')) },
      { path: '/studio', lazy: lazy(() => import('@/features/studio/StudioPage')) },
      { path: '/studio/:goalId', lazy: lazy(() => import('@/features/studio/StudioPage')) },
      { path: '/insights', lazy: lazy(() => import('@/features/insights/InsightsPage')) },
      { path: '/settings', lazy: lazy(() => import('@/features/settings/SettingsPage')) },
      { path: '/guide', lazy: lazy(() => import('@/features/guide/GuidePage')) },
      { path: '*', Component: NotFound },
    ],
  },
];

export const router = createBrowserRouter(routes);
