import { Command } from 'cmdk';
import * as D from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router';
import {
  BarChart3,
  Download,
  Home,
  LayoutGrid,
  Moon,
  Plus,
  Settings,
  Smartphone,
  Sun,
  Target,
  Timer,
  BookOpen,
} from 'lucide-react';
import { useUi } from '@/stores/ui';
import { useGoals, useActiveGoalId } from '@/db/hooks';
import { setActiveGoal } from '@/db/repo';

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setMode, mode } = useUi();
  const navigate = useNavigate();
  const goals = useGoals() ?? [];
  const activeId = useActiveGoalId();
  const go = (to: string) => {
    setPaletteOpen(false);
    navigate(to);
  };

  return (
    <D.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px]" />
        <D.Content className="fixed left-1/2 top-[12vh] z-[71] w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 overflow-hidden rounded-[20px] border border-hairline bg-surface shadow-2xl">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search goals and run commands</D.Description>
          <Command
            label="Command palette"
            className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3"
          >
            <Command.Input
              autoFocus
              placeholder="Type a command or search goals…"
              className="h-14 w-full border-b border-hairline bg-transparent px-4 text-base text-text placeholder:text-muted focus:outline-none"
            />
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">No results.</Command.Empty>
              <Command.Group heading="Go to">
                <Item onSelect={() => go('/new')} icon={<Plus className="size-4" />}>
                  New goal
                </Item>
                <Item onSelect={() => go('/app')} icon={<Home className="size-4" />}>
                  Home
                </Item>
                <Item onSelect={() => go('/goals')} icon={<LayoutGrid className="size-4" />}>
                  Goals
                </Item>
                <Item onSelect={() => go('/studio')} icon={<Smartphone className="size-4" />}>
                  Lock Screen Studio
                </Item>
                <Item onSelect={() => go('/insights')} icon={<BarChart3 className="size-4" />}>
                  Insights
                </Item>
                {activeId && (
                  <Item onSelect={() => go(`/focus/${activeId}`)} icon={<Timer className="size-4" />}>
                    Focus mode
                  </Item>
                )}
                <Item onSelect={() => go('/guide')} icon={<BookOpen className="size-4" />}>
                  Set-wallpaper guide
                </Item>
                <Item onSelect={() => go('/settings')} icon={<Settings className="size-4" />}>
                  Settings
                </Item>
              </Command.Group>
              {goals.length > 0 && (
                <Command.Group heading="Goals">
                  {goals.map((g) => (
                    <Item
                      key={g.id}
                      value={`goal ${g.title}`}
                      onSelect={() => {
                        void setActiveGoal(g.id);
                        go(
                          g.status === 'review' || g.status === 'planning'
                            ? `/goals/${g.id}/review`
                            : `/goals/${g.id}`,
                        );
                      }}
                      icon={<Target className="size-4" />}
                    >
                      {g.title}
                    </Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Preferences">
                <Item
                  onSelect={() => {
                    setMode(mode === 'light' ? 'dark' : 'light');
                    setPaletteOpen(false);
                  }}
                  icon={mode === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
                >
                  Switch to {mode === 'light' ? 'dark' : 'light'} mode
                </Item>
                <Item onSelect={() => go('/settings#data')} icon={<Download className="size-4" />}>
                  Export my data
                </Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Item({
  children,
  onSelect,
  icon,
  value,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  icon: React.ReactNode;
  value?: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-11 cursor-pointer items-center gap-3 rounded-[12px] px-3 text-sm text-text data-[selected=true]:bg-surface-2 data-[selected=true]:text-accent-text"
    >
      <span className="text-muted" aria-hidden>
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </Command.Item>
  );
}
