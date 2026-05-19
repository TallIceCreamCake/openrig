import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, Crown, TrendingUp } from 'lucide-react';
import WidgetCard from '../WidgetCard';
import { useTranslation } from '../../../context/TranslationContext';

interface TopClient {
  id: string;
  name: string;
  totalSpent: number;
  rentalsCount: number;
  lastRental: string;
}

interface TopClientsWidgetProps {
  clients: TopClient[];
}

const getInitials = (name?: string | null) => {
  if (!name) return '?';
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() || '');
  const joined = letters.join('').slice(0, 2);
  return joined || '?';
};

const TopClientsWidget: React.FC<TopClientsWidgetProps> = ({ clients }) => {
  const { t, language } = useTranslation();
  const region = language === 'en' ? 'en-US' : 'fr-FR';
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(region, { style: 'currency', currency: 'EUR' }),
    [region],
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(region),
    [region],
  );
  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex-shrink-0 mb-4">
        <h3 className="text-sm font-medium text-gray-700">{t('dashboard.widgets.topClients.heading')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3">
        {clients.length === 0 ? (
          <div className="text-center py-4">
            <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">{t('dashboard.widgets.topClients.empty')}</p>
          </div>
        ) : (
          clients.map((client, index) => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              className="block p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="relative h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                  {getInitials(client.name)}
                  {index === 0 && (
                    <Crown className="absolute -top-1 -right-1 h-4 w-4 text-yellow-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {client.name}
                    </p>
                    <span className="text-sm font-semibold text-green-600">
                      {currencyFormatter.format(client.totalSpent)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">
                      {client.rentalsCount > 1
                        ? t('dashboard.widgets.topClients.rentals.plural', { count: client.rentalsCount })
                        : t('dashboard.widgets.topClients.rentals.singular', { count: client.rentalsCount })}
                    </span>
                    <span className="text-xs text-gray-400">
                      {dateFormatter.format(new Date(client.lastRental))}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
        
        {clients.length > 0 && (
          <div className="pt-2 border-t">
            <Link
              to="/clients"
              className="flex items-center justify-center space-x-1 text-sm text-blue-600 hover:text-blue-800"
            >
              <TrendingUp className="h-4 w-4" />
              <span>{t('dashboard.widgets.topClients.viewAll')}</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopClientsWidget;
