import React from 'react';
import EquipmentTable from './EquipmentTable';
import { Equipment } from '../../types/equipment';

interface EquipmentListProps {
  equipment: Equipment[];
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
  onHover?: (equipment: Equipment | null) => void;
  footer?: React.ReactNode;
  onDelete?: (id: string) => Promise<void> | void;
  onDuplicate?: (equipment: Equipment) => Promise<void> | void;
  title?: string;
  emptyMessage?: string;
  bulkDeleteTitle?: string;
  singleDeleteTitle?: string;
  singleDeleteMessageUnnamed?: string;
}

const EquipmentList: React.FC<EquipmentListProps> = ({
  equipment,
  onBulkDelete,
  onHover,
  footer,
  onDelete,
  onDuplicate,
  title,
  emptyMessage,
  bulkDeleteTitle,
  singleDeleteTitle,
  singleDeleteMessageUnnamed,
}) => {
  return (
    <div className="h-full">
      <EquipmentTable
        equipment={equipment}
        onBulkDelete={onBulkDelete}
        onHover={onHover}
        footer={footer}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        title={title}
        emptyMessage={emptyMessage}
        bulkDeleteTitle={bulkDeleteTitle}
        singleDeleteTitle={singleDeleteTitle}
        singleDeleteMessageUnnamed={singleDeleteMessageUnnamed}
      />
    </div>
  );
};

export default EquipmentList;
