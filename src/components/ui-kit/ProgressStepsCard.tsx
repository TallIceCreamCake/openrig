import React from 'react';
import { cn } from '../../utils/cn';
import StatusBadge, { type BadgeTone, type BadgeVariant } from './StatusBadge';

export type ProgressStepState = 'completed' | 'current' | 'upcoming' | 'cancelled';
export type ProgressStepTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted';

export type ProgressStep = {
  id: string;
  label: string;
  description?: string;
  statusLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  state?: ProgressStepState;
  tone?: ProgressStepTone;
};

type ProgressStepsCardProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  steps: ProgressStep[];
  badge?: { label: string; className?: string; tone?: BadgeTone; variant?: BadgeVariant };
  accentColor?: string;
  className?: string;
  stateLabels?: Partial<Record<ProgressStepState, string>>;
  showProgress?: boolean;
  progressLabel?: React.ReactNode;
  renderStepFooter?: (step: ProgressStep) => React.ReactNode;
  headerActions?: React.ReactNode;
  headerActionsClassName?: string;
  footer?: React.ReactNode;
  footerClassName?: string;
};

const stateTone: Record<ProgressStepState, ProgressStepTone> = {
  completed: 'success',
  current: 'accent',
  upcoming: 'muted',
  cancelled: 'danger',
};

const toneTokens: Record<ProgressStepTone, {
  icon: string;
  border: string;
  bg: string;
  text: string;
  chip: string;
  ring: string;
  line: string;
}> = {
  accent: {
    icon: 'bg-blue-600 text-white',
    border: 'border-blue-100',
    bg: 'bg-blue-50/60',
    text: 'text-blue-700',
    chip: 'bg-blue-100 text-blue-700',
    ring: 'ring-blue-200/70',
    line: 'bg-blue-200',
  },
  success: {
    icon: 'bg-emerald-600 text-white',
    border: 'border-emerald-100',
    bg: 'bg-emerald-50/60',
    text: 'text-emerald-700',
    chip: 'bg-emerald-100 text-emerald-700',
    ring: 'ring-emerald-200/70',
    line: 'bg-emerald-200',
  },
  warning: {
    icon: 'bg-orange-500 text-white',
    border: 'border-orange-100',
    bg: 'bg-orange-50/60',
    text: 'text-orange-700',
    chip: 'bg-orange-100 text-orange-700',
    ring: 'ring-orange-200/70',
    line: 'bg-orange-200',
  },
  danger: {
    icon: 'bg-rose-600 text-white',
    border: 'border-rose-100',
    bg: 'bg-rose-50/60',
    text: 'text-rose-700',
    chip: 'bg-rose-100 text-rose-700',
    ring: 'ring-rose-200/70',
    line: 'bg-rose-200',
  },
  muted: {
    icon: 'bg-slate-200 text-slate-500',
    border: 'border-slate-200',
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    chip: 'bg-slate-100 text-slate-500',
    ring: 'ring-slate-200/70',
    line: 'bg-slate-200',
  },
};

const defaultStateLabels: Record<ProgressStepState, string> = {
  completed: 'Terminee',
  current: 'En cours',
  upcoming: 'A venir',
  cancelled: 'Annulee',
};

const stepToneToBadgeTone: Record<ProgressStepTone, BadgeTone> = {
  accent: 'blue',
  success: 'green',
  warning: 'orange',
  danger: 'red',
  muted: 'slate',
};

const ProgressStepsCard: React.FC<ProgressStepsCardProps> = ({
  title,
  subtitle,
  steps,
  badge,
  accentColor,
  className,
  stateLabels,
  showProgress = true,
  progressLabel,
  renderStepFooter,
  headerActions,
  headerActionsClassName,
  footer,
  footerClassName,
}) => {
  const mergedStateLabels = { ...defaultStateLabels, ...stateLabels };
  const totalSteps = steps.length;
  const currentIndex = steps.findIndex((step) => step.state === 'current');
  const completedCount = steps.filter((step) => step.state === 'completed').length;
  const progressIndex = currentIndex >= 0 ? currentIndex + 1 : completedCount;
  const progressValue = totalSteps ? Math.round((progressIndex / totalSteps) * 100) : 0;

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ backgroundColor: accentColor || '#2563eb' }}
        aria-hidden="true"
      />
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Progression</p>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {badge && (
            badge.tone ? (
              <StatusBadge tone={badge.tone} variant={badge.variant} className="font-semibold">
                {badge.label}
              </StatusBadge>
            ) : (
              <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', badge.className)}>
                {badge.label}
              </span>
            )
          )}
        </div>
        {showProgress && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{progressLabel || `Etape ${Math.max(progressIndex, 1)} / ${Math.max(totalSteps, 1)}`}</span>
              <span>{progressValue}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progressValue}%`, backgroundColor: accentColor || '#2563eb' }}
              />
            </div>
          </div>
        )}
        {headerActions && (
          <div className={cn('mt-4', headerActionsClassName)}>
            {headerActions}
          </div>
        )}
      </div>
      <div className="px-4 pb-4">
        <ol className="relative space-y-3">
          {steps.length > 1 && (
            <span
              className="absolute left-[18px] top-[30px] bottom-[30px] w-px bg-slate-200"
              aria-hidden="true"
            />
          )}
          {steps.map((step, index) => {
            const state = step.state ?? 'upcoming';
            const tone = step.tone ?? stateTone[state];
            const tokens = toneTokens[tone];
            const StepIcon = step.icon;
            const isCurrent = state === 'current';
            const statusLabel = step.statusLabel || mergedStateLabels[state];
            const iconStyle = tone === 'accent' && accentColor
              ? { backgroundColor: accentColor, color: '#fff' }
              : undefined;

            return (
              <li key={step.id} className="relative">
                <div className="flex gap-4">
                  <div className="relative z-10 mt-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white shadow-sm">
                    <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold', tokens.icon)} style={iconStyle}>
                      {StepIcon ? <StepIcon className="h-4 w-4" /> : index + 1}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'flex-1 rounded-xl border p-3 transition-shadow',
                      tokens.border,
                      tokens.bg,
                      isCurrent && tokens.ring,
                      isCurrent && 'ring-1'
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={cn('text-sm font-semibold', tokens.text)}>{step.label}</span>
                      {statusLabel && (
                        <StatusBadge tone={stepToneToBadgeTone[tone]}>
                          {statusLabel}
                        </StatusBadge>
                      )}
                    </div>
                    {step.description && (
                      <p className="mt-1 text-xs text-slate-500">{step.description}</p>
                    )}
                    {renderStepFooter && (
                      <div className="mt-2">{renderStepFooter(step)}</div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {footer && (
        <div className={cn('px-6 pb-5 pt-2', footerClassName)}>
          {footer}
        </div>
      )}
    </div>
  );
};

export default ProgressStepsCard;
