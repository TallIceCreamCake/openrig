import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Warehouse } from '../types/warehouse';
import toast from 'react-hot-toast';
import { useTranslation } from '../context/TranslationContext';

export const useWarehouses = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const fetchWarehouses = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setWarehouses(data || []);
    } catch (err) {
      console.error('Error fetching warehouses:', err);
      setError(t('warehouses.error.fetch'));
      toast.error(t('warehouses.toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const addWarehouse = async (warehouseData: Partial<Warehouse>) => {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .insert([warehouseData])
        .select()
        .single();

      if (error) throw error;

      setWarehouses(prev => [data, ...prev]);
      toast.success(t('warehouses.toast.addSuccess'));
      return data;
    } catch (err) {
      console.error('Error adding warehouse:', err);
      toast.error(t('warehouses.toast.addError'));
      throw err;
    }
  };

  const updateWarehouse = async (id: string, updates: Partial<Warehouse>) => {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setWarehouses(prev => prev.map(warehouse => 
        warehouse.id === id ? { ...warehouse, ...data } : warehouse
      ));
      toast.success(t('warehouses.toast.updateSuccess'));
      return data;
    } catch (err) {
      console.error('Error updating warehouse:', err);
      toast.error(t('warehouses.toast.updateError'));
      throw err;
    }
  };

  const deleteWarehouse = async (id: string) => {
    try {
      const { error } = await supabase
        .from('warehouses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setWarehouses(prev => prev.filter(warehouse => warehouse.id !== id));
      toast.success(t('warehouses.toast.deleteSuccess'));
    } catch (err) {
      console.error('Error deleting warehouse:', err);
      toast.error(t('warehouses.toast.deleteError'));
      throw err;
    }
  };

  const deleteWarehousesBulk = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const { error } = await supabase
        .from('warehouses')
        .delete()
        .in('id', ids);

      if (error) throw error;

      const removed = new Set(ids);
      setWarehouses(prev => prev.filter(warehouse => !removed.has(warehouse.id)));
      toast.success(
        ids.length > 1
          ? t('warehouses.toast.bulkDeleteSuccess', { count: ids.length })
          : t('warehouses.toast.deleteSuccess')
      );
    } catch (err) {
      console.error('Error deleting warehouses batch:', err);
      toast.error(t('warehouses.toast.deleteError'));
      throw err;
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  return {
    warehouses,
    loading,
    error,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
    deleteWarehousesBulk,
    refetch: fetchWarehouses
  };
};
