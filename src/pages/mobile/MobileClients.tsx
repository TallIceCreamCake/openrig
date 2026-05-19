import React, { useEffect, useState } from 'react';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  image_url: string | null;
  client_type: 'person' | 'company';
};

const MobileClients: React.FC = () => {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await supabase
          .from('clients')
          .select('id, name, email, phone, company, image_url, client_type')
          .order('created_at', { ascending: false });
        setRows((data || []) as ClientRow[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <MobileLayout>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Clients</h1>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">Aucun client enregistré.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`/m/clients/${row.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm active:scale-[.99] dark:border-gray-700 dark:bg-gray-900/70"
            >
              <div className="flex items-center gap-3">
                {row.image_url ? (
                  <img src={row.image_url} alt={row.name} className="h-10 w-10 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-300">
                    {row.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{row.name}</div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      row.client_type === 'company'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {row.client_type === 'company' ? 'Entreprise' : 'Client'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {row.client_type === 'company'
                      ? (row.email || row.phone || 'Entreprise')
                      : (row.company || row.email || row.phone || '—')}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </MobileLayout>
  );
};

export default MobileClients;
