import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Client } from '../types/client';
import { Database } from '../lib/database.types';
import toast from 'react-hot-toast';

type CompanyClientPayload = {
  company: Partial<Client>;
  linkedClientIds: string[];
  newClients: Array<Partial<Client>>;
};

type ClientInsert = Database['public']['Tables']['clients']['Insert'];
type ClientUpdate = Database['public']['Tables']['clients']['Update'];

const CLIENT_SELECT = `
  id,
  name,
  email,
  phone,
  address,
  billing_address,
  default_delivery_address,
  internal_notes,
  tags,
  client_number,
  default_equipment_discount,
  financial_conditions,
  vat_number,
  siret,
  legal_form,
  share_capital,
  rcs_number,
  trust_score,
  trust_score_computed_at,
  image_url,
  created_at,
  client_type,
  company_client_id
`;

const normalizeClient = (row: any): Client => ({
  ...row,
  client_type: row.client_type === 'company' ? 'company' : 'person',
  company_client_id: row.company_client_id ?? null,
  company_client: null,
});

const sanitizeClientPayload = (payload: Partial<Client>): ClientInsert | ClientUpdate => {
  const sanitized: ClientInsert | ClientUpdate = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    sanitized.name = payload.name;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    sanitized.email = payload.email ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'phone')) {
    sanitized.phone = payload.phone ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'address')) {
    sanitized.address = payload.address ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'billing_address')) {
    (sanitized as any).billing_address = payload.billing_address ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'default_delivery_address')) {
    (sanitized as any).default_delivery_address = payload.default_delivery_address ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'internal_notes')) {
    (sanitized as any).internal_notes = payload.internal_notes ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'tags')) {
    (sanitized as any).tags = payload.tags ?? [];
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'default_equipment_discount')) {
    (sanitized as any).default_equipment_discount = payload.default_equipment_discount ?? 0;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'financial_conditions')) {
    (sanitized as any).financial_conditions = payload.financial_conditions ?? [];
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'vat_number')) {
    (sanitized as any).vat_number = payload.vat_number ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'siret')) {
    (sanitized as any).siret = payload.siret ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'legal_form')) {
    (sanitized as any).legal_form = payload.legal_form ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'share_capital')) {
    (sanitized as any).share_capital = payload.share_capital ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'rcs_number')) {
    (sanitized as any).rcs_number = payload.rcs_number ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trust_score')) {
    (sanitized as any).trust_score = payload.trust_score ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'trust_score_computed_at')) {
    (sanitized as any).trust_score_computed_at = payload.trust_score_computed_at ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'image_url')) {
    sanitized.image_url = payload.image_url ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'client_type')) {
    sanitized.client_type = payload.client_type ?? 'person';
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'company_client_id')) {
    sanitized.company_client_id = payload.company_client_id ?? null;
  }

  return sanitized;
};

export const useClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select(CLIENT_SELECT)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const normalized = ((data || []) as any[]).map(normalizeClient);
      const byId = new Map(normalized.map((entry) => [entry.id, entry]));

      setClients(normalized.map((entry) => ({
        ...entry,
        company_client: entry.company_client_id ? ({
          id: entry.company_client_id,
          name: byId.get(entry.company_client_id)?.name || entry.company || '',
        }) : null,
      })));
    } catch (err) {
      console.error('Error fetching clients:', err);
      setError('Failed to fetch clients');
      toast.error('Erreur lors du chargement des clients');
    } finally {
      setLoading(false);
    }
  };

  const addClient = async (clientData: Partial<Client>) => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([sanitizeClientPayload(clientData) as ClientInsert])
        .select(CLIENT_SELECT)
        .single();

      if (error) throw error;

      await fetchClients();
      toast.success(clientData.client_type === 'company' ? 'Entreprise ajoutée avec succès' : 'Client ajouté avec succès');
      return normalizeClient(data);
    } catch (err) {
      console.error('Error adding client:', err);
      toast.error('Erreur lors de l\'ajout du client');
      throw err;
    }
  };

  const createCompanyClient = async ({ company, linkedClientIds, newClients }: CompanyClientPayload) => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([{
          ...sanitizeClientPayload(company),
          client_type: 'company',
          company_client_id: null,
        } as ClientInsert])
        .select(CLIENT_SELECT)
        .single();

      if (error) throw error;

      const companyId = data.id;

      if (linkedClientIds.length > 0) {
        const { error: linkError } = await supabase
          .from('clients')
          .update({ company_client_id: companyId })
          .in('id', linkedClientIds);

        if (linkError) throw linkError;
      }

      if (newClients.length > 0) {
        const { error: createContactsError } = await supabase
          .from('clients')
          .insert(newClients.map((client) => ({
            ...sanitizeClientPayload(client),
            client_type: 'person',
            company_client_id: companyId,
          }) as ClientInsert));

        if (createContactsError) throw createContactsError;
      }

      await fetchClients();
      toast.success('Entreprise ajoutée avec succès');
      return normalizeClient(data);
    } catch (err) {
      console.error('Error creating company client:', err);
      toast.error("Erreur lors de la création de l'entreprise");
      throw err;
    }
  };

  const setCompanyClients = async (companyId: string, clientIds: string[]) => {
    try {
      const uniqueIds = Array.from(new Set(clientIds));
      const { error: clearError } = await supabase
        .from('clients')
        .update({ company_client_id: null })
        .eq('company_client_id', companyId)
        .eq('client_type', 'person');

      if (clearError) throw clearError;

      if (uniqueIds.length > 0) {
        const { error: linkError } = await supabase
          .from('clients')
          .update({ company_client_id: companyId })
          .in('id', uniqueIds)
          .eq('client_type', 'person');

        if (linkError) throw linkError;
      }

      await fetchClients();
      toast.success('Contacts entreprise mis à jour');
    } catch (err) {
      console.error('Error updating company clients:', err);
      toast.error("Erreur lors de la mise à jour des contacts de l'entreprise");
      throw err;
    }
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .update(sanitizeClientPayload(updates) as ClientUpdate)
        .eq('id', id)
        .select(CLIENT_SELECT)
        .single();

      if (error) throw error;

      await fetchClients();
      toast.success(updates.client_type === 'company' ? 'Entreprise mise à jour' : 'Client mis à jour');
      return normalizeClient(data);
    } catch (err) {
      console.error('Error updating client:', err);
      toast.error('Erreur lors de la mise à jour');
      throw err;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchClients();
      toast.success('Client supprimé');
    } catch (err) {
      console.error('Error deleting client:', err);
      toast.error('Erreur lors de la suppression');
      throw err;
    }
  };

  const deleteClientsBulk = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .in('id', ids);

      if (error) throw error;

      await fetchClients();
      toast.success(ids.length > 1 ? 'Clients supprimés' : 'Client supprimé');
    } catch (err) {
      console.error('Error deleting clients batch:', err);
      toast.error('Erreur lors de la suppression');
      throw err;
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  return {
    clients,
    loading,
    error,
    addClient,
    updateClient,
    deleteClient,
    deleteClientsBulk,
    createCompanyClient,
    setCompanyClients,
    refetch: fetchClients
  };
};
