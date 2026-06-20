import React, { useMemo, useState } from 'react';
import { addDays, format, isToday, parseISO, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ExternalLink } from 'lucide-react';
import type { CalendarEvent } from '../../types/calendar';

// ─── Types ───────────────────────────────────────────────────────────────────

type GanttRange = 14 | 21 | 30 | 60 | 90;

interface Props {
  events: CalendarEvent[];
  currentDate: Date;
  onNavigateToEvent?: (path: string) => void;
  onEventClick: (event: CalendarEvent) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EVENT_TYPE_META: Record<string, { label: string; bar: string; section: number }> = {
  rental:             { label: 'Location',           bar: 'bg-blue-500 border-blue-600 text-white',         section: 0 },
  service:            { label: 'Prestation',          bar: 'bg-violet-500 border-violet-600 text-white',     section: 0 },
  sale:               { label: 'Vente',               bar: 'bg-emerald-500 border-emerald-600 text-white',   section: 0 },
  delivery:           { label: 'Livraison',           bar: 'bg-sky-400 border-sky-500 text-white',           section: 1 },
  appointment:        { label: 'RDV livraison',       bar: 'bg-sky-300 border-sky-400 text-gray-800',        section: 1 },
  return_delivery:    { label: 'Retour livraison',    bar: 'bg-cyan-400 border-cyan-500 text-white',         section: 1 },
  return_appointment: { label: 'RDV retour',          bar: 'bg-cyan-300 border-cyan-400 text-gray-800',      section: 1 },
  maintenance:        { label: 'Maintenance',         bar: 'bg-orange-400 border-orange-500 text-white',     section: 2 },
  task:               { label: 'Tâche',               bar: 'bg-slate-400 border-slate-500 text-white',       section: 3 },
  meeting:            { label: 'Réunion',             bar: 'bg-purple-400 border-purple-500 text-white',     section: 3 },
  reminder:           { label: 'Rappel',              bar: 'bg-yellow-400 border-yellow-500 text-gray-800',  section: 3 },
};

const SECTIONS = [
  { key: 'projects',    label: 'Projets',     types: new Set(['rental', 'service', 'sale']) },
  { key: 'logistics',   label: 'Logistique',  types: new Set(['delivery', 'appointment', 'return_delivery', 'return_appointment']) },
  { key: 'maintenance', label: 'Maintenance', types: new Set(['maintenance']) },
  { key: 'manual',      label: 'Agenda',      types: new Set(['task', 'meeting', 'reminder']) },
];

const ROW_H = 36; // px per row
const LABEL_W = 220;

// ─── GanttView ───────────────────────────────────────────────────────────────

const GanttView: React.FC<Props> = ({ events, currentDate, onNavigateToEvent, onEventClick }) => {
  const [range, setRange] = useState<GanttRange>(30);

  const timelineStart = useMemo(() => startOfDay(currentDate), [currentDate]);
  const timelineEnd = useMemo(() => addDays(timelineStart, range), [timelineStart, range]);
  const duration = timelineEnd.getTime() - timelineStart.getTime();
  const days = useMemo(
    () => Array.from({ length: range }, (_, i) => addDays(timelineStart, i)),
    [timelineStart, range]
  );

  // For range > 21, show month labels instead of day labels
  const showMonthGroups = range > 21;

  // Month group header spans
  const monthGroups = useMemo(() => {
    if (!showMonthGroups) return [];
    const groups: { label: string; count: number }[] = [];
    days.forEach(day => {
      const mLabel = format(day, 'MMMM yyyy', { locale: fr });
      if (groups.length === 0 || groups[groups.length - 1].label !== mLabel) {
        groups.push({ label: mLabel.charAt(0).toUpperCase() + mLabel.slice(1), count: 1 });
      } else {
        groups[groups.length - 1].count++;
      }
    });
    return groups;
  }, [days, showMonthGroups]);

  // Visible events per section
  const sectionEvents = useMemo(() => {
    return SECTIONS.map(sec => {
      const matching = events.filter(e => {
        if (!sec.types.has(e.type)) return false;
        const s = parseISO(e.start_date);
        const en = parseISO(e.end_date);
        return en > timelineStart && s < timelineEnd;
      });
      // Sort by start date
      matching.sort((a, b) => a.start_date.localeCompare(b.start_date));
      return { ...sec, events: matching };
    }).filter(s => s.events.length > 0);
  }, [events, timelineStart, timelineEnd]);

  const todayPct = useMemo(() => {
    const now = new Date();
    if (now < timelineStart || now > timelineEnd) return null;
    return ((now.getTime() - timelineStart.getTime()) / duration) * 100;
  }, [timelineStart, timelineEnd, duration]);

  const barStyle = (e: CalendarEvent): React.CSSProperties | null => {
    const s = parseISO(e.start_date);
    const en = parseISO(e.end_date);
    const cs = s < timelineStart ? timelineStart : s;
    const ce = en > timelineEnd ? timelineEnd : en;
    if (ce <= cs) return null;
    const left = ((cs.getTime() - timelineStart.getTime()) / duration) * 100;
    const width = Math.max(0.3, ((ce.getTime() - cs.getTime()) / duration) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  const handleEventClick = (e: CalendarEvent) => {
    if ((e.rental_id || e.service_id) && onNavigateToEvent) {
      onNavigateToEvent(`/rentals/${e.rental_id || e.service_id}`);
      return;
    }
    if (e.maintenance_id && onNavigateToEvent) {
      onNavigateToEvent(`/maintenance/${e.maintenance_id}`);
      return;
    }
    onEventClick(e);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Range selector */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Fenêtre :</span>
          {([14, 21, 30, 60, 90] as GanttRange[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                range === r ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              {r}j
            </button>
          ))}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {Object.entries(EVENT_TYPE_META)
            .filter(([, m]) => sectionEvents.some(s => s.types.has(Object.keys(EVENT_TYPE_META).find(k => EVENT_TYPE_META[k] === m)!)))
            .slice(0, 6)
            .map(([type, m]) => (
              <div key={type} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-sm border ${m.bar.split(' ').slice(0, 2).join(' ')}`} />
                <span className="text-[10px] text-gray-500">{m.label}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Gantt body */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: `${LABEL_W + 600}px` }}>
          {/* Day header */}
          <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm"
            style={{ display: 'grid', gridTemplateColumns: `${LABEL_W}px 1fr` }}>
            <div className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase border-r border-gray-200">
              Événement
            </div>
            <div>
              {/* Month groups (for long ranges) */}
              {showMonthGroups && (
                <div className="flex border-b border-gray-100">
                  {monthGroups.map((g, i) => (
                    <div key={i} className="text-[10px] font-semibold text-gray-600 py-1 px-2 border-r last:border-r-0 border-gray-200"
                      style={{ flex: g.count }}>
                      {g.label}
                    </div>
                  ))}
                </div>
              )}
              {/* Day labels */}
              <div className="flex">
                {days.map((day, i) => {
                  const weekend = [0, 6].includes(day.getDay());
                  const today = isToday(day);
                  const showDay = range <= 30 || day.getDate() === 1 || day.getDate() % 7 === 0;
                  return (
                    <div key={i} className={`flex-1 py-1.5 text-center border-r last:border-r-0 border-gray-100 text-[9px] font-medium ${
                      today ? 'bg-blue-50 text-blue-600' : weekend ? 'bg-gray-50 text-gray-300' : 'text-gray-400'
                    }`}>
                      {showDay ? format(day, range <= 14 ? 'EEE d' : 'd', { locale: fr }) : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Empty state */}
          {sectionEvents.length === 0 && (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              Aucun événement sur cette période
            </div>
          )}

          {/* Sections */}
          {sectionEvents.map(section => (
            <React.Fragment key={section.key}>
              {/* Section header */}
              <div className="sticky z-10 bg-gray-100 border-b border-gray-200 border-t"
                style={{ display: 'grid', gridTemplateColumns: `${LABEL_W}px 1fr`, top: showMonthGroups ? 54 : 42 }}>
                <div className="col-span-2 px-3 py-1.5 text-[11px] font-bold uppercase text-gray-500 tracking-wider">
                  {section.label}
                  <span className="ml-2 text-gray-400 font-normal normal-case">
                    ({section.events.length})
                  </span>
                </div>
              </div>

              {/* Event rows */}
              {section.events.map(ev => {
                const meta = EVENT_TYPE_META[ev.type];
                const style = barStyle(ev);
                const isNavigable = !!(ev.rental_id || ev.service_id || ev.maintenance_id);

                return (
                  <div key={ev.id} className="border-b border-gray-50 hover:bg-gray-50/40 group"
                    style={{ display: 'grid', gridTemplateColumns: `${LABEL_W}px 1fr`, height: ROW_H }}>
                    {/* Label */}
                    <div className="px-3 flex items-center gap-1.5 border-r border-gray-100 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta?.bar.split(' ')[0] ?? 'bg-gray-400'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium text-gray-800 truncate" title={ev.title}>
                          {ev.title}
                        </div>
                        {ev.description && (
                          <div className="text-[10px] text-gray-400 truncate">{ev.description}</div>
                        )}
                      </div>
                      {isNavigable && (
                        <button onClick={() => handleEventClick(ev)}
                          className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 text-gray-400 hover:text-indigo-600">
                          <ExternalLink size={10} />
                        </button>
                      )}
                    </div>

                    {/* Bar area */}
                    <div className="relative" style={{ height: ROW_H }}>
                      {/* Column backgrounds */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {days.map((day, i) => (
                          <div key={i} className={`flex-1 border-r last:border-r-0 border-gray-50 ${
                            isToday(day) ? 'bg-blue-50/40' : [0, 6].includes(day.getDay()) ? 'bg-gray-50/60' : ''
                          }`} />
                        ))}
                      </div>
                      {/* Today line */}
                      {todayPct !== null && (
                        <div className="absolute top-0 bottom-0 w-px bg-blue-400/60 pointer-events-none z-10"
                          style={{ left: `${todayPct}%` }} />
                      )}
                      {/* Bar */}
                      {style && (
                        <div
                          className={`absolute top-1.5 border rounded text-[10px] font-medium flex items-center px-1.5 overflow-hidden cursor-pointer ${meta?.bar ?? 'bg-gray-400 border-gray-500 text-white'}`}
                          style={{ ...style, bottom: 6 }}
                          onClick={() => handleEventClick(ev)}
                          title={`${ev.title}\n${format(parseISO(ev.start_date), 'dd/MM HH:mm', { locale: fr })} → ${format(parseISO(ev.end_date), 'dd/MM HH:mm', { locale: fr })}`}
                        >
                          <span className="truncate">{ev.title}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GanttView;
