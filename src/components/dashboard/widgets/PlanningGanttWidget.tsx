import React, { useMemo, useState } from 'react';
import {
  addDays, format, isToday, parseISO, startOfDay,
  isWithinInterval, differenceInDays,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Rental } from '../../../types/rental';

// ─── Types ───────────────────────────────────────────────────────────────────

type Range = 7 | 14 | 21 | 30;
type GroupBy = 'status' | 'type' | 'client';
type ColorBy = 'status' | 'type';
type RentalType = 'rental' | 'service' | 'sale';

interface Props {
  rentals: Rental[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bar: string; group: string }> = {
  pending:         { label: 'En attente',     bar: 'bg-amber-400 border-amber-500',   group: 'En attente' },
  confirmed:       { label: 'Confirmé',       bar: 'bg-blue-500 border-blue-600',     group: 'Confirmés' },
  preparing:       { label: 'Préparation',    bar: 'bg-indigo-500 border-indigo-600', group: 'Préparation' },
  in_progress:     { label: 'En cours',       bar: 'bg-violet-500 border-violet-600', group: 'En cours' },
  delivered:       { label: 'Livré',          bar: 'bg-teal-500 border-teal-600',     group: 'Livré' },
  return_delivery: { label: 'Retour livr.',   bar: 'bg-cyan-500 border-cyan-600',     group: 'Retour logistique' },
  in_return:       { label: 'En retour',      bar: 'bg-orange-500 border-orange-600', group: 'En retour' },
  returned:        { label: 'Retourné',       bar: 'bg-lime-500 border-lime-600',     group: 'Retourné' },
  completed:       { label: 'Terminé',        bar: 'bg-green-500 border-green-600',   group: 'Terminés' },
  paid:            { label: 'Payé',           bar: 'bg-emerald-500 border-emerald-600', group: 'Payés' },
  cancelled:       { label: 'Annulé',         bar: 'bg-red-400 border-red-500',       group: 'Annulés' },
  archived:        { label: 'Archivé',        bar: 'bg-gray-400 border-gray-500',     group: 'Archivés' },
};

const TYPE_META: Record<string, { label: string; bar: string }> = {
  rental:  { label: 'Location',    bar: 'bg-blue-500 border-blue-600' },
  service: { label: 'Prestation',  bar: 'bg-violet-500 border-violet-600' },
  sale:    { label: 'Vente',       bar: 'bg-emerald-500 border-emerald-600' },
};

const STATUS_ORDER = [
  'in_progress', 'preparing', 'confirmed', 'pending',
  'delivered', 'in_return', 'return_delivery', 'returned',
  'completed', 'paid', 'cancelled', 'archived',
];

const ACTIVE_STATUSES = new Set([
  'pending', 'confirmed', 'preparing', 'in_progress',
  'delivered', 'return_delivery', 'in_return', 'returned',
  'completed', 'paid',
]);

// ─── Utils ───────────────────────────────────────────────────────────────────

function barClass(r: Rental, colorBy: ColorBy): string {
  if (colorBy === 'type') return TYPE_META[r.type]?.bar ?? 'bg-gray-400 border-gray-500';
  return STATUS_META[r.status]?.bar ?? 'bg-gray-400 border-gray-500';
}

function groupKey(r: Rental, groupBy: GroupBy): string {
  if (groupBy === 'type') return TYPE_META[r.type]?.label ?? r.type;
  if (groupBy === 'client') return r.client_name || 'Sans client';
  return STATUS_META[r.status]?.group ?? r.status;
}

function groupOrder(key: string, groupBy: GroupBy): number {
  if (groupBy === 'status') {
    const idx = STATUS_ORDER.findIndex(s => STATUS_META[s]?.group === key);
    return idx === -1 ? 99 : idx;
  }
  return 0;
}

// ─── Component ───────────────────────────────────────────────────────────────

const PlanningGanttWidget: React.FC<Props> = ({ rentals }) => {
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>(14);
  const [refDate, setRefDate] = useState(new Date());
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [colorBy, setColorBy] = useState<ColorBy>('status');
  const [showArchived, setShowArchived] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Record<RentalType, boolean>>({
    rental: true, service: true, sale: true,
  });

  const timelineStart = useMemo(() => startOfDay(refDate), [refDate]);
  const timelineEnd = useMemo(() => addDays(timelineStart, range), [timelineStart, range]);
  const duration = timelineEnd.getTime() - timelineStart.getTime();
  const days = useMemo(
    () => Array.from({ length: range }, (_, i) => addDays(timelineStart, i)),
    [timelineStart, range]
  );

  // Filter rentals
  const visible = useMemo(() => {
    return rentals.filter(r => {
      if (!typeFilter[r.type as RentalType]) return false;
      if (!showArchived && !ACTIVE_STATUSES.has(r.status)) return false;
      // must overlap the timeline window
      const s = parseISO(r.start_date);
      const e = r.end_date ? parseISO(r.end_date) : addDays(s, 1);
      return e > timelineStart && s < timelineEnd;
    });
  }, [rentals, typeFilter, showArchived, timelineStart, timelineEnd]);

  // Group
  const groups = useMemo(() => {
    const map = new Map<string, Rental[]>();
    visible.forEach(r => {
      const key = groupKey(r, groupBy);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    // Sort rentals within each group by start date
    map.forEach(list => list.sort((a, b) => a.start_date.localeCompare(b.start_date)));
    // Sort groups
    return [...map.entries()].sort((a, b) => {
      const oa = groupOrder(a[0], groupBy);
      const ob = groupOrder(b[0], groupBy);
      if (oa !== ob) return oa - ob;
      return a[0].localeCompare(b[0]);
    });
  }, [visible, groupBy]);

  // Bar position
  const barStyle = (r: Rental): React.CSSProperties | null => {
    const s = parseISO(r.start_date);
    const e = r.end_date ? parseISO(r.end_date) : addDays(s, 1);
    const clampedStart = s < timelineStart ? timelineStart : s;
    const clampedEnd = e > timelineEnd ? timelineEnd : e;
    if (clampedEnd <= clampedStart) return null;
    const left = ((clampedStart.getTime() - timelineStart.getTime()) / duration) * 100;
    const width = Math.max(0.5, ((clampedEnd.getTime() - clampedStart.getTime()) / duration) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  const todayPct = useMemo(() => {
    const now = new Date();
    if (now < timelineStart || now > timelineEnd) return null;
    return ((now.getTime() - timelineStart.getTime()) / duration) * 100;
  }, [timelineStart, timelineEnd, duration]);

  const rangeLabel = `${format(timelineStart, 'd MMM', { locale: fr })} – ${format(addDays(timelineEnd, -1), 'd MMM yyyy', { locale: fr })}`;

  const toggleType = (t: RentalType) =>
    setTypeFilter(prev => ({ ...prev, [t]: !prev[t] }));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2 border-b border-gray-100 bg-white shrink-0">
        {/* Navigation */}
        <div className="flex items-center gap-1">
          <button onClick={() => setRefDate(addDays(refDate, -range))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-semibold text-gray-700 px-2 min-w-[140px] text-center">{rangeLabel}</span>
          <button onClick={() => setRefDate(addDays(refDate, range))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight size={14} />
          </button>
          <button onClick={() => setRefDate(new Date())}
            className="ml-1 px-2 py-1 text-[11px] font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            Auj.
          </button>
        </div>

        {/* Range */}
        <select value={range} onChange={e => setRange(Number(e.target.value) as Range)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
          <option value={7}>7 jours</option>
          <option value={14}>14 jours</option>
          <option value={21}>21 jours</option>
          <option value={30}>30 jours</option>
        </select>

        {/* Group by */}
        <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
          <option value="status">Par statut</option>
          <option value="type">Par type</option>
          <option value="client">Par client</option>
        </select>

        {/* Color by */}
        <select value={colorBy} onChange={e => setColorBy(e.target.value as ColorBy)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
          <option value="status">Couleur : statut</option>
          <option value="type">Couleur : type</option>
        </select>

        {/* Type toggles */}
        <div className="flex items-center gap-1 ml-auto">
          {(['rental', 'service', 'sale'] as RentalType[]).map(t => (
            <button key={t} onClick={() => toggleType(t)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors ${
                typeFilter[t]
                  ? t === 'rental' ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : t === 'service' ? 'bg-violet-100 text-violet-700 border-violet-300'
                    : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  : 'bg-white text-gray-400 border-gray-200'
              }`}>
              {TYPE_META[t].label}
            </button>
          ))}
          <button onClick={() => setShowArchived(a => !a)}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors ${
              showArchived ? 'bg-gray-200 text-gray-700 border-gray-400' : 'bg-white text-gray-400 border-gray-200'
            }`}>
            Archivés
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[600px]">
          {/* Day header */}
          <div className="grid border-b border-gray-200 bg-gray-50 sticky top-0 z-10"
            style={{ gridTemplateColumns: '180px 1fr' }}>
            <div className="px-3 py-2 text-[11px] font-semibold uppercase text-gray-400 border-r border-gray-200">
              Projet
            </div>
            <div className="relative overflow-hidden">
              <div className="flex">
                {days.map((day, i) => {
                  const weekend = [0, 6].includes(day.getDay());
                  const today = isToday(day);
                  return (
                    <div key={i} className={`flex-1 py-2 text-center text-[10px] font-semibold border-r last:border-r-0 border-gray-200 ${
                      today ? 'bg-blue-50 text-blue-600' : weekend ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {format(day, 'EEE d', { locale: fr })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Empty state */}
          {groups.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              Aucun projet sur cette période
            </div>
          )}

          {/* Groups */}
          {groups.map(([gKey, gRentals]) => (
            <React.Fragment key={gKey}>
              {/* Group header */}
              <div className="grid bg-gray-50/80 border-b border-gray-100"
                style={{ gridTemplateColumns: '180px 1fr' }}>
                <div className="px-3 py-1.5 col-span-2 text-[11px] font-semibold uppercase text-gray-500 tracking-wide">
                  {gKey}
                  <span className="ml-2 text-gray-400 font-normal normal-case">
                    ({gRentals.length})
                  </span>
                </div>
              </div>

              {/* Rental rows */}
              {gRentals.map(r => {
                const style = barStyle(r);
                const statusMeta = STATUS_META[r.status];
                const typeMeta = TYPE_META[r.type];
                const label = r.reference_code
                  ? `${r.reference_code} — ${r.client_name || '—'}`
                  : r.client_name || '—';
                const days_count = r.end_date
                  ? differenceInDays(parseISO(r.end_date), parseISO(r.start_date)) + 1
                  : 1;

                return (
                  <div key={r.id} className="grid border-b border-gray-50 hover:bg-gray-50/30 group"
                    style={{ gridTemplateColumns: '180px 1fr' }}>
                    {/* Label */}
                    <div className="px-3 py-2.5 border-r border-gray-100 flex items-center gap-1.5 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        colorBy === 'type' ? typeMeta?.bar.replace('bg-', 'bg-').split(' ')[0] : statusMeta?.bar.split(' ')[0]
                      }`} />
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-gray-800 truncate" title={label}>{label}</div>
                        <div className="text-[10px] text-gray-400">
                          {statusMeta?.label ?? r.status} · {days_count}j
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/rentals/${r.id}`)}
                        className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-indigo-600"
                      >
                        <ExternalLink size={11} />
                      </button>
                    </div>

                    {/* Timeline bar */}
                    <div className="relative h-10">
                      {/* Day column backgrounds */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {days.map((day, i) => (
                          <div key={i} className={`flex-1 border-r last:border-r-0 border-gray-100 ${
                            isToday(day) ? 'bg-blue-50/40' : [0, 6].includes(day.getDay()) ? 'bg-gray-50/60' : ''
                          }`} />
                        ))}
                      </div>
                      {/* Today line */}
                      {todayPct !== null && (
                        <div className="absolute top-0 bottom-0 w-px bg-blue-400 opacity-60 pointer-events-none z-10"
                          style={{ left: `${todayPct}%` }} />
                      )}
                      {/* Bar */}
                      {style && (
                        <div
                          className={`absolute top-2 bottom-2 rounded border text-white text-[10px] font-medium flex items-center px-2 cursor-pointer overflow-hidden ${barClass(r, colorBy)}`}
                          style={style}
                          onClick={() => navigate(`/rentals/${r.id}`)}
                          title={`${r.reference_code ?? ''} ${r.client_name ?? ''}\n${format(parseISO(r.start_date), 'dd/MM/yyyy', { locale: fr })} → ${r.end_date ? format(parseISO(r.end_date), 'dd/MM/yyyy', { locale: fr }) : '—'}`}
                        >
                          <span className="truncate">
                            {r.reference_code || r.client_name || typeMeta?.label}
                          </span>
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

      {/* ── Legend ── */}
      {colorBy === 'status' && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2 border-t border-gray-100 bg-gray-50 shrink-0">
          {Object.entries(STATUS_META)
            .filter(([s]) => showArchived || ACTIVE_STATUSES.has(s))
            .map(([s, m]) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-sm ${m.bar.split(' ')[0]}`} />
                <span className="text-[10px] text-gray-500">{m.label}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
};

export default PlanningGanttWidget;
