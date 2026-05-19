import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, ChevronDown } from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useUIPreferences } from '../../../hooks/useUIPreferences';
import { supabase } from '../../../lib/supabase';
import { useTranslation } from '../../../context/TranslationContext';

interface EquipmentStock {
  id: string;
  equipment_id: string;
  equipment_name: string;
  daily_stock: { [date: string]: number };
  maintenance_count?: number;
}

interface StockPlanningConfig {
  equipment_lines: EquipmentStock[];
  current_week: string;
}

type BasicEquipment = { id: string; name: string };

const defaultConfig: StockPlanningConfig = {
  equipment_lines: [],
  current_week: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
};

const StockPlanningWidget: React.FC = () => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? enUS : fr;
  const [config, setConfig] = useUIPreferences<StockPlanningConfig>('stock_planning_widget', defaultConfig);
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState<string | null>(null);
  const [allEquipment, setAllEquipment] = useState<BasicEquipment[]>([]);
  const [loading, setLoading] = useState(false);

  const currentWeekStart = useMemo(() => {
    const d = new Date(config.current_week);
    return isNaN(d.getTime()) ? startOfWeek(new Date(), { weekStartsOn: 1 }) : d;
  }, [config.current_week]);
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(currentWeekStart, i));

  const getStockStyle = (stock: number | null | undefined, total: number | null | undefined) => {
    const value = Number(stock ?? 0);
    const totalValue = Number(total ?? 0);
    const isTotalMaintenance = totalValue > 0 && value <= 0;

    if (isTotalMaintenance) {
      return {
        container: 'bg-red-500 text-white border border-red-700 relative',
        render: (
          <>
            <span className="absolute inset-0 flex items-center justify-center font-bold text-base">✕</span>
          </>
        )
      };
    }

    if (value > 5) {
      return { container: 'bg-green-200 text-green-800', render: value };
    }
    if (value > 0) {
      return { container: 'bg-yellow-200 text-yellow-800', render: value };
    }
    if (value === 0) {
      return { container: 'bg-orange-200 text-orange-800', render: value };
    }
    return { container: 'bg-red-200 text-red-800', render: value };
  };

  const handlePreviousWeek = () => {
    const newWeek = format(subWeeks(currentWeekStart, 1), 'yyyy-MM-dd');
    setConfig({
      ...config,
      current_week: newWeek
    });
  };

  const handleNextWeek = () => {
    const newWeek = format(addWeeks(currentWeekStart, 1), 'yyyy-MM-dd');
    setConfig({
      ...config,
      current_week: newWeek
    });
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('equipment').select('id,name').order('name', { ascending: true }).limit(200);
      setAllEquipment((data || []) as BasicEquipment[]);
    };
    load();
  }, []);

  const getAvailableEquipment = (currentLineId?: string) => {
    const selected = new Set(config.equipment_lines.map(line => line.equipment_id));
    if (currentLineId) {
      const cur = config.equipment_lines.find(l => l.id === currentLineId);
      if (cur) selected.delete(cur.equipment_id);
    }
    return allEquipment.filter(eq => !selected.has(eq.id));
  };

  const computeDailyAvailability = async (equipmentIds: string[]) => {
    if (!equipmentIds.length) return {} as Record<string, Record<string, number>>;
    setLoading(true);
    try {
      const start = format(currentWeekStart, 'yyyy-MM-dd');
      const end = format(addDays(currentWeekStart, 4), 'yyyy-MM-dd');
      // Stock total par équipement
        const { data: stockRows } = await supabase
          .from('equipment_stock')
          .select('equipment_id,quantity')
          .in('equipment_id', equipmentIds);
        const totalByEq = new Map<string, number>();
        (stockRows || []).forEach((r: any) => totalByEq.set(r.equipment_id, (totalByEq.get(r.equipment_id) || 0) + Number(r.quantity || 0)));

        const { data: maintenanceRows } = await supabase
          .from('equipment_unit_maintenance_history')
          .select('equipment_id')
          .in('status', ['scheduled', 'in_progress'])
          .in('equipment_id', equipmentIds);
        const maintenanceCounts = new Map<string, number>();
        (maintenanceRows || []).forEach((row: any) => {
          if (row.equipment_id) {
            maintenanceCounts.set(row.equipment_id, (maintenanceCounts.get(row.equipment_id) || 0) + 1);
          }
        });

      // Lignes de location qui chevauchent la semaine
      const { data: items } = await supabase
        .from('rental_items')
        .select('equipment_id, quantity, rentals!inner(start_date,end_date,status)')
        .in('equipment_id', equipmentIds)
        .filter('rentals.status','in','(pending,confirmed,in_progress)')
        .lte('rentals.start_date', end)
        .gte('rentals.end_date', start);

      const result: Record<string, Record<string, number>> = {};
      const totalSnapshot: Record<string, number> = {};
      for (const eqId of equipmentIds) {
        result[eqId] = {};
        totalSnapshot[eqId] = totalByEq.get(eqId) || 0;
        for (const d of weekDays) {
          const key = format(d, 'yyyy-MM-dd');
          result[eqId][key] = totalByEq.get(eqId) || 0;
        }
      }
      (items || []).forEach((it: any) => {
        const s = new Date(it.rentals.start_date);
        const e = new Date(it.rentals.end_date);
        for (const d of weekDays) {
          const ds = new Date(format(d, 'yyyy-MM-dd') + 'T00:00:00');
          const de = new Date(format(d, 'yyyy-MM-dd') + 'T23:59:59');
          if (s <= de && e >= ds) {
            const key = format(d, 'yyyy-MM-dd');
            result[it.equipment_id][key] = (result[it.equipment_id][key] || 0) - Number(it.quantity || 0);
          }
        }
      });
      return { result, totals: totalSnapshot, maintenanceCounts };
    } finally {
      setLoading(false);
    }
  };

  const addEquipmentLine = async () => {
    if (config.equipment_lines.length >= 6) return;

    const availableEquipment = getAvailableEquipment();

    if (availableEquipment.length === 0) return;

    const newEquipment = availableEquipment[0];
    const { result, totals, maintenanceCounts } = await computeDailyAvailability([newEquipment.id]);
    const daily = weekDays.reduce((acc, day) => {
      const k = format(day, 'yyyy-MM-dd');
      acc[k] = result[newEquipment.id]?.[k] ?? 0;
      return acc;
    }, {} as Record<string, number>);
    const newLine: EquipmentStock = {
      id: Date.now().toString(),
      equipment_id: newEquipment.id,
      equipment_name: newEquipment.name,
      daily_stock: daily,
      maintenance_count: maintenanceCounts.get(newEquipment.id) || 0,
    };

    setConfig({
      ...config,
      equipment_lines: [...config.equipment_lines, newLine]
    });
  };

  const removeEquipmentLine = (lineId: string) => {
    setConfig({
      ...config,
      equipment_lines: config.equipment_lines.filter(line => line.id !== lineId)
    });
  };

  const changeEquipment = async (lineId: string, newEquipmentId: string) => {
    const newEquipment = allEquipment.find(eq => eq.id === newEquipmentId);
    if (!newEquipment) return;
    const { result, totals, maintenanceCounts } = await computeDailyAvailability([newEquipmentId]);
    const daily = weekDays.reduce((acc, day) => {
      const k = format(day, 'yyyy-MM-dd');
      acc[k] = result[newEquipmentId]?.[k] ?? 0;
      return acc;
    }, {} as Record<string, number>);
    setConfig({
      ...config,
      equipment_lines: config.equipment_lines.map(line =>
        line.id === lineId
          ? {
              ...line,
              equipment_id: newEquipmentId,
              equipment_name: newEquipment.name,
              daily_stock: daily,
              maintenance_count: maintenanceCounts.get(newEquipmentId) || 0,
            }
          : line
      )
    });
    setShowEquipmentDropdown(null);
  };

  // Recompute when the displayed week changes
  useEffect(() => {
    const refresh = async () => {
      const ids = config.equipment_lines.map(l => l.equipment_id).filter(Boolean);
      if (!ids.length) return;
      const { result, totals, maintenanceCounts } = await computeDailyAvailability(ids);
      setConfig({
        ...config,
        equipment_lines: config.equipment_lines.map(line => {
          const daily = weekDays.reduce((acc, day) => {
            const k = format(day, 'yyyy-MM-dd');
            acc[k] = result[line.equipment_id]?.[k] ?? (line.daily_stock[k] || 0);
            return acc;
          }, {} as Record<string, number>);
          return {
            ...line,
            daily_stock: daily,
            maintenance_count: maintenanceCounts.get(line.equipment_id) || 0,
          };
        })
      });
    };
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekStart.getTime()]);

  const updateStock = (lineId: string, date: string, newStock: number) => {
    setConfig({
      ...config,
      equipment_lines: config.equipment_lines.map(line =>
        line.id === lineId
          ? {
              ...line,
              daily_stock: { ...line.daily_stock, [date]: newStock }
            }
          : line
      )
    });
  };

  

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePreviousWeek}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-gray-700">
              {format(currentWeekStart, 'dd MMM', { locale })} - {format(addDays(currentWeekStart, 4), 'dd MMM yyyy', { locale })}
            </span>
            <button
              onClick={handleNextWeek}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          
          {config.equipment_lines.length < 6 && (
            <button
              onClick={addEquipmentLine}
              className="flex items-center space-x-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              <Plus className="h-3 w-3" />
              <span>{t('dashboard.widgets.stockPlanning.add')}</span>
            </button>
          )}
        </div>

        {/* Days Header */}
        <div className="grid grid-cols-6 gap-1 text-xs font-medium text-gray-600">
          <div className="text-left">{t('dashboard.widgets.stockPlanning.resources')}</div>
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="text-center">
              {format(day, 'EEE. dd', { locale })}
            </div>
          ))}
        </div>
      </div>

      {/* Equipment Lines */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {config.equipment_lines.map((line) => (
          <div key={line.id} className="grid grid-cols-6 gap-1 items-center">
            {/* Equipment Name */}
            <div className="relative">
              <div className="group flex items-center gap-1">
                <button
                  onClick={() => setShowEquipmentDropdown(showEquipmentDropdown === line.id ? null : line.id)}
                  className="flex min-w-0 flex-1 items-center justify-between rounded p-1 text-left text-xs text-gray-700 hover:bg-gray-50"
                >
                  <span className="truncate">{line.equipment_name}</span>
                  <ChevronDown
                    className={`ml-1 h-3 w-3 flex-shrink-0 ${
                      showEquipmentDropdown === line.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  />
                </button>
                <button
                  onClick={() => removeEquipmentLine(line.id)}
                  className={`flex-shrink-0 rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700 ${
                    showEquipmentDropdown === line.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  aria-label={t('dashboard.widgets.stockPlanning.removeLine')}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* Equipment Dropdown */}
              {showEquipmentDropdown === line.id && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-32 overflow-y-auto">
                  {getAvailableEquipment(line.id).map((equipment) => (
                    <button
                      key={equipment.id}
                      onClick={() => changeEquipment(line.id, equipment.id)}
                      className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100 truncate"
                    >
                      {equipment.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stock for each day */}
            {weekDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const stockValue = Number(line.daily_stock[dateKey] ?? 0);
              const totalStock = Number(line.maintenance_count ?? 0) + Math.max(stockValue, 0);
              const hasTotalMaintenance = totalStock > 0 && stockValue <= 0;
              const { container, render } = getStockStyle(stockValue, totalStock);
              
              return (
                <div
                  key={dateKey}
                  className={`relative h-8 flex items-center justify-center text-xs font-semibold rounded ${container}`}
                  title={t('dashboard.widgets.stockPlanning.tooltip', { value: stockValue })}
                >
                  {hasTotalMaintenance ? render : stockValue}
                </div>
              );
            })}
          </div>
        ))}

        {config.equipment_lines.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">{t('dashboard.widgets.stockPlanning.empty')}</p>
            <button
              onClick={addEquipmentLine}
              className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
            >
              {t('dashboard.widgets.stockPlanning.addFirst')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockPlanningWidget;
