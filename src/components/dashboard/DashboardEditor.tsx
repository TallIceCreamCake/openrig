import React from 'react';
import { Plus, X, Save } from 'lucide-react';
import { DashboardWidget } from '../../types/dashboard';

interface DashboardEditorProps {
  availableWidgets: DashboardWidget[];
  activeWidgets: DashboardWidget[];
  onAddWidget: (widgetId: string) => void;
  onRemoveWidget: (widgetId: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const DashboardEditor: React.FC<DashboardEditorProps> = ({
  availableWidgets,
  activeWidgets,
  onAddWidget,
  onRemoveWidget,
  onSave,
  onCancel,
}) => {
  const inactiveWidgets = availableWidgets.filter(
    widget => !activeWidgets.find(active => active.id === widget.id)
  );

  return (
    <div className="fixed inset-x-0 bottom-0 bg-white border-t shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium">Dashboard Editor</h2>
          <div className="space-x-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              <Save className="h-4 w-4 inline-block mr-1" />
              Save Layout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Available Widgets</h3>
            <div className="space-y-2">
              {inactiveWidgets.map((widget) => (
                <button
                  key={widget.id}
                  onClick={() => onAddWidget(widget.id)}
                  className="w-full flex items-center p-2 text-left bg-gray-50 hover:bg-gray-100 rounded-md"
                >
                  <Plus className="h-4 w-4 mr-2 text-gray-400" />
                  <span className="text-sm">{widget.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Active Widgets</h3>
            <div className="space-y-2">
              {activeWidgets.map((widget) => (
                <div
                  key={widget.id}
                  className="flex items-center justify-between p-2 bg-blue-50 rounded-md"
                >
                  <span className="text-sm text-blue-700">{widget.title}</span>
                  <button
                    onClick={() => onRemoveWidget(widget.id)}
                    className="p-1 text-blue-700 hover:bg-blue-100 rounded-full"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardEditor;