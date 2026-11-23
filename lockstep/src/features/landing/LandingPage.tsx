/** Landing: obsidian hero, gold ring, headline, CTA, 3-step explainer, phone mockup cycling templates. */
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarCheck2, ShieldCheck, Smartphone, Sparkles, Target } from 'lucide-react';
import { Wordmark } from '@/components/layout/Wordmark';
import { Button } from '@/components/ui/button';
import { LandingPhones } from './LandingPhones';

const HeroRing3D = lazy(() => import('./HeroRing3D'));

function useCan3D() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = window.innerWidth < 768;
    const saveData = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;
    let webgl: boolean;
    try {
      webgl = !!document.createElement('canvas').getContext('webgl2');
    } catch {
      webgl = false;
    }
    if (reduced || small || saveData || !webgl) return;
    // Load the 3D ring only after the page is idle, so it never slows the first paint.
    const id = (
      'requestIdleCallback' in window ? window.requestIdleCallback : (cb: () => void) => setTimeout(cb, 1200)
    )(() => setOk(true));
    return () => {
      if ('cancelIdleCallback' in window && typeof id === 'number') window.cancelIdleCallback(id);
    };
  }, []);
  return ok;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const can3D = useCan3D();

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="safe-top absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <nav className="flex items-center gap-1" aria-label="Site">
            <a
              href="#how"
              className="hidden min-h-11 items-center rounded-xl px-3 text-sm text-muted hover:text-text sm:inline-flex"
            >
              How it works
            </a>
            <Link
              to="/app"
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-muted hover:text-text"
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="relative overflow-hidden pb-16 pt-28 sm:pt-36" aria-labelledby="hero-title">
          {/* Static gold ring (always present; the 3D ring replaces it on capable desktops) */}
          <div
            className="pointer-events-none absolute right-[-30vw] top-[-10vw] size-[90vw] max-w-[1000px] opacity-90 md:right-[-12vw] md:top-[-6vw] md:size-[62vw]"
            aria-hidden
          >
            {can3D ? (
              <Suspense fallback={<StaticRing />}>
                <HeroRing3D />
              </Suspense>
            ) : (
              <StaticRing />
            )}
          </div>
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="eyebrow mb-5 inline-flex items-center gap-2"
              >
                <Sparkles className="size-3.5 text-accent-text" strokeWidth={1.5} aria-hidden /> Planned with
                Google Gemini
              </motion.p>
              <motion.h1
                id="hero-title"
                initial={{ y: 10 }}
                animate={{ y: 0 }}
                transition={{ delay: 0.05 }}
                className="text-[44px] font-light leading-[1.02] tracking-[-0.02em] sm:text-[64px] lg:text-[88px]"
              >
                Your deadline,
                <br />
                <span className="italic text-accent-text">locked in.</span>
              </motion.h1>
              <motion.p
                initial={{ y: 10 }}
                animate={{ y: 0 }}
                transition={{ delay: 0.12 }}
                className="mt-6 max-w-xl text-base text-muted sm:text-lg"
              >
                LOCKSTEP turns a distant deadline into a feasibility-checked milestone plan, a live countdown,
                and a lock-screen wallpaper that shows your real progress every time you unlock your phone.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="mt-9 flex flex-wrap gap-3"
              >
                <Button
                  size="lg"
                  onClick={() => navigate('/new')}
                  icon={<ArrowRight className="size-5" strokeWidth={1.75} />}
                  className="flex-row-reverse"
                >
                  Lock in your deadline
                </Button>
                <a
                  href="#how"
                  className="inline-flex h-13 items-center rounded-[14px] border border-accent px-6 text-base text-accent-text transition-colors hover:bg-accent/10"
                >
                  See how it works
                </a>
              </motion.div>
              <p className="mt-6 text-xs text-muted">
                No sign-up. Works offline. Your data stays on your device.
              </p>
            </div>
            <LandingPhones />
          </div>
        </section>

        <section id="how" className="border-t border-hairline py-20" aria-labelledby="how-title">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="eyebrow mb-3">How it works</p>
            <h2 id="how-title" className="max-w-2xl text-[28px] leading-tight sm:text-[40px]">
              Three steps from "someday" to a daily ritual.
            </h2>
            <ol className="mt-12 grid gap-5 md:grid-cols-3">
              {[
                {
                  icon: Target,
                  t: 'Tell it your deadline',
                  d: 'Your goal, the date and time in your zone, the hours you really have, your working days and pace.',
                },
                {
                  icon: ShieldCheck,
                  t: 'Gemini plans; code checks',
                  d: 'Gemini drafts milestones and tasks. Then plain code checks every date, every working day and your real capacity, and you approve each one.',
                },
                {
                  icon: Smartphone,
                  t: 'See it on every unlock',
                  d: 'Export a lock screen with days left, the next milestone and real progress. Refresh it as you tick tasks off.',
                },
              ].map((s, i) => (
                <li key={s.t} className="card relative p-6">
                  <span
                    className="absolute right-6 top-5 font-display text-5xl font-light text-gold-deep/60"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <s.icon className="size-6 text-accent-text" strokeWidth={1.5} aria-hidden />
                  <h3 className="mt-5 text-xl">{s.t}</h3>
                  <p className="mt-2 text-sm text-muted">{s.d}</p>
                </li>
              ))}
            </ol>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <div className="card p-6">
                <CalendarCheck2 className="size-6 text-accent-text" strokeWidth={1.5} aria-hidden />
                <h3 className="mt-4 text-xl">Honest by design</h3>
                <p className="mt-2 text-sm text-muted">
                  Every suggestion is labelled "✦ AI suggestion" until you approve it. Feasibility is
                  recomputed from your real hours. If Gemini is busy, your saved plan keeps working.
                </p>
              </div>
              <div className="card p-6">
                <Smartphone className="size-6 text-accent-text" strokeWidth={1.5} aria-hidden />
                <h3 className="mt-4 text-xl">A wallpaper that lives</h3>
                <p className="mt-2 text-sm text-muted">
                  Wallpapers can't tick, so ours don't pretend to. They show days left, the next milestone and
                  real progress, and they update when you refresh. On iPhone, an automation you set up once
                  can refresh it every morning.
                </p>
              </div>
            </div>
            <div className="mt-12 flex justify-center">
              <Button size="lg" onClick={() => navigate('/new')}>
                Lock in your deadline
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 text-sm text-muted sm:flex-row sm:items-center sm:px-6">
          <Wordmark />
          <p>Built with Google Gemini · Your data stays on your device · No tracking</p>
          <nav className="flex gap-4" aria-label="Footer">
            <Link to="/guide" className="hover:text-text">
              Wallpaper guide
            </Link>
            <Link to="/settings" className="hover:text-text">
              Settings
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function StaticRing() {
  return (
    <svg viewBox="0 0 400 400" className="size-full" aria-hidden>
      <defs>
        <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E5CC91" />
          <stop offset="0.5" stopColor="#C5A15A" />
          <stop offset="1" stopColor="#8E7037" />
        </linearGradient>
      </defs>
      <circle cx="200" cy="200" r="150" fill="none" stroke="url(#ring-g)" strokeWidth="1.2" opacity="0.55" />
      <circle cx="200" cy="200" r="120" fill="none" stroke="rgba(197,161,90,0.18)" strokeWidth="1" />
      <circle
        cx="200"
        cy="200"
        r="150"
        fill="none"
        stroke="#E5CC91"
        strokeWidth="2.4"
        strokeDasharray="942"
        strokeDashoffset="640"
        strokeLinecap="round"
        transform="rotate(-90 200 200)"
      />
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i / 60) * Math.PI * 2;
        const r1 = i % 5 === 0 ? 162 : 166;
        return (
          <line
            key={i}
            x1={200 + Math.cos(a) * r1}
            y1={200 + Math.sin(a) * r1}
            x2={200 + Math.cos(a) * 172}
            y2={200 + Math.sin(a) * 172}
            stroke="rgba(197,161,90,0.35)"
            strokeWidth={i % 5 === 0 ? 1.4 : 0.8}
          />
        );
      })}
    </svg>
  );
}
