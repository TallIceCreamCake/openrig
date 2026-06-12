import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Rental } from '../../../types/rental';
import WidgetCard from '../WidgetCard';
import { useTranslation } from '../../../context/TranslationContext';

interface PendingRentalsWidgetProps {
  rentals: Rental[];
}

const PendingRentalsWidget: React.FC<PendingRentalsWidgetProps> = ({ rentals }) => {
  const { t, language } = useTranslation();
  const region = language === 'en' ? 'en-US' : 'fr-FR';
  const pendingRentals = rentals.filter(rental => rental.status === 'pending');

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(region, { style: 'currency', currency: 'EUR' }),
    [region],
  );

  const formatDate = (date: string) => {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat(region, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(parsed);
  };

  return (
    <WidgetCard title={t('dashboard.widgets.pendingRentals.title')}>
      <div className="space-y-1.5">
        {pendingRentals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="h-10 w-10 rounded-xl bg-gray-100 grid place-items-center">
              <span className="text-base">✓</span>
            </div>
            <p className="text-sm text-gray-500">{t('dashboard.widgets.pendingRentals.empty')}</p>
          </div>
        ) : (
          pendingRentals.map((rental) => (
            <Link
              key={rental.id}
              to={`/rentals/${rental.id}`}
              className="flex justify-between items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm text-gray-900 truncate">{rental.client_name}</div>
                <div className="text-xs text-gray-500">
                  {formatDate(rental.start_date)}
                </div>
              </div>
              <div className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">
                {currencyFormatter.format(Number(rental.total_price || 0))}
              </div>
            </Link>
          ))
        )}
      </div>
    </WidgetCard>
  );
};

export default PendingRentalsWidget;
