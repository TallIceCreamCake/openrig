import React from 'react';
import { useTranslation } from '../../context/TranslationContext';
import { BarChart2 } from 'lucide-react';

export type ViewMode = 'day' | 'week' | 'month' | 'gantt';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const btn = (mode: ViewMode, label: string, icon?: React.ReactNode) => (
    <button
      className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        value === mode ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'
      }`}
      onClick={() => onChange(mode)}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="flex bg-gray-100 p-1 rounded-lg">
      {btn('day', t('calendar.viewToggle.day'))}
      {btn('week', t('calendar.viewToggle.week'))}
      {btn('month', t('calendar.viewToggle.month'))}
      {btn('gantt', 'Gantt', <BarChart2 size={13} className="-scale-x-100" />)}
    </div>
  );
};

export default ViewToggle;
