import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import AddWidgetModal from './AddWidgetModal';
import { DashboardWidget } from '../../types/dashboard';

interface AddWidgetButtonProps {
  availableWidgets: DashboardWidget[];
  activeWidgetIds: Set<string>;
  onAddWidget: (widgetId: string) => void;
}

const AddWidgetButton: React.FC<AddWidgetButtonProps> = ({
  availableWidgets,
  activeWidgetIds,
  onAddWidget,
}) => {
  const [showModal, setShowModal] = useState(false);

  const availableToAdd = availableWidgets.filter(w => !activeWidgetIds.has(w.id));

  if (availableToAdd.length === 0) {
    return null;
  }

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className="w-full h-full flex items-center justify-center text-center"
      >
        <Plus className="h-12 w-12 text-blue-400 group-hover:text-blue-500 transition-colors" />
        <div className="ml-3">
          <div className="text-sm font-medium text-blue-600">Add Widget</div>
          <div className="text-xs text-blue-500">{availableToAdd.length} available</div>
        </div>
      </div>

      <AddWidgetModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        availableWidgets={availableToAdd}
        activeWidgetIds={activeWidgetIds}
        onAddWidget={(widgetId) => {
          onAddWidget(widgetId);
          setShowModal(false);
        }}
      />
    </>
  );
};

export default AddWidgetButton;