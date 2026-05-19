import { Equipment, EquipmentStatus } from '../types/equipment';

export const formatEquipmentStatusLabel = (
  status: EquipmentStatus | string,
  baseLabel: string,
  maintenanceCount?: number | null,
  totalUnits?: number | null,
) => {
  if (status !== 'maintenance') return baseLabel;
  const total = Number(totalUnits ?? NaN);
  const maintenance = Number(maintenanceCount ?? 0);
  if (!Number.isNaN(total) && total > 0) {
    return `${maintenance}/${total} ${baseLabel}`.trim();
  }
  return baseLabel;
};

export const formatEquipmentStatusLabelForItem = (item: Equipment, baseLabel: string) =>
  formatEquipmentStatusLabel(item.status, baseLabel, item.maintenance_count, item.total_units);
