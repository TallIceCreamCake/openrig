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
      <div className="space-y-2">
        {alerts.length === 0 ? (
          <p className="text-sm text-gray-500">{t('dashboard.widgets.stockAlerts.empty')}</p>
        ) : (
          alerts.map((alert) => (
            <Link
              key={alert.id}
              to={`/equipment/${alert.id}`}
              className="flex items-center p-2 bg-red-50 text-red-700 rounded-md"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              <div className="flex-1">
                <div className="text-sm font-medium">{alert.equipment_name}</div>
                <div className="text-xs">
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
