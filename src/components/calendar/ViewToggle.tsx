import React from 'react';
import { useTranslation } from '../../context/TranslationContext';

interface ViewToggleProps {
  value: 'day' | 'week' | 'month';
  onChange: (value: 'day' | 'week' | 'month') => void;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="flex bg-gray-100 p-1 rounded-lg">
      <button
        className={`px-4 py-1.5 text-sm font-medium rounded-md ${
          value === 'day'
            ? 'bg-white text-gray-900 shadow'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onChange('day')}
      >
        {t('calendar.viewToggle.day')}
      </button>
      <button
        className={`px-4 py-1.5 text-sm font-medium rounded-md ${
          value === 'week'
            ? 'bg-white text-gray-900 shadow'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onChange('week')}
      >
        {t('calendar.viewToggle.week')}
      </button>
      <button
        className={`px-4 py-1.5 text-sm font-medium rounded-md ${
          value === 'month'
            ? 'bg-white text-gray-900 shadow'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onChange('month')}
      >
        {t('calendar.viewToggle.month')}
      </button>
    </div>
  );
};

export default ViewToggle;
