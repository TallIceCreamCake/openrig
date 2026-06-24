import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, AlertTriangle, ClipboardList, Truck, Package } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import MobileLayout from './MobileLayout';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type TodayRental = {
  id: string;
  title: string | null;
  reference_code: string | null;
  status: string;
  start_date: string;
  end_date: string;
  clients: { name: string } | null;
};

type KPIs = {
  activeRentals: number;
  pendingPreps: number;
  deliveriesToday: number;
};

const statusLabel: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  preparing: 'En préparation',
  in_progress: 'En cours',
  delivered: 'Livré',
  in_return: 'En retour',
  returned: 'Retourné',
  paid: 'Payé',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const MobileHome: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayRentals, setTodayRentals] = useState<TodayRental[]>([]);
  const [kpis, setKpis] = useState<KPIs>({ activeRentals: 0, pendingPreps: 0, deliveriesToday: 0 });
  const [loading, setLoading] = useState(true);

  const firstName = user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'vous';
  const today = new Date();
  const dateLabel = format(today, 'EEEE d MMMM', { locale: fr });
  const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  useEffect(() => {
    (async () => {
      try {
        const todayStr = format(today, 'yyyy-MM-dd');

        const [rentalsRes, kpiActiveRes, kpiPrepRes] = await Promise.all([
          supabase
            .from('rentals')
            .select('id, title, reference_code, status, start_date, end_date, clients(name)')
            .or(`start_date.eq.${todayStr},end_date.eq.${todayStr}`)
            .not('status', 'eq', 'cancelled')
            .not('type', 'eq', 'internal')
            .order('start_date', { ascending: true }),
          supabase
            .from('rentals')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'confirmed', 'preparing', 'in_progress'])
            .not('type', 'eq', 'internal'),
          supabase
            .from('rentals')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'confirmed')
            .not('type', 'eq', 'internal'),
        ]);

        const delivTodayRes = await supabase
          .from('rentals')
          .select('id', { count: 'exact', head: true })
          .eq('start_date', todayStr)
          .in('status', ['confirmed', 'preparing', 'in_progress'])
          .not('type', 'eq', 'internal');

        setTodayRentals((rentalsRes.data as TodayRental[]) || []);
        setKpis({
          activeRentals: kpiActiveRes.count ?? 0,
          pendingPreps: kpiPrepRes.count ?? 0,
          deliveriesToday: delivTodayRes.count ?? 0,
        });
      } catch (err) {
        console.error('MobileHome fetch error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <MobileLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bonjour {firstName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{dateCapitalized}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{kpis.activeRentals}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">Projets actifs</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 text-center">
          <div className="text-2xl font-bold text-amber-500">{kpis.pendingPreps}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">Prép. en attente</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600">{kpis.deliveriesToday}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">Livraisons auj.</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-6">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Actions rapides</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/m/scan')}
            className="flex-1 flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm py-4 active:scale-[.97] transition-transform"
          >
            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <ScanLine className="h-5 w-5 text-indigo-600" />
            </div>
            <span className="text-xs font-medium text-gray-700">Scanner QR</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/m/preparations')}
            className="flex-1 flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm py-4 active:scale-[.97] transition-transform"
          >
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-gray-700">Préparer</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/m/sinistre')}
            className="flex-1 flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm py-4 active:scale-[.97] transition-transform"
          >
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <span className="text-xs font-medium text-gray-700">Sinistre</span>
          </button>
        </div>
      </div>

      {/* Today's rentals */}
      <div>
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Aujourd'hui</p>
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Chargement...</div>
        ) : todayRentals.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-6 text-center text-gray-400 text-sm">
            Aucun projet prévu aujourd'hui
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {todayRentals.map((rental) => (
              <button
                key={rental.id}
                type="button"
                onClick={() => navigate(`/m/projets/${rental.id}`)}
                className="w-full text-left border border-gray-200 rounded-xl bg-white shadow-sm active:scale-[.98] transition-transform px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {rental.title || rental.reference_code || 'Sans titre'}
                    </p>
                    {rental.clients?.name && (
                      <p className="text-sm text-gray-500 truncate">{rental.clients.name}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    {statusLabel[rental.status] || rental.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                  <span>{format(new Date(rental.start_date), 'd MMM', { locale: fr })}</span>
                  <span>→</span>
                  <span>{format(new Date(rental.end_date), 'd MMM', { locale: fr })}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default MobileHome;
