import React, { useEffect, useMemo, useState } from 'react';
import ClientPortalLayout from './ClientPortalLayout';
import { Loader2, AlertCircle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

type Project = {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  draft:       'bg-gray-200 text-gray-600',
  pending:     'bg-amber-100 text-amber-700 border-l-2 border-amber-400',
  confirmed:   'bg-emerald-100 text-emerald-700 border-l-2 border-emerald-500',
  in_progress: 'bg-blue-100 text-blue-700 border-l-2 border-blue-500',
  completed:   'bg-slate-100 text-slate-500',
  cancelled:   'bg-red-50 text-red-500 opacity-60',
};

const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

const ClientPortalPlanning: React.FC = () => (
  <ClientPortalLayout>
    {() => <PlanningContent />}
  </ClientPortalLayout>
);

const PlanningContent: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    const token = localStorage.getItem('cp_token') || '';
    fetch('/api/client-portal/projects', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setProjects(d.projects || []))
      .catch((e) => setError(`Impossible de charger vos projets. (${e.message})`))
      .finally(() => setLoading(false));
  }, []);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const last  = new Date(viewYear, viewMonth + 1, 0);
    const startPad = (first.getDay() + 6) % 7;
    const days: Array<Date | null> = Array(startPad).fill(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(viewYear, viewMonth, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [viewYear, viewMonth]);

  const projectsOnDay = (day: Date) =>
    projects.filter((p) => {
      if (!p.start_date || p.status === 'cancelled') return false;
      const start = new Date(p.start_date); start.setHours(0, 0, 0, 0);
      const end   = p.end_date ? new Date(p.end_date) : new Date(p.start_date); end.setHours(23, 59, 59, 999);
      return day >= start && day <= end;
    });

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  if (loading) {
    return (
      <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-10 flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  const upcoming = projects.filter(
    (p) => p.start_date && new Date(p.start_date) > today && p.status !== 'cancelled'
  );

  return (
    <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <p className="text-sm font-medium text-pink-600 uppercase tracking-wider mb-1">Projets</p>
        <h1 className="text-2xl font-bold text-gray-900">Planning</h1>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-100 px-5 py-4 text-red-700 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold text-gray-900">{MONTH_NAMES[viewMonth]} {viewYear}</h2>
          <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 divide-x divide-gray-100">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} className="min-h-[90px] bg-gray-50/40 border-b border-gray-100" />;
            const dayProjects = projectsOnDay(day);
            return (
              <div key={day.toISOString()} className={`min-h-[90px] p-1.5 border-b border-gray-100 flex flex-col gap-1 ${isToday(day) ? 'bg-emerald-50/60' : ''}`}>
                <span className={`text-xs font-semibold self-end w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-emerald-600 text-white' : 'text-gray-500'}`}>
                  {day.getDate()}
                </span>
                {dayProjects.map((p) => (
                  <div key={p.id} title={p.title} className={`rounded px-1.5 py-0.5 text-[10px] font-medium truncate ${STATUS_COLOR[p.status] || 'bg-gray-100 text-gray-600'}`}>
                    {p.title || '(sans titre)'}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-200 border-l-2 border-emerald-500" />Confirmé</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-200 border-l-2 border-blue-500" />En cours</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-200 border-l-2 border-amber-400" />En attente</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200" />Terminé</span>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Prochains événements</h3>
          <div className="space-y-2">
            {upcoming
              .sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime())
              .slice(0, 5)
              .map((p) => (
                <div key={p.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <div className="text-center w-12 flex-shrink-0">
                    <p className="text-lg font-bold text-gray-900 leading-none">{new Date(p.start_date!).getDate()}</p>
                    <p className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">
                      {MONTH_NAMES[new Date(p.start_date!).getMonth()].slice(0, 3)}
                    </p>
                  </div>
                  <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
                  <CalendarDays className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.title || '(sans titre)'}</p>
                    {p.location && <p className="text-xs text-gray-400 truncate">{p.location}</p>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPortalPlanning;
