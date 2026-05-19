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
      <div className="space-y-2">
        {pendingRentals.length === 0 ? (
          <p className="text-sm text-gray-500">{t('dashboard.widgets.pendingRentals.empty')}</p>
        ) : (
          pendingRentals.map((rental) => (
            <Link
              key={rental.id}
              to={`/rentals/${rental.id}`}
              className="block p-2 hover:bg-gray-50 rounded-md"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">{rental.client_name}</div>
                  <div className="text-xs text-gray-500">
                    {formatDate(rental.start_date)}
                  </div>
                </div>
                <div className="text-sm font-medium">
                  {currencyFormatter.format(Number(rental.total_price || 0))}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </WidgetCard>
  );
};

export default PendingRentalsWidget;
