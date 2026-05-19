import React from 'react';
import { X, Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { DashboardWidget } from '../../types/dashboard';
import { useTranslation } from '../../context/TranslationContext';

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableWidgets: DashboardWidget[];
  onAddWidget: (widgetId: string) => void;
}

const AddWidgetModal: React.FC<AddWidgetModalProps> = ({
  isOpen,
  onClose,
  availableWidgets,
  onAddWidget,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const handleAddWidget = (widgetId: string) => {
    onAddWidget(widgetId);
    onClose();
  };

  const content = (
    <div className="fixed inset-0 z-[12000] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Overlay */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" 
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">{t('dashboard.addWidget.title')}</h3>
              <button
                onClick={onClose}
                className="rounded-full p-1 hover:bg-gray-100 transition-colors"
                aria-label={t('dashboard.addWidget.close')}
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="grid gap-3 max-h-96 overflow-y-auto">
              {availableWidgets.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  {t('dashboard.addWidget.empty')}
                </p>
              ) : (
                availableWidgets.map((widget) => (
                  <button
                    key={widget.id}
                    onClick={() => handleAddWidget(widget.id)}
                    className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                          {widget.title}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {t('dashboard.addWidget.size', { width: widget.defaultLayout.w, height: widget.defaultLayout.h })}
                        </p>
                      </div>
                      <Plus className="h-5 w-5 text-gray-400 group-hover:text-blue-500" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
};

export default AddWidgetModal;
