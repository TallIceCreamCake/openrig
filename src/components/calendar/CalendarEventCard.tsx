import React, { useMemo } from 'react';
import { CalendarEvent } from '../../types/calendar';
import { cn } from '../../utils/cn';

type CalendarEventCardDensity = 'cozy' | 'compact' | 'micro';

interface CalendarEventCardProps {
  event: CalendarEvent;
  timeLabel: string;
  secondaryText?: string;
  density?: CalendarEventCardDensity;
  timeLabelAlign?: 'left' | 'right';
  className?: string;
}

const EVENT_META: Record<
  CalendarEvent['type'],
  {
    accent: string;
    surface: string;
  }
> = {
  rental: {
    accent: '#059669',
    surface: 'rgba(5, 150, 105, 0.12)',
  },
  service: {
    accent: '#2563EB',
    surface: 'rgba(37, 99, 235, 0.12)',
  },
  sale: {
    accent: '#059669',
    surface: 'rgba(5, 150, 105, 0.12)',
  },
  delivery: {
    accent: '#0EA5E9',
    surface: 'rgba(14, 165, 233, 0.12)',
  },
  appointment: {
    accent: '#F59E0B',
    surface: 'rgba(245, 158, 11, 0.14)',
  },
  return_delivery: {
    accent: '#0891B2',
    surface: 'rgba(8, 145, 178, 0.12)',
  },
  return_appointment: {
    accent: '#7C3AED',
    surface: 'rgba(124, 58, 237, 0.12)',
  },
  maintenance: {
    accent: '#EA580C',
    surface: 'rgba(234, 88, 12, 0.12)',
  },
  task: {
    accent: '#6B7280',
    surface: 'rgba(107, 114, 128, 0.10)',
  },
  meeting: {
    accent: '#475569',
    surface: 'rgba(71, 85, 105, 0.10)',
  },
  reminder: {
    accent: '#94A3B8',
    surface: 'rgba(148, 163, 184, 0.16)',
  },
};

const DENSITY_META: Record<
  CalendarEventCardDensity,
  {
    wrapper: string;
    title: string;
    meta: string;
  }
> = {
  cozy: {
    wrapper: 'rounded-xl px-3 py-2.5 gap-1.5',
    title: 'text-xs leading-4',
    meta: 'text-[11px] leading-4',
  },
  compact: {
    wrapper: 'rounded-lg px-2.5 py-2 gap-1',
    title: 'text-[11px] leading-4',
    meta: 'text-[10px] leading-3.5',
  },
  micro: {
    wrapper: 'rounded-md px-2 py-1.5 gap-1',
    title: 'text-[11px] leading-3.5',
    meta: 'text-[10px] leading-3.5',
  },
};

const hexToRgba = (value: string, alpha: number) => {
  const normalized = value.trim();
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1].length === 3
    ? match[1]
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
    : match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const CalendarEventCard: React.FC<CalendarEventCardProps> = ({
  event,
  timeLabel,
  secondaryText,
  density = 'compact',
  timeLabelAlign = 'right',
  className,
}) => {
  const densityMeta = DENSITY_META[density];
  const eventMeta = EVENT_META[event.type];

  const colors = useMemo(() => {
    if (!event.color) {
      return {
        accent: eventMeta.accent,
        surface: eventMeta.surface,
      };
    }

    return {
      accent: event.color,
      surface: hexToRgba(event.color, 0.12) || eventMeta.surface,
    };
  }, [event.color, eventMeta.accent, eventMeta.surface]);

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col overflow-hidden border border-slate-200/90 bg-white/90 text-slate-900 shadow-sm backdrop-blur-sm',
        densityMeta.wrapper,
        className,
      )}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: colors.accent,
        backgroundColor: colors.surface,
      }}
    >
      <div className={cn('flex min-w-0 items-start gap-2', timeLabelAlign === 'left' ? 'justify-start' : 'justify-end')}>
        <span className={cn('shrink-0 font-medium text-slate-500', densityMeta.meta)}>{timeLabel}</span>
      </div>

      <div className={cn('min-w-0 truncate font-semibold text-slate-900', densityMeta.title)} title={event.title}>
        {event.title}
      </div>

      {secondaryText ? (
        <div
          className={cn('min-w-0 truncate text-slate-600', densityMeta.meta)}
          title={secondaryText}
        >
          {secondaryText}
        </div>
      ) : null}
    </div>
  );
};

export default CalendarEventCard;
