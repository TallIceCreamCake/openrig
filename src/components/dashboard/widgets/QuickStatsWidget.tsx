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

  const getTrendColor = (change?: number) => {
    if (!change) return 'text-gray-400';
    return change > 0 ? 'text-green-500' : 'text-red-500';
  };

  const { t } = useTranslation();
  return (
    <WidgetCard title={t('dashboard.widgets.quickStats.title')}>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const TrendIcon = getTrendIcon(stat.change);
          const trendColor = getTrendColor(stat.change);
          
          return (
            <div key={index} className="bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <Icon className={`h-5 w-5 ${stat.color}`} />
                {stat.change !== undefined && (
                  <div className="flex items-center space-x-1">
                    <TrendIcon className={`h-3 w-3 ${trendColor}`} />
                    <span className={`text-xs font-medium ${trendColor}`}>
                      {Math.abs(stat.change)}%
                    </span>
                  </div>
                )}
              </div>
              
              <div>
                <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-600">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
};

export default QuickStatsWidget;
