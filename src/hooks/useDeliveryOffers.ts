import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { DeliveryOffer } from '../types/deliveryOffer';

export const useDeliveryOffers = () => {
  const [offers, setOffers] = useState<DeliveryOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOffers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('delivery_offers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOffers((data || []) as DeliveryOffer[]);
    } catch (e) {
      console.error('load delivery offers', e);
      setError('Failed to load delivery offers');
      toast.error('Erreur lors du chargement des offres');
    } finally {
      setLoading(false);
    }
  };

  const addOffer = async (payload: Partial<DeliveryOffer>) => {
    try {
      const { data, error } = await supabase
        .from('delivery_offers')
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      setOffers(prev => [data as DeliveryOffer, ...prev]);
      toast.success('Offre créée');
      return data as DeliveryOffer;
    } catch (e) {
      console.error(e);
      toast.error('Création impossible');
      throw e;
    }
  };

  const updateOffer = async (id: string, updates: Partial<DeliveryOffer>) => {
    try {
      const { data, error } = await supabase
        .from('delivery_offers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      setOffers(prev => prev.map((offer) => offer.id === id ? ({ ...offer, ...data } as DeliveryOffer) : offer));
      toast.success('Offre mise à jour');
      return data as DeliveryOffer;
    } catch (e) {
      console.error(e);
      toast.error('Mise à jour impossible');
      throw e;
    }
  };

  const deleteOffer = async (id: string) => {
    try {
      const { error } = await supabase.from('delivery_offers').delete().eq('id', id);
      if (error) throw error;
      setOffers(prev => prev.filter((offer) => offer.id !== id));
      toast.success('Offre supprimée');
    } catch (e) {
      console.error(e);
      toast.error('Suppression impossible');
      throw e;
    }
  };

  useEffect(() => {
    fetchOffers();
  }, []);

  return {
    offers,
    loading,
    error,
    addOffer,
    updateOffer,
    deleteOffer,
    refetch: fetchOffers,
  };
};
