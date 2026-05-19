import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export interface CompanySettings {
  id: number;
  name: string | null;
  legal_name: string | null;
  siren: string | null;
  siret: string | null;
  naf: string | null;
  capital: string | null;
  vat: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  about: string | null;
  logo_url: string | null;
  accent_color: string | null;
  secondary_color: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  billing_email: string | null;
  billing_address: string | null;
  send_invoices: boolean;
  integ_slack: boolean;
  integ_notion: boolean;
  integ_zapier: boolean;
  integ_quickbooks: boolean;
  templates?: any;
  features?: Record<string, any> | null;
  document_design?: Record<string, any> | null;
  rental_coefficient_mode?: 'none' | 'automatic' | 'formula' | null;
  rental_coefficient_formula?: string | null;
  rental_coefficient_examples?: Record<string, any> | null;
  ical_enabled?: boolean | null;
  ical_token?: string | null;
  is_auto_entrepreneur?: boolean | null;
  inventory_cycle_period_days?: number | null;
  inventory_cycle_full_every?: number | null;
  inventory_cycle_anchor_date?: string | null;
}

export const useCompanySettings = () => {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) throw error;
      setSettings(data as unknown as CompanySettings);
    } catch (e) {
      console.error('load company_settings', e);
      setError('Failed to load company settings');
      toast.error("Erreur lors du chargement des paramètres d'entreprise");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updates: Partial<CompanySettings>) => {
    try {
      const payload = { ...updates } as any;
      const { data, error } = await supabase
        .from('company_settings')
        .upsert([{ id: 1, ...payload }], { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      setSettings(data as CompanySettings);
      toast.success("Paramètres entreprise enregistrés");
      return data as CompanySettings;
    } catch (e) {
      console.error('save company_settings', e);
      toast.error("Impossible d'enregistrer les paramètres");
      throw e;
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  return { settings, loading, error, fetchSettings, saveSettings };
};
