import React, { useEffect, useMemo, useRef, useState } from 'react';

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const formatForStorage = (date: Date) => {
  const base = startOfDay(date);
  const year = base.getFullYear();
  const month = `${base.getMonth() + 1}`.padStart(2, '0');
  const day = `${base.getDate()}`.padStart(2, '0');
  const hours = `${base.getHours()}`.padStart(2, '0');
  const minutes = `${base.getMinutes()}`.padStart(2, '0');
  const seconds = `${base.getSeconds()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

const toDisplayDate = (input?: string | null) => {
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
};

const isSameDay = (a: Date | null, b: Date | null) => {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const isBefore = (a: Date, b: Date) => a.getTime() < b.getTime();

const formatLabel = (date: Date) => new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(date);

const monthLabel = (date: Date) => new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
}).format(date);

interface DatePickerProps {
  value?: string | null;
  onChange: (value?: string) => void;
  minDate?: Date;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}

type GridDay = {
  date: Date;
  inCurrentMonth: boolean;
  disabled: boolean;
};

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  minDate,
  placeholder = 'Sélectionner une date',
  disabled = false,
  label,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => toDisplayDate(value));
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(toDisplayDate(value) || new Date()));
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedDate(toDisplayDate(value));
    if (value) {
      setCurrentMonth(startOfMonth(toDisplayDate(value) || new Date()));
    }
  }, [value]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!open) return;
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const startWeekday = (monthStart.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

    const days: GridDay[] = [];
    for (let i = 0; i < startWeekday; i += 1) {
      const date = new Date(monthStart);
      date.setDate(date.getDate() - (startWeekday - i));
      const disabledDay = minDate ? isBefore(startOfDay(date), startOfDay(minDate)) : false;
      days.push({ date, inCurrentMonth: false, disabled: disabledDay });
    }

    for (let i = 1; i <= daysInMonth; i += 1) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
      const disabledDay = minDate ? isBefore(startOfDay(date), startOfDay(minDate)) : false;
      days.push({ date, inCurrentMonth: true, disabled: disabledDay });
    }

    while (days.length % 7 !== 0) {
      const last = days[days.length - 1]?.date || new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      const date = new Date(last);
      date.setDate(date.getDate() + 1);
      const disabledDay = minDate ? isBefore(startOfDay(date), startOfDay(minDate)) : false;
      days.push({ date, inCurrentMonth: false, disabled: disabledDay });
    }

    return days;
  }, [currentMonth, minDate]);

  const emitChange = (date: Date | null) => {
    onChange(date ? formatForStorage(date) : undefined);
  };

  const handleDaySelect = (day: GridDay) => {
    if (disabled || day.disabled || !day.inCurrentMonth) return;
    const dayDate = startOfDay(day.date);
    setSelectedDate(dayDate);
    emitChange(dayDate);
  };

  const toggleOpen = () => {
    if (disabled) return;
    setOpen(o => !o);
  };

  const handleCancel = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (disabled) return;
    setSelectedDate(null);
    emitChange(null);
    setOpen(false);
  };

  const handleApply = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (disabled) return;
    setOpen(false);
  };

  const displayDate = selectedDate ? formatLabel(selectedDate) : '';
  const basePlaceholder = placeholder === 'Sélectionner une date' ? 'JJ/MM/AAAA' : placeholder;

  return (
    <div className="relative" ref={ref}>
      {label && (
        <label className="mb-2 block text-sm font-semibold text-gray-700">{label}</label>
      )}
      <div className="relative">
        <div
          onClick={disabled ? undefined : toggleOpen}
          className={`flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm ${
            disabled ? 'cursor-not-allowed opacity-60' : ''
          }`}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleOpen();
            }
          }}
        >
          <span className="text-sm font-medium text-gray-500">Le</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleOpen();
            }}
            disabled={disabled}
            className={`min-w-[200px] flex-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${
              displayDate ? 'text-gray-900' : 'text-gray-400'
            }`}
            aria-label="Date"
          >
            {displayDate || basePlaceholder}
          </button>
          <button
            type="button"
            onClick={toggleOpen}
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-100 text-gray-400 hover:bg-gray-50"
            aria-label="Ouvrir le calendrier"
            disabled={disabled}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {open && (
          <div className="absolute z-30 mt-2 w-[320px] rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 pt-4">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                }}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="text-sm font-semibold text-gray-900 capitalize">{monthLabel(currentMonth)}</div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                }}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="mb-3 mt-5 grid grid-cols-7 px-5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              <div>Lun</div>
              <div>Mar</div>
              <div>Mer</div>
              <div>Jeu</div>
              <div>Ven</div>
              <div>Sam</div>
              <div>Dim</div>
            </div>
            <div className="grid grid-cols-7 gap-y-1 px-5 pb-4">
              {gridDays.map((day, idx) => {
                if (!day.inCurrentMonth) {
                  return <div key={`${day.date.toISOString()}-empty-${idx}`} className="h-10 w-10" />;
                }

                const dayDate = startOfDay(day.date);
                const isSelected = selectedDate && isSameDay(dayDate, selectedDate);
                const isDisabled = day.disabled;

                const wrapperClasses = ['flex items-center justify-center h-10 w-10'];
                const buttonClasses = ['flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium'];

                if (isDisabled) {
                  buttonClasses.push('cursor-not-allowed text-gray-300');
                } else if (isSelected) {
                  wrapperClasses.push('rounded-full bg-blue-600');
                  buttonClasses.push('text-white');
                } else {
                  buttonClasses.push('text-gray-700 hover:bg-gray-100');
                }

                return (
                  <div key={`${day.date.toISOString()}-${idx}`} className={wrapperClasses.join(' ')}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDaySelect(day);
                      }}
                      disabled={isDisabled}
                      className={buttonClasses.join(' ')}
                    >
                      {day.date.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Effacer
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Appliquer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatePicker;
