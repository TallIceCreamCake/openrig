import React from 'react';
import { cn } from '../../utils/cn';

export type BadgeTone =
  | 'gray'
  | 'slate'
  | 'green'
  | 'blue'
  | 'sky'
  | 'indigo'
  | 'purple'
  | 'emerald'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'red';

export type BadgeVariant = 'soft' | 'outline' | 'solid';
export type BadgeSize = 'xs' | 'sm' | 'md';

type StatusBadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
};

const sizeClasses: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

const softNeutral = 'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200';
const softNeutralAlt = 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200';
const softSuccess = 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200';
const softInfo = 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200';
const softWarning = 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200';
const softDanger = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200';

const outlineNeutral = 'border border-gray-200 bg-white text-gray-700 dark:border-gray-600 dark:bg-transparent dark:text-gray-200';
const outlineNeutralAlt = 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900/30 dark:text-slate-200';
const outlineSuccess = 'border border-green-200 bg-green-50 text-green-700 dark:border-green-700/60 dark:bg-green-900/20 dark:text-green-200';
const outlineInfo = 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700/60 dark:bg-blue-900/20 dark:text-blue-200';
const outlineWarning = 'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-700/60 dark:bg-orange-900/20 dark:text-orange-200';
const outlineDanger = 'border border-red-200 bg-red-50 text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-200';

const solidNeutral = 'bg-gray-700 text-white';
const solidNeutralAlt = 'bg-slate-700 text-white';
const solidSuccess = 'bg-green-600 text-white';
const solidInfo = 'bg-blue-600 text-white';
const solidWarning = 'bg-orange-500 text-white';
const solidDanger = 'bg-red-600 text-white';

const toneClasses: Record<BadgeVariant, Record<BadgeTone, string>> = {
  soft: {
    gray: softNeutral,
    slate: softNeutralAlt,
    green: softSuccess,
    blue: softInfo,
    sky: softInfo,
    indigo: softInfo,
    purple: softInfo,
    emerald: softSuccess,
    amber: softWarning,
    orange: softWarning,
    rose: softDanger,
    red: softDanger,
  },
  outline: {
    gray: outlineNeutral,
    slate: outlineNeutralAlt,
    green: outlineSuccess,
    blue: outlineInfo,
    sky: outlineInfo,
    indigo: outlineInfo,
    purple: outlineInfo,
    emerald: outlineSuccess,
    amber: outlineWarning,
    orange: outlineWarning,
    rose: outlineDanger,
    red: outlineDanger,
  },
  solid: {
    gray: solidNeutral,
    slate: solidNeutralAlt,
    green: solidSuccess,
    blue: solidInfo,
    sky: solidInfo,
    indigo: solidInfo,
    purple: solidInfo,
    emerald: solidSuccess,
    amber: solidWarning,
    orange: solidWarning,
    rose: solidDanger,
    red: solidDanger,
  },
};

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(function StatusBadge(
  {
    tone = 'gray',
    variant = 'soft',
    size = 'sm',
    className,
    ...props
  },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-full whitespace-nowrap font-medium',
        sizeClasses[size],
        toneClasses[variant][tone],
        className,
      )}
      {...props}
    />
  );
});

export default StatusBadge;
