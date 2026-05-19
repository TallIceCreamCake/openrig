import React, { useMemo } from 'react';
import MobileLayout from './MobileLayout';
import { useRentals } from '../../hooks/useRentals';
import { Link } from 'react-router-dom';

const MobilePrestations: React.FC = () => {
  const { rentals, loading } = useRentals();
  const services = useMemo(() => rentals.filter(r => r.type === 'service' && r.status !== 'archived'), [rentals]);
  return (
    <MobileLayout>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Prestations</h1>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : services.length === 0 ? (
        <div className="text-sm text-gray-500">Aucun projet.</div>
      ) : (
        <div className="space-y-3">
          {services.map(r => (
            <Link
              key={r.id}
              to={`/m/prestations/${r.id}`}
              className="block border border-gray-200 rounded-lg p-3 active:scale-[.99] dark:border-gray-700 dark:bg-gray-900/70"
            >
              <div className="text-sm font-medium text-gray-900 dark:text-white">{r.client_name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(r.start_date).toLocaleDateString()} • {r.location || '—'}
              </div>
              <div className="mt-1 text-xs inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                {r.status}
              </div>
            </Link>
          ))}
        </div>
      )}
    </MobileLayout>
  );
};

export default MobilePrestations;
