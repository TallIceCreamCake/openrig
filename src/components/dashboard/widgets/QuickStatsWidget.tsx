import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import WidgetCard from '../WidgetCard';
import { useTranslation } from '../../../context/TranslationContext';

interface QuickStat {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ComponentType<any>;
  color: string;
}

interface QuickStatsWidgetProps {
  stats: QuickStat[];
}

const QuickStatsWidget: React.FC<QuickStatsWidgetProps> = ({ stats }) => {
  const getTrendIcon = (change?: number) => {
    if (!change) return Minus;
    return change > 0 ? TrendingUp : TrendingDown;
  };

  const { t } = useTranslation();
  return (
    <WidgetCard title={t('dashboard.widgets.quickStats.title')}>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const TrendIcon = getTrendIcon(stat.change);

          return (
            <div key={index} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 transition-colors hover:bg-gray-50">
              <div className="flex items-center justify-between mb-2.5">
                <div className="h-8 w-8 rounded-lg bg-white shadow-sm grid place-items-center">
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                {stat.change !== undefined && (
                  <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    !stat.change ? 'bg-gray-100 text-gray-500' : stat.change > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}>
                    <TrendIcon className="h-3 w-3" />
                    {Math.abs(stat.change)}%
                  </div>
                )}
              </div>

              <div>
                <p className="text-xl font-bold text-gray-900 tabular-nums leading-tight">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
};

export default QuickStatsWidget;
