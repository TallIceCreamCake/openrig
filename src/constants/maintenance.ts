import { MaintenanceDocument, MaintenanceTask } from '../hooks/useMaintenance';

export const maintenanceTypeOptions: MaintenanceTask['type'][] = ['preventive', 'corrective', 'inspection'];
export const maintenancePriorityOptions: MaintenanceTask['priority'][] = ['low', 'medium', 'high', 'urgent'];
export const maintenanceStatusOptions: MaintenanceTask['status'][] = ['pending', 'in_progress', 'completed', 'cancelled'];

export const maintenanceTypeLabels: Record<MaintenanceTask['type'], string> = {
  preventive: 'Préventive',
  corrective: 'Corrective',
  inspection: 'Inspection',
};

export const maintenancePriorityLabels: Record<MaintenanceTask['priority'], string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Élevée',
  urgent: 'Urgente',
};

export const maintenancePriorityTone: Record<MaintenanceTask['priority'], 'slate' | 'amber' | 'orange' | 'rose'> = {
  low: 'slate',
  medium: 'amber',
  high: 'orange',
  urgent: 'rose',
};

export const maintenanceStatusLabels: Record<MaintenanceTask['status'], string> = {
  pending: 'En attente',
  in_progress: 'En cours',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

export const maintenanceStatusTone: Record<MaintenanceTask['status'], 'amber' | 'blue' | 'emerald' | 'red'> = {
  pending: 'amber',
  in_progress: 'blue',
  completed: 'emerald',
  cancelled: 'red',
};

export const maintenanceDocTypeLabels: Record<MaintenanceDocument['doc_type'], string> = {
  rapport: 'Rapport',
  facture: 'Facture',
  upload: 'Document',
  autre: 'Autre',
};
