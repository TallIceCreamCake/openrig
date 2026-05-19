import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { ServiceRecord, ServiceStatus, ServiceCategory } from '../types/service';

export type ServiceCreatePayload = {
  category: ServiceCategory;
  title: string;
  cost_per_person?: number | null;
  price?: number | null;
  provider?: string | null;
  coverage?: string[] | null;
  start_date?: string | null;
  end_date?: string | null;
  amount_per_day?: number | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  status?: ServiceStatus;
  proof_file_url?: string | null;
  proof_file_name?: string | null;
  proof_file_type?: string | null;
  proof_file_size?: number | null;
  notes?: string | null;
};

export type ServiceUpdatePayload = Partial<ServiceCreatePayload>;

export const useServices = () => {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('service_records')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setServices((data || []) as ServiceRecord[]);
    } catch (e) {
      console.error('load services', e);
      toast.error('Erreur lors du chargement des services');
    } finally {
      setLoading(false);
    }
  }, []);

  const createService = useCallback(async (payload: ServiceCreatePayload) => {
    try {
      const { data, error } = await supabase
        .from('service_records')
        .insert([{
          ...payload,
          status: payload.status ?? 'active',
        }])
        .select('*')
        .single();
      if (error) throw error;
      setServices((prev) => [data as ServiceRecord, ...prev]);
      toast.success('Service créé');
      return data as ServiceRecord;
    } catch (e) {
      console.error('create service', e);
      toast.error('Création impossible');
      throw e;
    }
  }, []);

  const updateService = useCallback(async (id: string, updates: ServiceUpdatePayload) => {
    try {
      const { data, error } = await supabase
        .from('service_records')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      setServices((prev) => prev.map((service) => (service.id === id ? (data as ServiceRecord) : service)));
      toast.success('Service mis a jour');
      return data as ServiceRecord;
    } catch (e) {
      console.error('update service', e);
      toast.error('Mise a jour impossible');
      throw e;
    }
  }, []);

  const deleteService = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('service_records').delete().eq('id', id);
      if (error) throw error;
      setServices((prev) => prev.filter((service) => service.id !== id));
      toast.success('Service supprime');
    } catch (e) {
      console.error('delete service', e);
      toast.error('Suppression impossible');
      throw e;
    }
  }, []);

  const deleteServicesBulk = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const { error } = await supabase.from('service_records').delete().in('id', ids);
      if (error) throw error;
      const removed = new Set(ids);
      setServices((prev) => prev.filter((service) => !removed.has(service.id)));
      toast.success(ids.length > 1 ? 'Services supprimes' : 'Service supprime');
    } catch (e) {
      console.error('delete services', e);
      toast.error('Suppression impossible');
      throw e;
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  return {
    services,
    loading,
    refresh: fetchServices,
    createService,
    updateService,
    deleteService,
    deleteServicesBulk,
  };
};
