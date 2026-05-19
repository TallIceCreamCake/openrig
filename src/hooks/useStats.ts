import { useEffect, useMemo, useState } from 'react';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { supabase } from '../lib/supabase';

export const useStats = () => {
  const [loading, setLoading] = useState(true);
  const [rentals, setRentals] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [rentalItems, setRentalItems] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const since = subMonths(new Date(), 6);
        const r = await supabase
          .from('rentals')
          .select('id,type,start_date,end_date,location,created_at,status')
          .gte('start_date', startOfMonth(since).toISOString());
        const i = await supabase
          .from('invoices')
          .select('id,amount_ttc,created_at,rental_id,client_id')
          .gte('created_at', startOfMonth(since).toISOString());
        const c = await supabase
          .from('clients')
          .select('id,created_at')
          .gte('created_at', startOfMonth(since).toISOString());
        const ri = await supabase
          .from('rental_items')
          .select('equipment_id,rental_id');
        setRentals(r.data || []);
        setInvoices(i.data || []);
        setClients(c.data || []);
        setRentalItems(ri.data || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const months = useMemo(() => {
    return Array.from({ length: 6 }).map((_, idx) => {
      const d = subMonths(new Date(), 5 - idx);
      return { label: format(d, 'MMM'), start: startOfMonth(d), end: endOfMonth(d) };
    });
  }, []);

  const monthlyRevenue = useMemo(() => {
    return months.map(({ label, start, end }) => {
      const rev = invoices
        .filter(inv => new Date(inv.created_at) >= start && new Date(inv.created_at) <= end)
        .reduce((s, inv) => s + Number(inv.amount_ttc || 0), 0);
      const rcount = rentals.filter(r => new Date(r.start_date) >= start && new Date(r.start_date) <= end).length;
      return { month: label, revenue: rev, rentals: rcount };
    });
  }, [months, invoices, rentals]);

  const rentalsByMonth = useMemo(() => {
    return months.map(({ label, start, end }) => ({
      month: label,
      rentals: rentals.filter(r => new Date(r.start_date) >= start && new Date(r.start_date) <= end).length,
      avgDuration: (() => {
        const inMonth = rentals.filter(r => new Date(r.start_date) >= start && new Date(r.start_date) <= end);
        if (inMonth.length === 0) return 0;
        const avg = inMonth.reduce((s, r) => s + Math.max(1, Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / (1000*60*60*24))), 0) / inMonth.length;
        return Number(avg.toFixed(1));
      })()
    }));
  }, [months, rentals]);

  const newClientsByMonth = useMemo(() => {
    return months.map(({ label, start, end }) => ({
      month: label,
      count: clients.filter(c => new Date(c.created_at) >= start && new Date(c.created_at) <= end).length,
    }));
  }, [months, clients]);

  const rentalsByType = useMemo(() => {
    const recent = rentals.filter(r => new Date(r.start_date) >= subMonths(new Date(), 3));
    const total = recent.length || 1;
    const m = new Map<string, { count: number; avgValue: number }>();
    for (const r of recent) {
      const key = r.type;
      const invSum = invoices.filter(inv => inv.rental_id === r.id).reduce((s, x) => s + Number(x.amount_ttc || 0), 0);
      const cur = m.get(key) || { count: 0, avgValue: 0 };
      cur.count += 1;
      cur.avgValue += invSum;
      m.set(key, cur);
    }
    return Array.from(m.entries()).map(([type, v]) => ({
      type,
      count: v.count,
      percentage: Math.round((v.count / total) * 100),
      avgValue: v.count ? Math.round(v.avgValue / v.count) : 0,
    }));
  }, [rentals, invoices]);

  const locations = useMemo(() => {
    const recent = rentals.filter(r => new Date(r.start_date) >= subMonths(new Date(), 3));
    const m = new Map<string, { rentals: number; revenue: number }>();
    for (const r of recent) {
      const loc = r.location || '—';
      const rev = invoices.filter(inv => inv.rental_id === r.id).reduce((s, x) => s + Number(x.amount_ttc || 0), 0);
      const cur = m.get(loc) || { rentals: 0, revenue: 0 };
      cur.rentals += 1;
      cur.revenue += rev;
      m.set(loc, cur);
    }
    return Array.from(m.entries())
      .map(([location, v]) => ({ location, rentals: v.rentals, revenue: v.revenue }))
      .sort((a, b) => b.rentals - a.rentals)
      .slice(0, 5);
  }, [rentals, invoices]);

  const topEquipment = useMemo(() => {
    const since = startOfMonth(new Date());
    const relevantRentals = new Set(rentals.filter(r => new Date(r.start_date) >= since).map(r => r.id));
    const counts = new Map<string, number>();
    for (const it of rentalItems) {
      if (relevantRentals.has(it.rental_id)) {
        if (!it.equipment_id) continue;
        counts.set(it.equipment_id, (counts.get(it.equipment_id) || 0) + 1);
      }
    }
    return counts;
  }, [rentals, rentalItems]);

  return {
    loading,
    monthlyRevenue,
    rentalsByMonth,
    newClientsByMonth,
    rentalsByType,
    locations,
    topEquipment,
  };
};
