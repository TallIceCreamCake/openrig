import { supabase } from '../lib/supabase';

export const completeMaintenanceTask = async (
  taskId: string,
  completedAt?: string | null,
) => {
  const { error } = await supabase.rpc('complete_maintenance_task', {
    p_task_id: taskId,
    p_completed_at: completedAt || new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
};

export const deleteMaintenanceTask = async (taskId: string) => {
  const { error } = await supabase.rpc('delete_maintenance_task', {
    p_task_id: taskId,
  });

  if (error) {
    throw error;
  }
};
