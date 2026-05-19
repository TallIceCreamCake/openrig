import { useEffect, useMemo, useState } from 'react';
import { subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Rental } from '../types/rental';
import { CalendarEvent } from '../types/calendar';
import { Personnel, PersonnelActivity } from '../types/personnel';

type RevenueData = {
  today: number;
  thisWeek: number;
  thisMonth: number;
  growth: number; // vs previous week in %
};

type EquipmentStatus = {
  available: number;
  in_use: number;
  maintenance: number; // open maintenance entries
  total: number;
};

type TopClient = {
  id: string;
  name: string;
  avatar?: string | null;
  totalSpent: number;
  rentalsCount: number;
  lastRental: string;
};

type ActivityItem = {
  id: string;
  type: 'rental_created' | 'rental_completed' | 'equipment_added' | 'client_added' | 'maintenance';
  title: string;
  description: string;
  timestamp: string;
  actionUrl?: string;
  avatar?: string | null;
  color?: string | null;
};

type UpcomingRental = {
  id: string;
  project_name: string;
  client_name: string;
  client_avatar?: string | null;
  start_date: string;
  end_date: string;
  location?: string | null;
  equipment_count: number;
  status: 'confirmed' | 'pending';
  color?: string | null;
};

export const useDashboardData = () => {
  const [loading, setLoading] = useState(true);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [rentalEquipmentCounts, setRentalEquipmentCounts] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [revenue, setRevenue] = useState<RevenueData>({ today: 0, thisWeek: 0, thisMonth: 0, growth: 0 });
  const [equipmentStatus, setEquipmentStatus] = useState<EquipmentStatus>({ available: 0, in_use: 0, maintenance: 0, total: 0 });
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [maintenanceTasks, setMaintenanceTasks] = useState<any[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [personnelActivities, setPersonnelActivities] = useState<PersonnelActivity[]>([]);

  useEffect(() => {
    const loadAll = async () => {
      try {
        setLoading(true);

        // Rentals with client name and items
        const { data: rentalsData, error: rentalsError } = await supabase
          .from('rentals')
          .select(`
            *,
            clients(name, image_url),
            rental_items(id, quantity)
          `)
          .order('start_date', { ascending: true });
        if (rentalsError) throw rentalsError;

        const mappedRentals: Rental[] = (rentalsData || []).map((r: any) => ({
          id: r.id,
          client_id: r.client_id,
          client_name: r.clients?.name || 'Client inconnu',
          type: r.type,
          start_date: r.start_date,
          end_date: r.end_date,
          location: r.location,
          status: r.status,
          total_price: Number(r.total_price || 0),
          discount_type: r.discount_type,
          discount_value: r.discount_value,
          generate_invoice: !!r.generate_invoice,
          color: r.color,
          reference_code: r.reference_code,
          description: r.description,
          title: r.title,
          items: [],
          created_at: r.created_at,
        }));
        setRentals(mappedRentals);
        const equipmentCountsByRentalId = (rentalsData || []).reduce<Record<string, number>>((acc, row: any) => {
          const totalQuantity = (row?.rental_items || []).reduce(
            (sum: number, item: any) => sum + Math.max(0, Number(item?.quantity || 0)),
            0,
          );
          acc[row.id] = totalQuantity;
          return acc;
        }, {});
        setRentalEquipmentCounts(equipmentCountsByRentalId);

        // Calendar events (keep last 3 days to today + 3 days)
        const from = startOfDay(subDays(new Date(), 3)).toISOString();
        const to = endOfDay(subDays(new Date(), -3)).toISOString();
        const { data: calendarData, error: calendarErr } = await supabase
          .from('calendar_events')
          .select('*')
          .gte('start_date', from)
          .lte('end_date', to)
          .order('start_date', { ascending: true });
        if (calendarErr) throw calendarErr;
        const persisted = (calendarData || []).map((e: any) => ({
          id: e.id,
          title: e.title,
          description: e.description || undefined,
          type: e.type,
          start_date: e.start_date,
          end_date: e.end_date,
          color: e.color || undefined,
          rental_id: e.rental_id || undefined,
          service_id: e.service_id || undefined,
          maintenance_id: e.maintenance_id || undefined,
        }))
          .filter((event: CalendarEvent) => {
            const isLinked = Boolean(event.rental_id || event.service_id || event.maintenance_id);
            const isManualType = ['task', 'meeting', 'reminder'].includes(event.type);
            return !isLinked && isManualType;
          });

        // Also derive events from rentals in range (fallback if not persisted)
        const rentalsInRange = mappedRentals.filter(r => {
          const s = new Date(r.start_date).getTime();
          const e = new Date(r.end_date).getTime();
          const fromTs = new Date(from).getTime();
          const toTs = new Date(to).getTime();
          return (s <= toTs && e >= fromTs);
        });
        const derivedFromRentals: CalendarEvent[] = rentalsInRange
          .map(r => ({
            id: `rental-${r.id}`,
            title: `${r.type === 'service' ? 'Prestation' : r.type === 'sale' ? 'Vente' : 'Location'} - ${r.client_name}`,
            description: r.location,
            type: (r.type === 'sale' ? 'sale' : r.type) as any,
            start_date: r.start_date,
            end_date: r.end_date,
            color: r.color || undefined,
            rental_id: r.type === 'service' ? undefined : (r.id as any),
            service_id: r.type === 'service' ? (r.id as any) : undefined,
          }));
        setEvents([...persisted, ...derivedFromRentals]);

        // Revenue from payments table
        const todayStart = startOfDay(new Date()).toISOString();
        const todayEnd = endOfDay(new Date()).toISOString();
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
        const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
        const monthStart = startOfMonth(new Date()).toISOString();
        const monthEnd = endOfMonth(new Date()).toISOString();

        const [pToday, pWeek, pMonth, pPrevWeek] = await Promise.all([
          supabase.from('payments').select('amount, payment_date').gte('payment_date', todayStart).lte('payment_date', todayEnd),
          supabase.from('payments').select('amount, payment_date').gte('payment_date', weekStart).lte('payment_date', weekEnd),
          supabase.from('payments').select('amount, payment_date').gte('payment_date', monthStart).lte('payment_date', monthEnd),
          supabase.from('payments').select('amount, payment_date').gte('payment_date', startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }).toISOString()).lte('payment_date', endOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }).toISOString()),
        ]);
        const sum = (rows?: any[] | null) => (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        const todayAmount = sum(pToday.data);
        const weekAmount = sum(pWeek.data);
        const monthAmount = sum(pMonth.data);
        const prevWeekAmount = Math.max(0, sum(pPrevWeek.data));
        const growth = prevWeekAmount === 0 ? 0 : Number((((weekAmount - prevWeekAmount) / prevWeekAmount) * 100).toFixed(1));
        setRevenue({ today: todayAmount, thisWeek: weekAmount, thisMonth: monthAmount, growth });

        // Equipment utilization (unit-based): totals from stock, rented units overlapping today, maintenance units open
        const utilTodayStart = todayStart;
        const utilTodayEnd = todayEnd;
        const stockRes = await supabase.from('equipment_stock').select('quantity');
        const totalUnits = (stockRes.data || []).reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
        const rentRes = await supabase
          .from('rental_items')
          .select('quantity, rental_id, equipment_id, rentals!inner(start_date,end_date,status)')
          .filter('rentals.status', 'in', '(pending,confirmed,in_progress)')
          .lte('rentals.start_date', utilTodayEnd)
          .gte('rentals.end_date', utilTodayStart);
        const rentedUnits = (rentRes.data || []).reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
        const maintHead = await supabase
          .from('equipment_unit_maintenance_history')
          .select('id', { count: 'exact', head: true })
          .in('status', ['scheduled', 'in_progress']);
        const maintenanceUnits = maintHead.count || 0;
        const availableUnits = Math.max(0, totalUnits - rentedUnits - maintenanceUnits);
        setEquipmentStatus({
          available: availableUnits,
          in_use: rentedUnits,
          maintenance: maintenanceUnits,
          total: totalUnits,
        });

        // Top clients by sum of payments (fallback: invoices amount_ttc)
        const { data: invoices, error: invErr } = await supabase
          .from('invoices')
          .select('client_id, amount_ttc, created_at')
          .not('client_id', 'is', null);
        if (invErr) throw invErr;
        const totals = new Map<string, { total: number; count: number; last: string }>();
        (invoices || []).forEach((inv: any) => {
          const id = inv.client_id as string;
          const cur = totals.get(id) || { total: 0, count: 0, last: '1970-01-01' };
          cur.total += Number(inv.amount_ttc || 0);
          cur.count += 1;
          cur.last = new Date(inv.created_at) > new Date(cur.last) ? inv.created_at : cur.last;
          totals.set(id, cur);
        });
        const clientIds = Array.from(totals.keys());
        const { data: clients } = clientIds.length
          ? await supabase.from('clients').select('id,name,image_url').in('id', clientIds)
          : { data: [] as any };
        const idToClient = new Map((clients || []).map((c: any) => [c.id, c] as const));
        const top = Array.from(totals.entries())
          .map(([id, v]) => ({
            id,
            name: idToClient.get(id)?.name || 'Client',
            avatar: idToClient.get(id)?.image_url || null,
            totalSpent: Math.round(v.total),
            rentalsCount: v.count,
            lastRental: v.last,
          }))
          .sort((a, b) => b.totalSpent - a.totalSpent)
          .slice(0, 5);
        setTopClients(top);

        // Recent activity: rentals, equipment, clients, maintenance (merge & sort)
        const [rAct, eAct, cAct, mAct] = await Promise.all([
          supabase.from('rentals').select('id, created_at, total_price, color').order('created_at', { ascending: false }).limit(5),
          supabase.from('equipment').select('id, name, created_at').order('created_at', { ascending: false }).limit(5),
          supabase.from('clients').select('id, name, image_url, created_at').order('created_at', { ascending: false }).limit(5),
          supabase.from('maintenance_tasks').select('id, title, created_at, status').order('created_at', { ascending: false }).limit(5),
        ]);
        const acts: ActivityItem[] = [];
        (rAct.data || []).forEach((r: any) => acts.push({
          id: r.id,
          type: 'rental_created',
          title: 'Nouvelle location',
          description: `${Math.round(Number(r.total_price || 0))}€`,
          timestamp: r.created_at,
          actionUrl: `/rentals/${r.id}`,
          color: typeof r.color === 'string' ? r.color : null,
        }));
        (eAct.data || []).forEach((e: any) => acts.push({ id: e.id, type: 'equipment_added', title: 'Équipement ajouté', description: e.name, timestamp: e.created_at, actionUrl: `/equipment/${e.id}` }));
        (cAct.data || []).forEach((c: any) => acts.push({ id: c.id, type: 'client_added', title: 'Nouveau client', description: c.name, timestamp: c.created_at, actionUrl: `/clients/${c.id}`, avatar: c.image_url }));
        (mAct.data || []).forEach((m: any) => acts.push({
          id: m.id,
          type: 'maintenance',
          title: 'Maintenance',
          description: m.title || 'Tâche de maintenance',
          timestamp: m.created_at,
          actionUrl: `/maintenance/${m.id}`,
        }));
        acts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setActivities(acts.slice(0, 10));

        // Maintenance tasks (pending/in_progress)
        const { data: maintTasks } = await supabase
          .from('maintenance_tasks')
          .select('id, equipment_id, title, description, type, priority, scheduled_date, status')
          .in('status', ['pending', 'in_progress'] as any)
          .order('scheduled_date', { ascending: true })
          .limit(10);
        // Map to widget-friendly shape; we need equipment name lookup
        const eqIds = Array.from(new Set((maintTasks || []).map((t: any) => t.equipment_id).filter(Boolean)));
        const { data: eqs } = eqIds.length ? await supabase.from('equipment').select('id,name').in('id', eqIds) : { data: [] as any };
        const eqMap = new Map((eqs || []).map((e: any) => [e.id, e.name] as const));
        const mappedMaint = (maintTasks || []).map((t: any) => ({
          id: t.id,
          equipment_id: t.equipment_id,
          equipment_name: eqMap.get(t.equipment_id) || 'Équipement',
          type: t.type,
          priority: t.priority,
          scheduled_date: t.scheduled_date,
          status: t.status,
          description: t.description || '',
        }));
        setMaintenanceTasks(mappedMaint);

        // Personnel and activities for gantt
        const [
          { data: personnelData, error: personnelError },
          { data: activityData, error: activityError }
        ] = await Promise.all([
          supabase.from('personnel').select('*').order('created_at', { ascending: false }),
          supabase.from('personnel_activities').select('*').order('start_time', { ascending: false })
        ]);

        if (personnelError) throw personnelError;
        if (activityError) throw activityError;

        const mappedPersonnel = (personnelData || []) as Personnel[];
        setPersonnel(mappedPersonnel);

        const mappedActivities = (activityData || []).map((activity: any) => {
          const p = mappedPersonnel.find(person => person.id === activity.personnel_id);
          return {
            ...activity,
            personnel_name: p ? `${p.first_name} ${p.last_name}` : 'Personnel inconnu'
          } as PersonnelActivity;
        });
        setPersonnelActivities(mappedActivities);
      } catch (e) {
        console.error('Error loading dashboard data', e);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, []);

  const upcomingRentals: UpcomingRental[] = useMemo(() => {
    const now = new Date();
    return rentals
      .filter(r => new Date(r.start_date) >= startOfDay(now))
      .map(r => ({
        id: r.id,
        project_name: (typeof r.title === 'string' && r.title.trim())
          || (typeof r.reference_code === 'string' && r.reference_code.trim())
          || `Projet ${r.id.slice(0, 8).toUpperCase()}`,
        client_name: r.client_name,
        client_avatar: null,
        start_date: r.start_date,
        end_date: r.end_date,
        location: r.location,
        equipment_count: Math.max(0, Number(rentalEquipmentCounts[r.id] || 0)),
        status: (r.status === 'confirmed' ? 'confirmed' : 'pending'),
        color: r.color || null,
      }))
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [rentals, rentalEquipmentCounts]);

  return {
    loading,
    rentals,
    events,
    revenue,
    equipmentStatus,
    topClients,
    activities,
    upcomingRentals,
    maintenanceTasks,
    personnel,
    personnelActivities,
  };
};
