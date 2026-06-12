import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, MapPin, User } from 'lucide-react';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from '../../../context/TranslationContext';
import { UpcomingRentalsSortOrder, UpcomingRentalsWidgetOptions } from '../../../types/dashboard';

const VALID_SORT_ORDERS: readonly UpcomingRentalsSortOrder[] = ['start_asc', 'start_desc', 'client_asc', 'client_desc'];

interface UpcomingRental {
  id: string;
  project_name: string;
  client_name: string;
  client_avatar?: string;
  start_date: string;
  end_date: string;
  location?: string;
  equipment_count: number;
  status: 'confirmed' | 'pending';
  color?: string;
}

interface UpcomingRentalsWidgetProps {
  rentals: UpcomingRental[];
  options?: UpcomingRentalsWidgetOptions;
}

const DEFAULT_OPTIONS: Required<UpcomingRentalsWidgetOptions> = {
  showClient: true,
  showDate: true,
  showLocation: true,
  showEquipmentCount: true,
  showStatus: true,
  limit: 5,
  sortOrder: 'start_asc',
};

const DEFAULT_RENTAL_COLOR = '#9CA3AF';

const getRentalAccentColors = (inputColor?: string) => {
  const iconColor = typeof inputColor === 'string' && inputColor.trim().length > 0
    ? inputColor.trim()
    : DEFAULT_RENTAL_COLOR;

  const hexMatch = iconColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hexMatch) {
    return {
      iconColor,
      backgroundColor: 'rgba(156, 163, 175, 0.18)',
    };
  }

  const raw = hexMatch[1];
  const expanded = raw.length === 3 ? raw.split('').map((char) => `${char}${char}`).join('') : raw;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);

  return {
    iconColor,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.18)`,
  };
};

const UpcomingRentalsWidget: React.FC<UpcomingRentalsWidgetProps> = ({ rentals, options }) => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? enUS : fr;
  const resolvedOptions = useMemo(
    () => ({
      ...DEFAULT_OPTIONS,
      ...(options || {}),
      limit: typeof options?.limit === 'number'
        ? Math.max(3, Math.min(10, Math.round(options.limit)))
        : DEFAULT_OPTIONS.limit,
      sortOrder: options?.sortOrder && VALID_SORT_ORDERS.includes(options.sortOrder)
        ? options.sortOrder
        : DEFAULT_OPTIONS.sortOrder,
    }),
    [options],
  );
  const sortOrder = resolvedOptions.sortOrder;

  const getDateLabel = (dateString: string) => {
    const date = parseISO(dateString);
    if (isToday(date)) return t('dashboard.widgets.upcomingRentals.today');
    if (isTomorrow(date)) return t('dashboard.widgets.upcomingRentals.tomorrow');
    return format(date, 'dd MMM', { locale });
  };

  const sortedRentals = useMemo(() => {
    const next = rentals.slice();
    switch (sortOrder) {
      case 'start_desc':
        next.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
        break;
      case 'client_asc':
        next.sort((a, b) => a.client_name.localeCompare(b.client_name, language === 'en' ? 'en' : 'fr', { sensitivity: 'base' }));
        break;
      case 'client_desc':
        next.sort((a, b) => b.client_name.localeCompare(a.client_name, language === 'en' ? 'en' : 'fr', { sensitivity: 'base' }));
        break;
      case 'start_asc':
      default:
        next.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
        break;
    }
    return next.slice(0, resolvedOptions.limit);
  }, [language, rentals, resolvedOptions.limit, sortOrder]);

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex-1 overflow-y-auto space-y-2">
        {sortedRentals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="h-10 w-10 rounded-xl bg-gray-100 grid place-items-center">
              <ClipboardList className="h-5 w-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">{t('dashboard.widgets.upcomingRentals.empty')}</p>
          </div>
        ) : (
          sortedRentals.map((rental) => {
            const accent = getRentalAccentColors(rental.color);
            return (
              <Link
                key={rental.id}
                to={`/rentals/${rental.id}`}
                className="relative block overflow-hidden rounded-xl border border-gray-100 p-3 pl-4 transition-all hover:bg-gray-50 hover:shadow-sm"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1 rounded-full"
                  style={{ backgroundColor: accent.iconColor }}
                />
                <div className={`flex items-start ${resolvedOptions.showClient ? 'space-x-3' : ''}`}>
                  {resolvedOptions.showClient && (
                    <div className="flex-shrink-0">
                      {rental.client_avatar ? (
                        <img
                          src={rental.client_avatar}
                          alt={rental.client_name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: accent.backgroundColor }}
                        >
                          <ClipboardList className="h-4 w-4" style={{ color: accent.iconColor }} />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {rental.project_name}
                      </p>
                      {resolvedOptions.showStatus && (
                        <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                          rental.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {rental.status === 'confirmed'
                            ? t('dashboard.widgets.upcomingRentals.status.confirmed')
                            : t('dashboard.widgets.upcomingRentals.status.pending')}
                        </span>
                      )}
                    </div>

                    {(resolvedOptions.showClient || resolvedOptions.showDate || resolvedOptions.showLocation) && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        {resolvedOptions.showClient && (
                          <div className="flex items-center space-x-1">
                            <User className="h-3 w-3" />
                            <span className="truncate">{rental.client_name}</span>
                          </div>
                        )}

                        {resolvedOptions.showDate && (
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{getDateLabel(rental.start_date)}</span>
                          </div>
                        )}

                        {resolvedOptions.showLocation && rental.location && (
                          <div className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{rental.location}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {resolvedOptions.showEquipmentCount && (
                      <p className="mt-1 text-xs text-gray-400">
                        {rental.equipment_count > 1
                          ? t('dashboard.widgets.upcomingRentals.equipmentCount.plural', { count: rental.equipment_count })
                          : t('dashboard.widgets.upcomingRentals.equipmentCount.singular', { count: rental.equipment_count })}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}

        {rentals.length > resolvedOptions.limit && (
          <div className="pt-2 mt-1 border-t border-gray-100">
            <Link
              to="/rentals"
              className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <ClipboardList className="h-4 w-4" />
              <span>{t('dashboard.widgets.upcomingRentals.viewAll')}</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpcomingRentalsWidget;
