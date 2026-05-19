import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { Database } from '../lib/database.types';
import { completeMaintenanceTask, deleteMaintenanceTask as deleteMaintenanceTaskAction } from '../utils/maintenanceActions';

export type MaintenanceTask = {
  id: string;
  equipment_id: string | null;
  personnel_id: string | null;
  type: 'preventive' | 'corrective' | 'inspection';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description: string | null;
  scheduled_date: string;
  completed_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  cost: number | null;
  created_at: string;
  equipment_name?: string;
  notes?: string | null;
  serial_numbers: string[];
};

export type EquipmentMaintenance = {
  id: string;
  equipment_id: string | null;
  warehouse_id: string | null;
  serial_number: string | null;
  maintenance_type: 'SAV' | 'Réparation dépôt';
  status: 'open' | 'closed';
  task_id: string | null;
  created_at: string;
  completed_at: string | null;
  equipment_name?: string;
  warehouse_name?: string;
};

export type MaintenanceDocument = {
  id: string;
  maintenance_id: string;
  doc_type: 'rapport' | 'facture' | 'upload' | 'autre';
  title: string;
  file_url: string;
  created_at: string;
};

type MaintenanceTaskRow = Database['public']['Tables']['maintenance_tasks']['Row'];
type EquipmentMaintenanceRow = Database['public']['Tables']['equipment_maintenance']['Row'];

export const useMaintenance = () => {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [openUnits, setOpenUnits] = useState<EquipmentMaintenance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [
        { data: tData, error: tErr },
        { data: emData, error: emErr },
        { data: serialData, error: serialErr },
      ] = await Promise.all([
        supabase
          .from('maintenance_tasks')
          .select('*, equipment:equipment_id(name)')
          .order('scheduled_date', { ascending: true }),
        supabase
          .from('equipment_maintenance')
          .select('*, equipment:equipment_id(name), warehouses:warehouse_id(name)')
          .eq('status', 'open')
          .order('created_at', { ascending: false }),
        supabase
          .from('equipment_maintenance')
          .select('task_id, serial_number')
          .not('task_id', 'is', null),
      ]);
      if (tErr) throw tErr;
      if (emErr) throw emErr;
      if (serialErr) throw serialErr;

      const serialsByTask = new Map<string, string[]>();
      ((serialData ?? []) as Pick<EquipmentMaintenanceRow, 'task_id' | 'serial_number'>[]).forEach((row) => {
        if (!row.task_id || !row.serial_number) return;
        const current = serialsByTask.get(row.task_id) || [];
        if (!current.includes(row.serial_number)) {
          serialsByTask.set(row.task_id, [...current, row.serial_number]);
        }
      });

      const mappedTasks: MaintenanceTask[] = ((tData ?? []) as (MaintenanceTaskRow & {
        equipment?: { name?: string | null } | null;
      })[]).map((t) => ({
        id: t.id,
        equipment_id: t.equipment_id,
        personnel_id: t.personnel_id,
        type: t.type as MaintenanceTask['type'],
        priority: t.priority as MaintenanceTask['priority'],
        title: t.title,
        description: t.description,
        scheduled_date: t.scheduled_date,
        completed_date: t.completed_date,
        status: t.status as MaintenanceTask['status'],
        cost: t.cost,
        created_at: t.created_at,
        equipment_name: t.equipment?.name || undefined,
        notes: t.notes,
        serial_numbers: serialsByTask.get(t.id) || [],
      }));
      const mappedEM: EquipmentMaintenance[] = ((emData ?? []) as (EquipmentMaintenanceRow & {
        equipment?: { name?: string | null } | null;
        warehouses?: { name?: string | null } | null;
      })[]).map((r) => ({
        id: r.id,
        equipment_id: r.equipment_id,
        warehouse_id: r.warehouse_id,
        serial_number: r.serial_number,
        maintenance_type: r.maintenance_type as EquipmentMaintenance['maintenance_type'],
        status: r.status as EquipmentMaintenance['status'],
        task_id: r.task_id,
        created_at: r.created_at,
        completed_at: r.completed_at,
        equipment_name: r.equipment?.name || undefined,
        warehouse_name: r.warehouses?.name || undefined,
      }));
      setTasks(mappedTasks);
      setOpenUnits(mappedEM);
    } catch (e) {
      console.error('Error loading maintenance', e);
      toast.error('Erreur chargement maintenance');
    } finally {
      setLoading(false);
    }
  }, []);

  const createTask = useCallback(async (payload: {
    equipment_id: string;
    title: string;
    description?: string;
    type: 'preventive' | 'corrective' | 'inspection';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    scheduled_date?: string;
    maintenance_kind?: 'SAV' | 'Réparation dépôt';
    serial_number?: string | null;
  }) => {
    const { equipment_id, title, description, type, priority = 'medium', scheduled_date, maintenance_kind, serial_number } = payload;
    const sched = scheduled_date || new Date().toISOString();
    const { data: task, error } = await supabase
      .from('maintenance_tasks')
      .insert([{ equipment_id, title, description: description || null, type, priority, scheduled_date: sched, status: 'pending' }])
      .select('id')
      .single();
    if (error) throw error;
    if (maintenance_kind) {
      const { error: emErr } = await supabase
        .from('equipment_maintenance')
        .insert([{ equipment_id, serial_number: serial_number || null, maintenance_type: maintenance_kind, status: 'open', task_id: task?.id || null }]);
      if (emErr) {
        if (task?.id) {
          const { error: rollbackErr } = await supabase
            .from('maintenance_tasks')
            .delete()
            .eq('id', task.id);
          if (rollbackErr) {
            console.error('Error rolling back maintenance task after equipment_maintenance failure', rollbackErr);
          }
        }
        throw emErr;
      }
      if (serial_number) {
        const { error: unitErr } = await supabase
          .from('equipment_units')
          .update({ status: 'maintenance' })
          .eq('equipment_id', equipment_id)
          .eq('serial_number', serial_number);
        if (unitErr) {
          console.error('Error updating equipment unit status after maintenance creation', unitErr);
        }
      }
    }
    toast.success('Maintenance créée');
    await fetchAll();
    return task;
  }, [fetchAll]);

  const handleCompletedStatus = useCallback(async (taskId: string, completedAt?: string | null) => {
    await completeMaintenanceTask(taskId, completedAt);
  }, []);

  const updateTaskStatus = useCallback(async (id: string, status: MaintenanceTask['status']) => {
    if (status === 'completed') {
      await handleCompletedStatus(id);
    } else {
      const updates: any = {
        status,
        completed_date: null,
      };
      const { error } = await supabase.from('maintenance_tasks').update(updates).eq('id', id);
      if (error) throw error;
    }
    toast.success('Statut mis à jour');
    await fetchAll();
  }, [fetchAll, handleCompletedStatus]);

  const updateTasksStatus = useCallback(async (ids: string[], status: MaintenanceTask['status']) => {
    if (!ids.length) return;
    if (status === 'completed') {
      await Promise.all(ids.map((taskId) => handleCompletedStatus(taskId)));
    } else {
      const updates: any = {
        status,
        completed_date: null,
      };
      const { error } = await supabase.from('maintenance_tasks').update(updates).in('id', ids);
      if (error) throw error;
    }
    toast.success(ids.length > 1 ? 'Statuts mis à jour' : 'Statut mis à jour');
    await fetchAll();
  }, [fetchAll, handleCompletedStatus]);

  const updateTask = useCallback(async (
    id: string,
    updates: Partial<Pick<MaintenanceTask, 'title' | 'description' | 'type' | 'priority' | 'status' | 'scheduled_date' | 'completed_date' | 'cost' | 'notes'>> & {
      equipment_id?: string | null;
    },
  ) => {
    const payload: Record<string, any> = { ...updates };
    if (updates.status === 'completed') {
      delete payload.status;
      delete payload.completed_date;
    } else if (updates.status) {
      payload.completed_date = null;
    }

    if (Object.keys(payload).length > 0) {
      const { error } = await supabase.from('maintenance_tasks').update(payload).eq('id', id);
      if (error) throw error;
    }

    if (updates.status === 'completed') {
      await handleCompletedStatus(id, updates.completed_date || new Date().toISOString());
    }
    toast.success('Maintenance mise à jour');
    await fetchAll();
  }, [fetchAll, handleCompletedStatus]);

  const listDocuments = useCallback(async (maintenanceId: string): Promise<MaintenanceDocument[]> => {
    const { data, error } = await supabase
      .from('maintenance_documents')
      .select('id, maintenance_id, doc_type, title, file_url, created_at')
      .eq('maintenance_id', maintenanceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as MaintenanceDocument[];
  }, []);

  const createDocument = useCallback(async (payload: {
    maintenance_id: string;
    doc_type: MaintenanceDocument['doc_type'];
    title: string;
    file_url: string;
  }): Promise<MaintenanceDocument> => {
    const { data, error } = await supabase
      .from('maintenance_documents')
      .insert([{ ...payload }])
      .select('id, maintenance_id, doc_type, title, file_url, created_at')
      .single();
    if (error) throw error;
    toast.success('Document enregistré');
    return data as MaintenanceDocument;
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
    const { error } = await supabase.from('maintenance_documents').delete().eq('id', id);
    if (error) throw error;
    toast.success('Document supprimé');
  }, []);

  const closeUnitMaintenance = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('equipment_maintenance')
      .update({ status: 'closed', completed_at: new Date().toISOString() })
      .eq('id', id)
      .select('equipment_id, serial_number');
    if (error) throw error;
    if (Array.isArray(data) && data.length) {
      const row = data[0];
      if (row.serial_number) {
        const { data: remaining, error: remainingErr } = await supabase
          .from('equipment_maintenance')
          .select('id')
          .eq('equipment_id', row.equipment_id)
          .eq('serial_number', row.serial_number)
          .eq('status', 'open')
          .limit(1);
        if (remainingErr) throw remainingErr;
        if (!remaining || remaining.length === 0) {
          const { error: unitErr } = await supabase
            .from('equipment_units')
            .update({ status: 'available' })
            .eq('equipment_id', row.equipment_id)
            .eq('serial_number', row.serial_number)
            .eq('status', 'maintenance');
          if (unitErr) throw unitErr;
        }
      }
    }
    toast.success('Unité sortie de maintenance');
    await fetchAll();
  }, [fetchAll]);

  const deleteTask = useCallback(async (id: string) => {
    await deleteMaintenanceTaskAction(id);
    toast.success('Maintenance supprimée');
    await fetchAll();
  }, [fetchAll]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return {
    tasks,
    openUnits,
    loading,
    refetch: fetchAll,
    createTask,
    updateTaskStatus,
    updateTasksStatus,
    updateTask,
    closeUnitMaintenance,
    deleteTask,
    listDocuments,
    createDocument,
    deleteDocument,
  };
};
