import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, Crown, TrendingUp } from 'lucide-react';
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
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="h-10 w-10 rounded-xl bg-gray-100 grid place-items-center">
              <Users className="h-5 w-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">{t('dashboard.widgets.topClients.empty')}</p>
          </div>
        ) : (
          clients.map((client, index) => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              className="block p-2.5 hover:bg-gray-50 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`relative h-10 w-10 flex-shrink-0 rounded-xl grid place-items-center text-sm font-semibold ${
                  index === 0 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-gray-100 text-gray-600'
                }`}>
                  {getInitials(client.name)}
                  {index === 0 && (
                    <Crown className="absolute -top-1.5 -right-1.5 h-4 w-4 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {client.name}
                    </p>
                    <span className="text-sm font-semibold text-emerald-600 tabular-nums flex-shrink-0">
                      {currencyFormatter.format(client.totalSpent)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-gray-500 truncate">
                      {client.rentalsCount > 1
                        ? t('dashboard.widgets.topClients.rentals.plural', { count: client.rentalsCount })
                        : t('dashboard.widgets.topClients.rentals.singular', { count: client.rentalsCount })}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {dateFormatter.format(new Date(client.lastRental))}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}

        {clients.length > 0 && (
          <div className="pt-2 mt-1 border-t border-gray-100">
            <Link
              to="/clients"
              className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
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
