import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import WidgetCard from '../WidgetCard';
import { useTranslation } from '../../../context/TranslationContext';

interface StockAlert {
  id: string;
  equipment_name: string;
  current_stock: number;
  minimum_stock: number;
}

interface StockAlertsWidgetProps {
  alerts: StockAlert[];
}

const StockAlertsWidget: React.FC<StockAlertsWidgetProps> = ({ alerts }) => {
  const { t } = useTranslation();
  return (
    <WidgetCard title={t('dashboard.widgets.stockAlerts.title')}>
      <div className="space-y-1.5">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 grid place-items-center">
              <AlertTriangle className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-sm text-gray-500">{t('dashboard.widgets.stockAlerts.empty')}</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <Link
              key={alert.id}
              to={`/equipment/${alert.id}`}
              className="flex items-center gap-3 p-2.5 rounded-xl border border-red-100 bg-red-50/60 hover:bg-red-50 transition-colors"
            >
              <div className="h-8 w-8 rounded-lg bg-red-100 grid place-items-center flex-shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{alert.equipment_name}</div>
                <div className="text-xs text-red-600">
                  {t('dashboard.widgets.stockAlerts.stockLine', { current: alert.current_stock, minimum: alert.minimum_stock })}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </WidgetCard>
  );
};

export default StockAlertsWidget;
