import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip } from './tooltip';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:
    'bg-gold text-obsidian font-semibold hover:bg-gold-light active:bg-gold-deep active:text-ivory shadow-[0_1px_0_rgba(255,255,255,0.18)_inset]',
  secondary: 'border border-accent text-accent-text hover:bg-accent/10 active:bg-accent/20',
  ghost: 'text-text hover:bg-surface-2 active:bg-surface-2/70',
  destructive: 'bg-transparent text-danger border border-danger/60 hover:border-danger',
  subtle: 'bg-surface-2 text-text border border-hairline hover:border-line-strong',
};

const sizes: Record<Size, string> = {
  sm: 'h-11 min-w-11 px-3.5 text-sm gap-1.5', // still ≥44px tall for touch
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-6 text-base gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    icon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-[14px] whitespace-nowrap transition-colors duration-200 ease-out select-none',
        'disabled:opacity-45 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: Variant;
  children: ReactNode;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

/** Icon-only button: always has an aria-label and a tooltip. 44×44 tap target. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', className, children, tooltipSide = 'top', type = 'button', ...rest },
  ref,
) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] transition-colors duration-200',
          'disabled:opacity-45 disabled:pointer-events-none',
          variants[variant],
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});
