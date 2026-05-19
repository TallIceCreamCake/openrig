import React, { useEffect, useMemo, useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Euro, 
  Package, 
  Users, 
  Calendar,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useStats } from '../../hooks/useStats';
import { supabase } from '../../lib/supabase';
import { startOfMonth, endOfMonth } from 'date-fns';

const OverviewTab = () => {
  const data = useDashboardData();
  const stats = useStats();
  const [newClientsThisMonth, setNewClientsThisMonth] = useState(0);

  useEffect(() => {
    const load = async () => {
      const s = startOfMonth(new Date()).toISOString();
      const e = endOfMonth(new Date()).toISOString();
      const { data, error } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', s)
        .lte('created_at', e);
      if (!error) setNewClientsThisMonth((data as any)?.length ?? (data === null ? (error ? 0 : 0) : 0));
      // head:true returns null data; rely on count via second query
      const { count } = await supabase
        .from('clients')
        .select('*', { head: true, count: 'exact' })
        .gte('created_at', s)
        .lte('created_at', e);
      setNewClientsThisMonth(count || 0);
    };
    load();
  }, []);

  const monthly = stats.monthlyRevenue;
  const thisMonth = monthly[monthly.length - 1]?.revenue || 0;
  const prevMonth = monthly[monthly.length - 2]?.revenue || 0;
  const growth = prevMonth === 0 ? 0 : Number((((thisMonth - prevMonth) / prevMonth) * 100).toFixed(1));
  const activeRentals = data.rentals.filter(r => ['pending','confirmed','in_progress'].includes(r.status)).length;
  const utilization = data.equipmentStatus.total > 0 ? Math.round((data.equipmentStatus.in_use / data.equipmentStatus.total) * 100) : 0;

  const kpis = [
    { title: "Chiffre d'affaires mensuel", value: `${Math.round(thisMonth).toLocaleString()}€`, change: `${growth >= 0 ? '+' : ''}${growth}%`, trend: growth >= 0 ? 'up' : 'down', icon: Euro, color: 'text-green-600', bgColor: 'bg-green-100' },
    { title: 'Locations actives', value: String(activeRentals), change: '', trend: 'up', icon: Calendar, color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { title: "Taux d'utilisation", value: `${utilization}%`, change: '', trend: 'up', icon: Package, color: 'text-purple-600', bgColor: 'bg-purple-100' },
    { title: 'Nouveaux clients', value: String(newClientsThisMonth), change: '', trend: 'up', icon: Users, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  ] as const;

  const [topEquipment, setTopEquipment] = useState<Array<{ name: string; rentals: number }>>([]);
  useEffect(() => {
    const loadTop = async () => {
      const entries = Array.from(stats.topEquipment.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
      if (entries.length === 0) { setTopEquipment([]); return; }
      const ids = entries.map(([id]) => id);
      const { data: eqs } = await supabase.from('equipment').select('id,name').in('id', ids);
      const nameMap = new Map((eqs || []).map((e: any) => [e.id, e.name] as const));
      setTopEquipment(entries.map(([id, cnt]) => ({ name: nameMap.get(id) || id, rentals: cnt })));
    };
    loadTop();
  }, [stats.topEquipment]);

  const [recentAlerts, setRecentAlerts] = useState<Array<{ type: 'warning'|'success'|'info', message: string, time: string }>>([]);
  useEffect(() => {
    const loadAlerts = async () => {
      const { data: maint } = await supabase
        .from('maintenance_tasks')
        .select('title, scheduled_date, status')
        .order('scheduled_date', { ascending: true })
        .limit(5);
      const alerts = (maint || []).map((m: any) => ({ type: m.status === 'completed' ? 'success' : 'warning', message: m.title || 'Maintenance', time: m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : '' }));
      setRecentAlerts(alerts);
    };
    loadAlerts();
  }, []);

  return (
    <div className="space-y-6">
      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          const TrendIcon = kpi.trend === 'up' ? TrendingUp : TrendingDown;
          
          return (
            <div key={index} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div className={`p-3 rounded-full ${kpi.bgColor}`}>
                  <Icon className={`h-6 w-6 ${kpi.color}`} />
                </div>
                <div className={`flex items-center space-x-1 ${
                  kpi.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  <TrendIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{kpi.change}</span>
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-500">{kpi.title}</h3>
                <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Equipment this month (by count) */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Top Équipements</h3>
            <p className="text-sm text-gray-500">Les plus loués ce mois</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {topEquipment.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600">
                          {index + 1}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.rentals} locations</p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-500">&nbsp;</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Alertes Récentes</h3>
            <p className="text-sm text-gray-500">Notifications importantes</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentAlerts.map((alert, index) => {
                const getIcon = () => {
                  switch (alert.type) {
                    case 'warning':
                      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
                    case 'success':
                      return <CheckCircle className="h-4 w-4 text-green-500" />;
                    default:
                      return <Package className="h-4 w-4 text-blue-500" />;
                  }
                };

                return (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{alert.message}</p>
                      <p className="text-xs text-gray-500 mt-1">Il y a {alert.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats derived */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Statistiques Rapides</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{data.rentals.length}</p>
              <p className="text-sm text-gray-500">Locations totales</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{utilization}%</p>
              <p className="text-sm text-gray-500">Taux satisfaction</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{
                (() => {
                  if (data.rentals.length === 0) return '0j';
                  const avg = data.rentals.reduce((s, r) => s + Math.max(1, Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / (1000*60*60*24))), 0) / data.rentals.length;
                  return `${avg.toFixed(1)}j`;
                })()
              }</p>
              <p className="text-sm text-gray-500">Durée moyenne</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{data.equipmentStatus.total}</p>
              <p className="text-sm text-gray-500">Équipements actifs</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
