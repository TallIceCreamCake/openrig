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
      <div className="space-y-3">
        {/* Hero figure: today's revenue */}
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">{t('dashboard.widgets.revenue.today')}</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{currencyFormatter.format(data.today)}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-100 grid place-items-center">
              <Euro className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
            <div className="flex items-center gap-2 text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              <p className="text-xs">{t('dashboard.widgets.revenue.thisWeek')}</p>
            </div>
            <p className="text-base font-semibold text-gray-900 tabular-nums mt-1.5">{currencyFormatter.format(data.thisWeek)}</p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
            <div className="flex items-center gap-2 text-gray-500">
              <TrendingUp className="h-3.5 w-3.5" />
              <p className="text-xs">{t('dashboard.widgets.revenue.thisMonth')}</p>
            </div>
            <p className="text-base font-semibold text-gray-900 tabular-nums mt-1.5">{currencyFormatter.format(data.thisMonth)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5">
          <span className="text-sm text-gray-600">{t('dashboard.widgets.revenue.growth')}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            data.growth >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
          }`}>
            {data.growth >= 0 ? '+' : ''}{data.growth}%
          </span>
        </div>
      </div>
    </WidgetCard>
  );
};

export default RevenueWidget;
