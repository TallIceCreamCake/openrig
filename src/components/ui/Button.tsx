import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ButtonVariant =
  | 'primary'    // filled accent color
  | 'secondary'  // subtle gray fill
  | 'ghost'      // transparent, border on hover
  | 'outline'    // transparent with border always visible
  | 'soft'       // light tinted background (color-50)
  | 'danger'     // red
  | 'warning'    // amber
  | 'success'    // green
  | 'link';      // looks like a text link

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ButtonShape = 'default' | 'pill' | 'square';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual style */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Border-radius shape */
  shape?: ButtonShape;
  /** Icon placed before the label */
  leftIcon?: LucideIcon;
  /** Icon placed after the label */
  rightIcon?: LucideIcon;
  /** Replaces content with a spinner and disables the button */
  loading?: boolean;
  /** Stretch to full container width */
  fullWidth?: boolean;
  /** Force active/pressed visual state */
  active?: boolean;
};

// ─── Style maps ───────────────────────────────────────────────────────────────

const base =
  'relative inline-flex items-center justify-center font-medium select-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'gap-1 px-2.5 py-1 text-xs',
  sm: 'gap-1.5 px-3 py-1.5 text-sm',
  md: 'gap-2 px-4 py-2 text-sm',
  lg: 'gap-2 px-5 py-2.5 text-base',
  xl: 'gap-2.5 px-6 py-3 text-base',
};

const iconSizeClasses: Record<ButtonSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-[18px] w-[18px]',
  xl: 'h-5 w-5',
};

const shapeClasses: Record<ButtonShape, string> = {
  default: 'rounded-lg',
  pill: 'rounded-full',
  square: 'rounded-md',
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600',
  secondary:
    'bg-gray-100 text-gray-700 shadow-sm hover:bg-gray-200 active:bg-gray-300 focus-visible:ring-gray-400 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
  outline:
    'bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 focus-visible:ring-gray-400 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800',
  soft:
    'bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-200 focus-visible:ring-blue-400 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500 dark:bg-red-500 dark:hover:bg-red-600',
  warning:
    'bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700 focus-visible:ring-amber-400 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-500',
  success:
    'bg-green-600 text-white shadow-sm hover:bg-green-700 active:bg-green-800 focus-visible:ring-green-500 dark:bg-green-500 dark:hover:bg-green-600',
  link:
    'bg-transparent text-blue-600 underline-offset-4 hover:underline hover:text-blue-700 active:text-blue-800 focus-visible:ring-blue-400 dark:text-blue-400 dark:hover:text-blue-300',
};

const activeOverlay: Record<ButtonVariant, string> = {
  primary:   'ring-2 ring-blue-400 ring-offset-1',
  secondary: 'ring-2 ring-gray-400 ring-offset-1',
  ghost:     'bg-gray-100 dark:bg-gray-800',
  outline:   'bg-gray-100 border-gray-400 dark:bg-gray-800',
  soft:      'bg-blue-100 dark:bg-blue-900/50',
  danger:    'ring-2 ring-red-400 ring-offset-1',
  warning:   'ring-2 ring-amber-400 ring-offset-1',
  success:   'ring-2 ring-green-400 ring-offset-1',
  link:      'underline',
};

// ─── Component ────────────────────────────────────────────────────────────────

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      shape = 'default',
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      loading = false,
      fullWidth = false,
      active = false,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const iconCls = iconSizeClasses[size];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          base,
          sizeClasses[size],
          shapeClasses[shape],
          variantClasses[variant],
          active && activeOverlay[variant],
          fullWidth && 'w-full',
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className={cn(iconCls, 'animate-spin')} />
        ) : (
          LeftIcon && <LeftIcon className={cn(iconCls, 'flex-shrink-0')} />
        )}

        {children && (
          <span className={cn('inline-flex items-center gap-2', loading && 'opacity-0 absolute')}>{children}</span>
        )}

        {!loading && RightIcon && <RightIcon className={cn(iconCls, 'flex-shrink-0')} />}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
