import React from 'react';
import { cn } from '../../utils/cn';

type ProgressBarProps = {
  value: number;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  indicatorClassName?: string;
  animate?: boolean;
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  orientation = 'horizontal',
  className,
  indicatorClassName,
  animate = true,
}) => {
  const clamped = clamp(value);
  const horizontal = orientation === 'horizontal';

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'relative overflow-hidden rounded-full bg-slate-200',
        horizontal ? 'h-2 w-full' : 'h-full w-2',
        className
      )}
    >
      <div
        className={cn(
          'bg-blue-600',
          animate && 'transition-all duration-500 ease-out',
          horizontal ? 'h-full' : 'w-full',
          indicatorClassName
        )}
        style={horizontal ? { width: `${clamped}%` } : { height: `${clamped}%` }}
      />
    </div>
  );
};

export default ProgressBar;
