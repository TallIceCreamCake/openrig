import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Equipment } from '../types/equipment';
import toast from 'react-hot-toast';

export const useEquipment = (id?: string) => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [singleEquipment, setSingleEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEquipment = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      let list = data || [];
      if (list.length) {
        const ids = list.map((e) => e.id);
        const [
          { data: em, error: emErr },
          { data: unitRows, error: unitErr },
          { data: stockRows, error: stockErr },
        ] = await Promise.all([
          supabase
            .from('equipment_unit_maintenance_history')
            .select('equipment_id')
            .in('equipment_id', ids)
            .in('status', ['scheduled', 'in_progress']),
          supabase
            .from('equipment_units')
            .select('equipment_id')
            .in('equipment_id', ids),
          supabase
            .from('equipment_stock')
            .select('equipment_id, quantity')
            .in('equipment_id', ids),
        ]);
        if (emErr) throw emErr;
        if (unitErr) throw unitErr;
        if (stockErr) throw stockErr;

        const maintenanceCounts = new Map<string, number>();
        (em || []).forEach((row: any) => {
          if (!row.equipment_id) return;
          maintenanceCounts.set(row.equipment_id, (maintenanceCounts.get(row.equipment_id) || 0) + 1);
        });

        const unitCounts = new Map<string, number>();
        (unitRows || []).forEach((row: any) => {
          if (!row.equipment_id) return;
          unitCounts.set(row.equipment_id, (unitCounts.get(row.equipment_id) || 0) + 1);
        });

        const stockCounts = new Map<string, number>();
        (stockRows || []).forEach((row: any) => {
          if (!row.equipment_id) return;
          stockCounts.set(
            row.equipment_id,
            (stockCounts.get(row.equipment_id) || 0) + Number(row.quantity || 0),
          );
        });

        list = list.map((e) => {
          const maintenanceCount = maintenanceCounts.get(e.id) || 0;
          const totalUnits = e.inventory_category === 'series'
            ? (unitCounts.get(e.id) || 0)
            : (stockCounts.get(e.id) || 0);
          return {
            ...e,
            maintenance_count: maintenanceCount,
            total_units: totalUnits,
            status: e.status === 'broken' ? 'broken' : maintenanceCount > 0 ? 'maintenance' : e.status,
          } as Equipment;
        });
      }
      setEquipment(list);
    } catch (err) {
      console.error('Error fetching equipment:', err);
      setError('Failed to fetch equipment');
      toast.error('Erreur lors du chargement des équipements');
    } finally {
      setLoading(false);
    }
  };

  const fetchSingleEquipment = async (equipmentId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('id', equipmentId)
        .single();

      if (error) throw error;
      let row = data;
        const [
          { count: maintenanceCount, error: emErr },
          { count: unitCount, error: unitErr },
          { data: stockRows, error: stockErr },
        ] = await Promise.all([
          supabase
            .from('equipment_unit_maintenance_history')
            .select('id', { count: 'exact', head: true })
            .eq('equipment_id', equipmentId)
            .in('status', ['scheduled', 'in_progress']),
          supabase
            .from('equipment_units')
            .select('id', { count: 'exact', head: true })
            .eq('equipment_id', equipmentId),
        supabase
          .from('equipment_stock')
          .select('quantity')
          .eq('equipment_id', equipmentId),
      ]);
      if (emErr) throw emErr;
      if (unitErr) throw unitErr;
      if (stockErr) throw stockErr;

      const stockTotal = (stockRows || []).reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0);
      const totalUnits = row.inventory_category === 'series'
        ? (unitCount || 0)
        : stockTotal;
      const maintenanceTotal = maintenanceCount || 0;
      row = {
        ...row,
        maintenance_count: maintenanceTotal,
        total_units: totalUnits,
        status: row.status === 'broken' ? 'broken' : maintenanceTotal > 0 ? 'maintenance' : row.status,
      } as any;
      setSingleEquipment(row);
    } catch (err) {
      console.error('Error fetching equipment:', err);
      setError('Failed to fetch equipment');
      toast.error('Erreur lors du chargement de l\'équipement');
    } finally {
      setLoading(false);
    }
  };

  const addEquipment = async (
    equipmentData: Partial<Equipment>,
    options?: { successMessage?: string; errorMessage?: string }
  ) => {
    try {
      const { data, error } = await supabase
        .from('equipment')
        .insert([equipmentData])
        .select()
        .single();

      if (error) throw error;

      setEquipment(prev => [data, ...prev]);
      toast.success(options?.successMessage ?? 'Équipement ajouté avec succès');
      return data;
    } catch (err) {
      console.error('Error adding equipment:', err);
      toast.error(options?.errorMessage ?? 'Erreur lors de l\'ajout de l\'équipement');
      throw err;
    }
  };

  const updateEquipment = async (id: string, updates: Partial<Equipment>) => {
    try {
      const { data, error } = await supabase
        .from('equipment')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setEquipment(prev => prev.map(item => 
        item.id === id ? { ...item, ...data } : item
      ));
      if (singleEquipment && singleEquipment.id === id) {
        setSingleEquipment({ ...singleEquipment, ...data });
      }
      toast.success('Équipement mis à jour');
      return data;
    } catch (err) {
      console.error('Error updating equipment:', err);
      toast.error('Erreur lors de la mise à jour');
      throw err;
    }
  };

  const deleteEquipment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setEquipment(prev => prev.filter(item => item.id !== id));
      toast.success('Équipement supprimé');
    } catch (err) {
      console.error('Error deleting equipment:', err);
      toast.error('Erreur lors de la suppression');
      throw err;
    }
  };

  const deleteEquipmentBulk = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .in('id', ids);

      if (error) throw error;

      const removed = new Set(ids);
      setEquipment(prev => prev.filter(item => !removed.has(item.id)));
      toast.success(ids.length > 1 ? 'Équipements supprimés' : 'Équipement supprimé');
    } catch (err) {
      console.error('Error deleting equipment batch:', err);
      toast.error('Erreur lors de la suppression');
      throw err;
    }
  };

  useEffect(() => {
    if (id) {
      fetchSingleEquipment(id);
    } else {
      fetchEquipment();
    }
  }, [id]);

  return {
    equipment,
    singleEquipment,
    loading,
    error,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    deleteEquipmentBulk,
    refetch: id ? () => fetchSingleEquipment(id) : fetchEquipment
  };
};
