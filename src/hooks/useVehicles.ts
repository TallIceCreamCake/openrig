import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Vehicle } from '../types/vehicle';
import toast from 'react-hot-toast';

export const useVehicles = (id?: string) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [singleVehicle, setSingleVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setVehicles((data || []) as any);
    } catch (e) {
      console.error('load vehicles', e);
      setError('Failed to load vehicles');
      toast.error('Erreur lors du chargement des véhicules');
    } finally { setLoading(false); }
  };

  const fetchSingle = async (vehicleId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', vehicleId)
        .single();
      if (error) throw error;
      setSingleVehicle(data as any);
    } catch (e) {
      console.error('load vehicle', e);
      setError('Failed to load vehicle');
      toast.error('Erreur lors du chargement du véhicule');
    } finally { setLoading(false); }
  };

  const addVehicle = async (payload: Partial<Vehicle>) => {
    try {
      const { data, error } = await supabase.from('vehicles').insert([payload]).select().single();
      if (error) throw error;
      setVehicles(prev => [data as any, ...prev]);
      toast.success('Véhicule créé');
      return data as any;
    } catch (e) { console.error(e); toast.error('Création impossible'); throw e; }
  };

  const updateVehicle = async (id: string, updates: Partial<Vehicle>) => {
    try {
      const { data, error } = await supabase.from('vehicles').update(updates).eq('id', id).select().single();
      if (error) throw error;
      setVehicles(prev => prev.map(v => v.id === id ? ({ ...v, ...data } as any) : v));
      if (singleVehicle && singleVehicle.id === id) setSingleVehicle({ ...singleVehicle, ...data } as any);
      toast.success('Véhicule mis à jour');
      return data as any;
    } catch (e) { console.error(e); toast.error('Mise à jour impossible'); throw e; }
  };

  const deleteVehicle = async (id: string) => {
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      setVehicles(prev => prev.filter(v => v.id !== id));
      toast.success('Véhicule supprimé');
    } catch (e) { console.error(e); toast.error('Suppression impossible'); throw e; }
  };

  const deleteVehiclesBulk = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const { error } = await supabase.from('vehicles').delete().in('id', ids);
      if (error) throw error;
      const removed = new Set(ids);
      setVehicles(prev => prev.filter(v => !removed.has(v.id)));
      toast.success(ids.length > 1 ? 'Véhicules supprimés' : 'Véhicule supprimé');
    } catch (e) {
      console.error(e);
      toast.error('Suppression impossible');
      throw e;
    }
  };

  useEffect(() => { if (id) { fetchSingle(id); } else { fetchVehicles(); } }, [id]);

  return {
    vehicles,
    singleVehicle,
    loading,
    error,
    refetch: id ? () => fetchSingle(id) : fetchVehicles,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    deleteVehiclesBulk
  };
};
