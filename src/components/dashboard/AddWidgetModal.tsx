import React from 'react';
import { X, Plus, LayoutGrid } from 'lucide-react';
import { createPortal } from 'react-dom';
import { DashboardWidget } from '../../types/dashboard';
import { useTranslation } from '../../context/TranslationContext';

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableWidgets: DashboardWidget[];
  onAddWidget: (widgetId: string) => void;
}

/** Abstract skeleton previews of each widget, drawn with plain CSS shapes. */
const WidgetPreview: React.FC<{ widgetId: string }> = ({ widgetId }) => {
  switch (widgetId) {
    case 'clock-date':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <div className="h-2 w-16 rounded-full bg-gray-200" />
          <span className="text-2xl font-bold tabular-nums text-gray-700">12:45</span>
        </div>
      );
    case 'calendar':
      return (
        <div className="flex h-full gap-1.5 px-4 py-3">
          <div className="flex w-4 flex-col gap-2 pt-1">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-1 w-full rounded-full bg-gray-200" />)}
          </div>
          <div className="relative flex-1 rounded-md border border-gray-200">
            <div className="absolute left-1 right-6 top-2 h-3 rounded bg-blue-200" />
            <div className="absolute left-6 right-1 top-7 h-4 rounded bg-emerald-200" />
            <div className="absolute left-2 right-10 top-[3.25rem] h-3 rounded bg-amber-200" />
          </div>
        </div>
      );
    case 'equipment-status':
      return (
        <div className="flex h-full flex-col justify-center gap-2.5 px-5">
          {[['bg-emerald-400', 'w-4/5'], ['bg-sky-400', 'w-3/5'], ['bg-amber-400', 'w-2/5']].map(([color, width], i) => (
            <div key={i} className="space-y-1">
              <div className="h-1.5 w-10 rounded-full bg-gray-200" />
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${color} ${width}`} />
              </div>
            </div>
          ))}
        </div>
      );
    case 'stock-alerts':
      return (
        <div className="flex h-full flex-col justify-center gap-2 px-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/70 px-2 py-1.5">
              <div className="h-3 w-3 flex-shrink-0 rounded bg-red-300" />
              <div className="h-1.5 flex-1 rounded-full bg-red-200" />
            </div>
          ))}
        </div>
      );
    case 'stock-planning':
      return (
        <div className="grid h-full grid-cols-5 content-center gap-1 px-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className={`h-4 rounded ${[2, 6, 8, 13].includes(i) ? 'bg-red-200' : [4, 10].includes(i) ? 'bg-amber-200' : 'bg-emerald-100'}`}
            />
          ))}
        </div>
      );
    case 'personnel-gantt':
      return (
        <div className="flex h-full flex-col justify-center gap-2.5 px-5">
          {[['ml-0 w-2/5 bg-blue-300'], ['ml-[30%] w-1/2 bg-emerald-300'], ['ml-[15%] w-1/3 bg-amber-300']].map(([cls], i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-1.5 w-8 flex-shrink-0 rounded-full bg-gray-200" />
              <div className="relative h-3 flex-1 rounded bg-gray-100">
                <div className={`absolute inset-y-0 rounded ${cls}`} />
              </div>
            </div>
          ))}
        </div>
      );
    case 'user-tasks':
      return (
        <div className="flex h-full flex-col justify-center gap-2 px-5">
          {[true, false, false].map((done, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
              <div className={`h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 ${done ? 'border-emerald-400 bg-emerald-400' : 'border-gray-300'}`} />
              <div className={`h-1.5 flex-1 rounded-full ${done ? 'bg-gray-100' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>
      );
    case 'recent-activity':
      return (
        <div className="flex h-full flex-col justify-center gap-2.5 px-5">
          {['bg-blue-200', 'bg-emerald-200', 'bg-purple-200'].map((color, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`h-6 w-6 flex-shrink-0 rounded-lg ${color}`} />
              <div className="flex-1 space-y-1">
                <div className="h-1.5 w-4/5 rounded-full bg-gray-200" />
                <div className="h-1 w-3/5 rounded-full bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      );
    case 'pending-rentals':
    case 'upcoming-rentals':
    case 'maintenance':
      return (
        <div className="flex h-full flex-col justify-center gap-2 px-5">
          {['bg-blue-300', 'bg-emerald-300', 'bg-amber-300'].map((bar, i) => (
            <div key={i} className="relative flex items-center gap-2 overflow-hidden rounded-lg border border-gray-100 py-2 pl-3 pr-2">
              <div className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
              <div className="h-1.5 flex-1 rounded-full bg-gray-200" />
              <div className="h-2.5 w-8 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div className="grid h-full grid-cols-2 content-center gap-2 px-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-1">
              <div className="h-3 w-3 rounded bg-gray-200" />
              <div className="h-1.5 w-3/4 rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
      );
  }
};

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
      <div className="flex items-center justify-center min-h-screen p-4">
        {/* Overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-900/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-3xl rounded-2xl bg-white text-left shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-50 grid place-items-center">
                <LayoutGrid className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('dashboard.addWidget.title')}</h3>
                <p className="text-xs text-gray-500">
                  {availableWidgets.length > 0
                    ? `${availableWidgets.length} widget${availableWidgets.length > 1 ? 's' : ''} disponible${availableWidgets.length > 1 ? 's' : ''}`
                    : ''}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              aria-label={t('dashboard.addWidget.close')}
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
            {availableWidgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="h-12 w-12 rounded-2xl bg-gray-100 grid place-items-center">
                  <LayoutGrid className="h-6 w-6 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500">{t('dashboard.addWidget.empty')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {availableWidgets.map((widget) => (
                  <button
                    key={widget.id}
                    onClick={() => handleAddWidget(widget.id)}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg"
                  >
                    {/* Preview */}
                    <div className="relative aspect-square w-full border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white">
                      <WidgetPreview widgetId={widget.id} />
                      <div className="absolute inset-0 grid place-items-center bg-blue-600/0 transition-colors duration-200 group-hover:bg-blue-600/10">
                        <span className="grid h-10 w-10 scale-75 place-items-center rounded-full bg-blue-600 text-white opacity-0 shadow-lg transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
                          <Plus className="h-5 w-5" />
                        </span>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <h4 className="truncate text-sm font-medium text-gray-900 group-hover:text-blue-700">
                        {widget.title}
                      </h4>
                      <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                        {widget.defaultLayout.w}×{widget.defaultLayout.h}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
};

export default AddWidgetModal;
