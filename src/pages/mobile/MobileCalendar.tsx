import React, { useEffect, useMemo, useState } from 'react';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge, type BadgeTone } from '../../components/ui-kit';

type CalendarRow = {
  id: string;
  reference_code: string | null;
  title: string | null;
  status: string;
  type: string;
  start_date: string;
  end_date: string;
  client_name: string;
  color: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Validé',
  preparing: 'En préparation',
  in_progress: 'En cours',
  delivered: 'Livré',
  in_return: 'En retour',
  returned: 'Retourné',
  paid: 'Payé',
  completed: 'Terminée',
  cancelled: 'Annulée',
  archived: 'Archivée',
};

const statusBadgeTone = (status: string): BadgeTone => {
  switch (status) {
    case 'preparing':
      return 'orange';
    case 'confirmed':
      return 'emerald';
    case 'pending':
      return 'amber';
    case 'in_progress':
      return 'blue';
    case 'delivered':
      return 'sky';
    case 'in_return':
      return 'purple';
    case 'returned':
    case 'paid':
    case 'completed':
      return 'gray';
    case 'cancelled':
      return 'red';
    default:
      return 'slate';
  }
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const formatDayLabel = (date: Date) => {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const typeLabel = (type: string) => {
  if (type === 'sale') return 'Vente';
  if (type === 'service') return 'Prestation';
  return 'Location';
};

const MobileCalendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CalendarRow[]>([]);

  const dayLabel = useMemo(() => formatDayLabel(currentDate), [currentDate]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const start = new Date(currentDate);
        const end = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        const { data } = await supabase
          .from('rentals')
          .select('id, reference_code, title, status, type, start_date, end_date, color, clients(name)')
          .in('type', ['rental', 'service', 'sale'])
          .lte('start_date', end.toISOString())
          .gte('end_date', start.toISOString())
          .order('start_date', { ascending: true });
        setRows((data || []).map((row: any) => ({
          id: row.id,
          reference_code: row.reference_code,
          title: row.title,
          status: row.status || 'pending',
          type: row.type,
          start_date: row.start_date,
          end_date: row.end_date,
          client_name: row.clients?.name || 'Client',
          color: row.color || null,
        })));
      } finally {
        setLoading(false);
      }
    })();
  }, [currentDate]);

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <CalendarIcon className="h-5 w-5 text-gray-400" />
            Agenda
          </div>
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              setCurrentDate(today);
            }}
            className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600"
          >
            Aujourd&apos;hui
          </button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm mb-4 dark:border-gray-700 dark:bg-gray-900/70">
          <button
            type="button"
            onClick={() => setCurrentDate((prev) => {
              const next = new Date(prev);
              next.setDate(next.getDate() - 1);
              return next;
            })}
            className="h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 dark:border-gray-700 dark:text-gray-200"
            aria-label="Jour précédent"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100 text-center">{dayLabel}</div>
          <button
            type="button"
            onClick={() => setCurrentDate((prev) => {
              const next = new Date(prev);
              next.setDate(next.getDate() + 1);
              return next;
            })}
            className="h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 dark:border-gray-700 dark:text-gray-200"
            aria-label="Jour suivant"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-500">Aucun événement prévu ce jour.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <Link
                key={row.id}
                to={`/m/prestations/${row.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-3 shadow-sm active:scale-[.99] dark:border-gray-700 dark:bg-gray-900/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {row.reference_code || 'Référence —'} · {typeLabel(row.type)}
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {row.title || row.client_name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatTime(row.start_date)} → {formatTime(row.end_date)} · {row.client_name}
                    </div>
                  </div>
                  <StatusBadge tone={statusBadgeTone(row.status)} size="sm">
                    {STATUS_LABELS[row.status] || row.status}
                  </StatusBadge>
                </div>
                {row.color && (
                  <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: row.color }} />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default MobileCalendar;
