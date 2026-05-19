import React, { useState, useEffect, useCallback, useMemo } from 'react';
import CalendarView from '../components/calendar/CalendarView';
import { CalendarEvent } from '../types/calendar';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/TranslationContext';
import { addMinutes } from 'date-fns';

const Calendar = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    rentals: true,
    logistics: true,
    maintenance: true,
    manual: true,
  });
  const navigate = useNavigate();
  const { t } = useTranslation();

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('start_date', { ascending: true });
      if (error) throw error;
      const persisted = ((data || []) as unknown as CalendarEvent[]).filter((event) => {
        const isLinked = Boolean(event.rental_id || event.service_id || event.maintenance_id);
        const isManualType = ['task', 'meeting', 'reminder'].includes(event.type);
        return !isLinked && isManualType;
      });

      const { data: rents, error: rErr } = await supabase
        .from('rentals')
        .select(`*, clients(name)`) 
        .order('start_date', { ascending: true });
      if (rErr) throw rErr;
      const derived: CalendarEvent[] = (rents || []).map((r: any) => {
        const clientName = r.clients?.name || t('calendar.eventTitle.fallbackClient');
        const title =
          r.type === 'service'
            ? t('calendar.eventTitle.service', { client: clientName })
            : r.type === 'sale'
              ? t('calendar.eventTitle.sale', { client: clientName })
              : t('calendar.eventTitle.rental', { client: clientName });
        return {
          id: `rental-${r.id}`,
          title,
          description: r.location || undefined,
          type: r.type === 'sale' ? 'sale' : r.type,
          start_date: r.start_date,
          end_date: r.end_date,
          color: r.color || undefined,
          rental_id: r.type === 'service' ? null : r.id,
          service_id: r.type === 'service' ? r.id : null,
        };
      }) as any;

      const { data: assignments, error: aErr } = await supabase
        .from('vehicle_assignments')
        .select(`
          id,
          rental_id,
          delivery_at,
          appointment_at,
          return_delivery_at,
          return_appointment_at,
          vehicle:vehicles(id, name, license_plate),
          rental:rentals(id, type, location, delivery_address, pickup_address, clients(name))
        `);
      if (aErr) {
        console.warn('calendar: vehicle assignments not available', aErr);
      }

      const logisticsEvents: CalendarEvent[] = [];
      (assignments || []).forEach((row: any) => {
        const clientName = row.rental?.clients?.name || t('calendar.eventTitle.fallbackClient');
        const vehicleLabel = row.vehicle
          ? `${row.vehicle.name}${row.vehicle.license_plate ? ` (${row.vehicle.license_plate})` : ''}`
          : '';
        const deliveryAddress = row.rental?.delivery_address || row.rental?.location || '';
        const pickupAddress = row.rental?.pickup_address || row.rental?.location || deliveryAddress;
        const makeEvent = (type: CalendarEvent['type'], dateValue: string | null, label: string, address: string) => {
          if (!dateValue) return;
          const start = new Date(dateValue);
          const end = addMinutes(start, 60);
          logisticsEvents.push({
            id: `va-${row.id}-${type}`,
            title: `${label} — ${clientName}${vehicleLabel ? ` · ${vehicleLabel}` : ''}`,
            description: address || undefined,
            type,
            start_date: start.toISOString(),
            end_date: end.toISOString(),
            rental_id: row.rental_id,
            vehicle_id: row.vehicle?.id,
            resource_label: vehicleLabel || undefined,
          });
        };
        makeEvent('delivery', row.delivery_at, t('calendar.eventTitle.delivery'), deliveryAddress);
        makeEvent('appointment', row.appointment_at, t('calendar.eventTitle.appointment'), deliveryAddress);
        makeEvent('return_delivery', row.return_delivery_at, t('calendar.eventTitle.returnDelivery'), pickupAddress);
        makeEvent('return_appointment', row.return_appointment_at, t('calendar.eventTitle.returnAppointment'), pickupAddress);
      });

      const { data: maintenanceTasks, error: mErr } = await supabase
        .from('maintenance_tasks')
        .select('id, title, description, scheduled_date, completed_date, status, equipment:equipment(name)');
      if (mErr) {
        console.warn('calendar: maintenance tasks not available', mErr);
      }
      const maintenanceEvents: CalendarEvent[] = (maintenanceTasks || []).map((task: any) => {
        const equipmentName = task.equipment?.name;
        const title = equipmentName
          ? `${t('calendar.eventTitle.maintenance')} — ${equipmentName}`
          : `${t('calendar.eventTitle.maintenance')} — ${task.title}`;
        const start = new Date(task.scheduled_date);
        const end = task.completed_date ? new Date(task.completed_date) : addMinutes(start, 60);
        return {
          id: `maintenance-${task.id}`,
          title,
          description: task.description || undefined,
          type: 'maintenance',
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          maintenance_id: task.id,
        };
      });

      const merged = [
        ...persisted,
        ...derived,
        ...logisticsEvents,
        ...maintenanceEvents,
      ];
      setEvents(merged);
    } catch (e) {
      console.error(e);
      toast.error(t('calendar.toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleEventAdd = (eventData: Partial<CalendarEvent>) => {
    (async () => {
      try {
        const payload: any = {
          title: eventData.title,
          description: eventData.description || null,
          type: eventData.type || 'task',
          start_date: eventData.start_date,
          end_date: eventData.end_date,
          color: (eventData as any).color || null,
          rental_id: (eventData as any).rental_id || null,
          service_id: (eventData as any).service_id || null,
        };
        const { data, error } = await supabase.from('calendar_events').insert([payload]).select().single();
        if (error) throw error;
        await fetchEvents();
        toast.success(t('calendar.toast.addSuccess'));
      } catch (e) {
        console.error(e);
        toast.error(t('calendar.toast.addError'));
      }
    })();
  };

  const handleEventUpdate = (id: string, eventData: Partial<CalendarEvent>) => {
    (async () => {
      try {
        const payload: any = {
          title: eventData.title,
          description: eventData.description || null,
          type: eventData.type,
          start_date: eventData.start_date,
          end_date: eventData.end_date,
          color: (eventData as any)?.color || null,
        };
        const { error } = await supabase.from('calendar_events').update(payload).eq('id', id);
        if (error) throw error;
        await fetchEvents();
        toast.success(t('calendar.toast.updateSuccess'));
      } catch (e) {
        console.error(e);
        toast.error(t('calendar.toast.updateError'));
      }
    })();
  };

  const handleEventDelete = (id: string) => {
    (async () => {
      try {
        const { error } = await supabase.from('calendar_events').delete().eq('id', id);
        if (error) throw error;
        await fetchEvents();
        toast.success(t('calendar.toast.deleteSuccess'));
      } catch (e) {
        console.error(e);
        toast.error(t('calendar.toast.deleteError'));
      }
    })();
  };

  const filteredEvents = useMemo(() => {
    const isManualType = (type: CalendarEvent['type']) => ['task', 'meeting', 'reminder'].includes(type);
    const isRentalType = (type: CalendarEvent['type']) => ['rental', 'service', 'sale'].includes(type);
    const isLogisticsType = (type: CalendarEvent['type']) => ['delivery', 'appointment', 'return_delivery', 'return_appointment'].includes(type);
    return events.filter((event) => {
      if (event.type === 'maintenance') return filters.maintenance;
      if (isLogisticsType(event.type)) return filters.logistics;
      if (isRentalType(event.type)) return filters.rentals;
      if (isManualType(event.type)) return filters.manual;
      return true;
    });
  }, [events, filters]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">{t('calendar.title')}</h1>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <span className="text-sm font-medium text-gray-600">{t('calendar.filters.title')}</span>
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, rentals: !prev.rentals }))}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border ${
            filters.rentals
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-white text-gray-500 border-gray-200'
          }`}
        >
          {t('calendar.filters.rentals')}
        </button>
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, logistics: !prev.logistics }))}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border ${
            filters.logistics
              ? 'bg-sky-50 text-sky-700 border-sky-200'
              : 'bg-white text-gray-500 border-gray-200'
          }`}
        >
          {t('calendar.filters.logistics')}
        </button>
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, maintenance: !prev.maintenance }))}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border ${
            filters.maintenance
              ? 'bg-orange-50 text-orange-700 border-orange-200'
              : 'bg-white text-gray-500 border-gray-200'
          }`}
        >
          {t('calendar.filters.maintenance')}
        </button>
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, manual: !prev.manual }))}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border ${
            filters.manual
              ? 'bg-slate-100 text-slate-700 border-slate-200'
              : 'bg-white text-gray-500 border-gray-200'
          }`}
        >
          {t('calendar.filters.manual')}
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <CalendarView
          events={filteredEvents}
          onEventAdd={handleEventAdd}
          onEventUpdate={handleEventUpdate}
          onEventDelete={handleEventDelete}
          onNavigateToEvent={(target) => {
            navigate(target);
          }}
        />
      )}
    </div>
  );
};

export default Calendar;
