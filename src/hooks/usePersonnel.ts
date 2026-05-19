import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Personnel, PersonnelActivity } from '../types/personnel';
import toast from 'react-hot-toast';

export const usePersonnel = () => {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [activities, setActivities] = useState<PersonnelActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPersonnel = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('personnel')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPersonnel(data || []);
    } catch (err) {
      console.error('Error fetching personnel:', err);
      setError('Failed to fetch personnel');
      toast.error('Erreur lors du chargement du personnel');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('personnel_activities')
        .select('*')
        .order('start_time', { ascending: false });

      if (error) throw error;

      const formattedActivities = (data || []).map((activity: any) => {
        const p = personnel.find(x => x.id === activity.personnel_id);
        return {
          ...activity,
          personnel_name: p ? `${(p as any).first_name} ${(p as any).last_name}` : 'Personnel inconnu'
        } as any;
      });

      setActivities(formattedActivities);
    } catch (err) {
      console.error('Error fetching activities:', err);
      toast.error('Erreur lors du chargement des activités');
    }
  };

  const addPersonnel = async (_personnelData: Partial<Personnel>) => {
    toast.error('La creation de crew passe par le formulaire dedie du module Crew.');
    throw new Error('Use crew creation flow');
  };

  const updatePersonnel = async (id: string, updates: Partial<Personnel>) => {
    try {
      // Split updates across the linked tables
      const userUpdates: any = {};
      if (updates.email) userUpdates.email = updates.email;
      if ((updates as any).first_name || (updates as any).last_name) {
        const first = (updates as any).first_name || '';
        const last = (updates as any).last_name || '';
        userUpdates.full_name = `${first} ${last}`.trim();
      }
      if (Object.keys(userUpdates).length) {
        const { error: uErr } = await supabase.from('app_users').update(userUpdates).eq('id', id);
        if (uErr) throw uErr;
      }
      const hrUpdates: any = {};
      if ((updates as any).role) hrUpdates.role = (updates as any).role;
      if ((updates as any).status) hrUpdates.status = (updates as any).status;
      if ((updates as any).hire_date) hrUpdates.hire_date = (updates as any).hire_date;
      if ((updates as any).salary !== undefined) hrUpdates.salary = (updates as any).salary;
      if ((updates as any).address !== undefined) hrUpdates.address = (updates as any).address;
      if ((updates as any).emergency_contact !== undefined) hrUpdates.emergency_contact = (updates as any).emergency_contact;
      if ((updates as any).skills !== undefined) hrUpdates.skills = (updates as any).skills;
      if ((updates as any).certifications !== undefined) hrUpdates.certifications = (updates as any).certifications;
      if ((updates as any).employment_type !== undefined) hrUpdates.employment_type = (updates as any).employment_type;
      if ((updates as any).payment_model !== undefined) hrUpdates.payment_model = (updates as any).payment_model;
      if ((updates as any).default_hourly_rate !== undefined) hrUpdates.default_hourly_rate = (updates as any).default_hourly_rate;
      if ((updates as any).default_day_rate !== undefined) hrUpdates.default_day_rate = (updates as any).default_day_rate;
      if ((updates as any).default_cachet_rate !== undefined) hrUpdates.default_cachet_rate = (updates as any).default_cachet_rate;
      if ((updates as any).contract_start_date !== undefined) hrUpdates.contract_start_date = (updates as any).contract_start_date;
      if ((updates as any).contract_end_date !== undefined) hrUpdates.contract_end_date = (updates as any).contract_end_date;
      if ((updates as any).legal_identifier !== undefined) hrUpdates.legal_identifier = (updates as any).legal_identifier;
      if ((updates as any).school_name !== undefined) hrUpdates.school_name = (updates as any).school_name;
      if ((updates as any).payroll_notes !== undefined) hrUpdates.payroll_notes = (updates as any).payroll_notes;
      if (Object.keys(hrUpdates).length) {
        const { error: hrErr } = await supabase.from('app_user_hr').upsert({ user_id: id, ...hrUpdates }, { onConflict: 'user_id' });
        if (hrErr) throw hrErr;
      }
      // reload
      await fetchPersonnel();
      toast.success('Personnel mis à jour');
      return (personnel.find(p => p.id === id) as any) || null;
    } catch (err) {
      console.error('Error updating personnel:', err);
      toast.error('Erreur lors de la mise à jour');
      throw err;
    }
  };

  const deletePersonnel = async (id: string) => {
    if (!id) return;
    try {
      const response = await fetch(`/api/personnel/${id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Impossible de supprimer l’utilisateur');
      }
      setPersonnel(prev => prev.filter(person => person.id !== id));
      setActivities(prev => prev.filter(activity => activity.personnel_id !== id));
      toast.success('Utilisateur supprimé');
    } catch (err) {
      console.error('Error deleting personnel:', err);
      toast.error(err instanceof Error ? err.message : 'Échec de la suppression');
      throw err;
    }
  };

  const deletePersonnelBulk = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    try {
      const response = await fetch('/api/personnel/delete-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.error
          || (Array.isArray(payload?.failures) && payload.failures.length
            ? payload.failures.map((item: any) => item?.message).join(', ')
            : 'Impossible de supprimer la sélection');
        throw new Error(message);
      }
      const target = new Set(ids);
      setPersonnel(prev => prev.filter(person => !target.has(person.id)));
      setActivities(prev => prev.filter(activity => !target.has(activity.personnel_id)));
      toast.success(ids.length > 1 ? 'Personnel supprimé' : 'Utilisateur supprimé');
    } catch (err) {
      console.error('Error deleting personnel bulk:', err);
      toast.error(err instanceof Error ? err.message : 'Échec de la suppression');
      throw err;
    }
  };

  const addActivity = async (activityData: Partial<PersonnelActivity>) => {
    try {
      const { data, error } = await supabase
        .from('personnel_activities')
        .insert([activityData])
        .select('*')
        .single();

      if (error) throw error;

      const p = personnel.find(x => x.id === (data as any).personnel_id);
      const formattedActivity = {
        ...data,
        personnel_name: p ? `${(p as any).first_name} ${(p as any).last_name}` : 'Personnel inconnu'
      } as any;

      setActivities(prev => [formattedActivity, ...prev]);
      toast.success('Activité ajoutée avec succès');
      return data;
    } catch (err) {
      console.error('Error adding activity:', err);
      toast.error('Erreur lors de l\'ajout de l\'activité');
      throw err;
    }
  };

  const updateActivity = async (id: string, updates: Partial<PersonnelActivity>) => {
    try {
      const { data, error } = await supabase
        .from('personnel_activities')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;

      const p = personnel.find(x => x.id === (data as any).personnel_id);
      const formattedActivity = {
        ...data,
        personnel_name: p ? `${(p as any).first_name} ${(p as any).last_name}` : 'Personnel inconnu'
      } as any;

      setActivities(prev => prev.map(activity => 
        activity.id === id ? { ...activity, ...formattedActivity } : activity
      ));
      toast.success('Activité mise à jour');
      return data;
    } catch (err) {
      console.error('Error updating activity:', err);
      toast.error('Erreur lors de la mise à jour');
      throw err;
    }
  };

  useEffect(() => {
    fetchPersonnel();
    fetchActivities();
  }, []);

  return {
    personnel,
    activities,
    loading,
    error,
    addPersonnel,
    updatePersonnel,
    deletePersonnel,
    addActivity,
    updateActivity,
    deletePersonnelBulk,
    refetchPersonnel: fetchPersonnel,
    refetchActivities: fetchActivities
  };
};
