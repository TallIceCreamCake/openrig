import React, { useMemo } from 'react';
import { TrendingUp, Euro, Calendar } from 'lucide-react';
import WidgetCard from '../WidgetCard';
import { useTranslation } from '../../../context/TranslationContext';

interface RevenueData {
  today: number;
  thisWeek: number;
  thisMonth: number;
  growth: number;
}

interface RevenueWidgetProps {
  data: RevenueData;
}

const RevenueWidget: React.FC<RevenueWidgetProps> = ({ data }) => {
  const { t, language } = useTranslation();
  const region = language === 'en' ? 'en-US' : 'fr-FR';
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(region, { style: 'currency', currency: 'EUR' }),
    [region],
  );

  return (
    <WidgetCard title={t('dashboard.widgets.revenue.title')}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-green-50 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">{t('dashboard.widgets.revenue.today')}</p>
                <p className="text-2xl font-bold text-green-900">{currencyFormatter.format(data.today)}</p>
              </div>
              <Euro className="h-8 w-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">{t('dashboard.widgets.revenue.thisWeek')}</p>
                <p className="text-xl font-semibold text-blue-900">{currencyFormatter.format(data.thisWeek)}</p>
              </div>
              <Calendar className="h-6 w-6 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-purple-50 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600">{t('dashboard.widgets.revenue.thisMonth')}</p>
                <p className="text-xl font-semibold text-purple-900">{currencyFormatter.format(data.thisMonth)}</p>
              </div>
              <TrendingUp className="h-6 w-6 text-purple-500" />
            </div>
          </div>
        </div>
        
        <div className="pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{t('dashboard.widgets.revenue.growth')}</span>
            <span className={`text-sm font-medium ${
              data.growth >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {data.growth >= 0 ? '+' : ''}{data.growth}%
            </span>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
};

export default RevenueWidget;
