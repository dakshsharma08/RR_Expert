/**
 * App frame. Mobile (<768px): top bar + bottom tab bar with a centre gold "+".
 * Desktop: collapsible left sidebar + Ctrl/⌘K command palette.
 */
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  Home,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  Smartphone,
  Timer,
} from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui';
import { IconButton } from '@/components/ui/button';
import { CommandPalette } from './CommandPalette';
import { Wordmark } from './Wordmark';
import { useActiveGoalId } from '@/db/hooks';
import { Kbd } from '@/components/ui/misc';
import { RouteErrorBoundary } from './RouteErrorBoundary';

const NAV = [
  { to: '/app', label: 'Home', icon: Home },
  { to: '/goals', label: 'Goals', icon: LayoutGrid },
  { to: '/studio', label: 'Studio', icon: Smartphone },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
] as const;

export function AppShell() {
  const { sidebarCollapsed, toggleSidebar, setPaletteOpen } = useUi();
  const navigate = useNavigate();
  const location = useLocation();
  const activeGoalId = useActiveGoalId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  // Move focus to the main region on route change (keyboard + screen-reader friendly).
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-bg text-text">
      <a
        href="#main"
        className="sr-only-focusable fixed left-3 top-3 z-[90] rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-obsidian"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-hairline bg-bg/95 backdrop-blur md:flex',
          'transition-[width] duration-300 ease-out',
          sidebarCollapsed ? 'w-[76px]' : 'w-64',
        )}
        aria-label="Primary"
      >
        <div
          className={cn(
            'flex h-16 items-center px-4',
            sidebarCollapsed ? 'justify-center' : 'justify-between',
          )}
        >
          <NavLink to="/" aria-label="LOCKSTEP home" className="rounded-md">
            <Wordmark compact={sidebarCollapsed} />
          </NavLink>
        </div>
        <div className="px-3">
          <button
            onClick={() => navigate('/new')}
            className={cn(
              'mb-3 flex h-11 w-full items-center gap-2 rounded-[14px] bg-gold font-semibold text-obsidian transition-colors hover:bg-gold-light',
              sidebarCollapsed ? 'justify-center' : 'px-4',
            )}
            aria-label="New goal"
          >
            <Plus className="size-5" strokeWidth={1.75} aria-hidden />
            {!sidebarCollapsed && <span className="text-sm">New goal</span>}
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className={cn(
              'mb-4 flex h-11 w-full items-center gap-2 rounded-[14px] border border-hairline text-sm text-muted transition-colors hover:border-line-strong hover:text-text',
              sidebarCollapsed ? 'justify-center' : 'px-3',
            )}
            aria-label="Search and commands"
          >
            <Search className="size-4" strokeWidth={1.5} aria-hidden />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-left">Search…</span>
                <Kbd>⌘K</Kbd>
              </>
            )}
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <SideLink key={n.to} to={n.to} label={n.label} icon={n.icon} collapsed={sidebarCollapsed} />
          ))}
          {activeGoalId && (
            <SideLink
              to={`/focus/${activeGoalId}`}
              label="Focus mode"
              icon={Timer}
              collapsed={sidebarCollapsed}
            />
          )}
        </nav>
        <div className="space-y-1 border-t border-hairline p-3">
          <SideLink to="/settings" label="Settings" icon={Settings} collapsed={sidebarCollapsed} />
          <button
            onClick={toggleSidebar}
            className={cn(
              'flex h-11 w-full items-center gap-3 rounded-[12px] px-3 text-sm text-muted hover:bg-surface-2 hover:text-text',
              sidebarCollapsed && 'justify-center px-0',
            )}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <ChevronsRight className="size-5" strokeWidth={1.5} />
            ) : (
              <ChevronsLeft className="size-5" strokeWidth={1.5} />
            )}
            {!sidebarCollapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="safe-top sticky top-0 z-30 border-b border-hairline bg-bg/90 backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <NavLink to="/" aria-label="LOCKSTEP home" className="rounded-md">
            <Wordmark />
          </NavLink>
          <div className="flex items-center gap-1">
            <IconButton label="Search and commands" onClick={() => setPaletteOpen(true)} tooltipSide="bottom">
              <Search className="size-5" strokeWidth={1.5} />
            </IconButton>
            <NavLink
              to="/settings"
              aria-label="Settings"
              className="flex size-11 items-center justify-center rounded-full"
            >
              <span
                className="flex size-8 items-center justify-center rounded-full border border-accent bg-surface-2 text-xs font-semibold text-accent-text"
                aria-hidden
              >
                G
              </span>
            </NavLink>
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className={cn(
          'outline-none transition-[padding] duration-300 ease-out',
          sidebarCollapsed ? 'md:pl-[76px]' : 'md:pl-64',
          'pb-28 md:pb-10',
        )}
      >
        <RouteErrorBoundary key={location.pathname}>
          <Outlet />
        </RouteErrorBoundary>
      </main>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Primary"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-bg/95 backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          <BottomLink {...NAV[0]} />
          <BottomLink {...NAV[1]} />
          <li className="flex justify-center">
            <button
              onClick={() => navigate('/new')}
              aria-label="New goal"
              className="-mt-5 flex size-14 items-center justify-center rounded-full bg-gold text-obsidian shadow-[0_8px_24px_-8px_rgba(197,161,90,0.55)] transition-transform active:scale-95"
            >
              <Plus className="size-6" strokeWidth={2} />
            </button>
          </li>
          <BottomLink {...NAV[2]} />
          <BottomLink {...NAV[3]} />
        </ul>
      </nav>

      <CommandPalette />
    </div>
  );
}

function SideLink({
  to,
  label,
  icon: Icon,
  collapsed,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex h-11 items-center gap-3 rounded-[12px] px-3 text-sm transition-colors',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2/60 hover:text-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-5', isActive && 'text-accent-text')} strokeWidth={1.5} aria-hidden />
          {!collapsed && <span>{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function BottomLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            'flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px]',
            isActive ? 'text-accent-text' : 'text-muted',
          )
        }
      >
        <Icon className="size-5" strokeWidth={1.5} aria-hidden />
        {label}
      </NavLink>
    </li>
  );
}
