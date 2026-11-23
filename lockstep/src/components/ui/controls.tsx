import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as RSlider from '@radix-ui/react-slider';
import * as RSwitch from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';
import { WEEKDAY_SHORT } from '@shared/time';

/** Segmented control: exactly one option selected (like iOS). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn('grid gap-1 rounded-[14px] border border-hairline bg-surface-2/60 p-1', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="flex min-h-11 flex-col items-center justify-center rounded-[10px] px-2 py-1.5 text-sm text-muted transition-colors duration-200 hover:text-text data-[state=on]:bg-gold data-[state=on]:font-semibold data-[state=on]:text-obsidian"
        >
          <span>{o.label}</span>
          {o.hint && <span className="text-[11px] leading-tight opacity-80">{o.hint}</span>}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/** Choice chips: single-select pills. */
export function ChoiceChips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className="flex flex-wrap gap-2"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="h-11 rounded-full border border-hairline px-4 text-sm text-text transition-colors duration-200 hover:border-line-strong data-[state=on]:border-accent data-[state=on]:bg-accent/15 data-[state=on]:text-accent-text data-[state=on]:font-semibold"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/** Mon–Sun toggles (multi-select). Week starts Monday. */
export function WeekdayToggles({
  value,
  onChange,
  label = 'Working days',
}: {
  value: number[];
  onChange: (v: number[]) => void;
  label?: string;
}) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <ToggleGroup.Root
      type="multiple"
      value={value.map(String)}
      onValueChange={(v) => onChange(v.map(Number).sort())}
      aria-label={label}
      className="grid grid-cols-7 gap-1.5"
    >
      {order.map((d) => (
        <ToggleGroup.Item
          key={d}
          value={String(d)}
          aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]}
          className="flex h-12 items-center justify-center rounded-[12px] border border-hairline text-sm text-muted transition-colors duration-200 hover:border-line-strong data-[state=on]:border-accent data-[state=on]:bg-gold data-[state=on]:font-semibold data-[state=on]:text-obsidian"
        >
          {WEEKDAY_SHORT[d]!.slice(0, 2)}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  valueText,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  valueText?: string;
  className?: string;
}) {
  return (
    <RSlider.Root
      className={cn('relative flex h-11 w-full touch-none select-none items-center', className)}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0] ?? value)}
      aria-label={label}
    >
      <RSlider.Track className="relative h-1 grow rounded-full bg-surface-2">
        <RSlider.Range className="absolute h-full rounded-full bg-gold" />
      </RSlider.Track>
      <RSlider.Thumb
        aria-label={label}
        aria-valuetext={valueText}
        className="block size-6 rounded-full border-2 border-gold bg-obsidian shadow transition-transform duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      />
    </RSlider.Root>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-hairline bg-surface-2 transition-colors duration-200 data-[state=checked]:border-accent data-[state=checked]:bg-gold"
    >
      <RSwitch.Thumb className="block size-5 translate-x-1 rounded-full bg-ivory shadow transition-transform duration-200 data-[state=checked]:translate-x-6 data-[state=checked]:bg-obsidian" />
    </RSwitch.Root>
  );
}

/** Wraps a Switch with a visible label; the whole row is a ≥44px target. */
export function SwitchRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-sm text-text">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </label>
  );
}
