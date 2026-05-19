import React, { useEffect, useState } from 'react';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';

type WarehouseRow = {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
};

const MobileWarehouses: React.FC = () => {
  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await supabase
          .from('warehouses')
          .select('id, name, address, created_at')
          .order('created_at', { ascending: false });
        setRows((data || []) as WarehouseRow[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <MobileLayout>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Entrepôts</h1>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">Aucun entrepôt enregistré.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`/m/entrepots/${row.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm active:scale-[.99] dark:border-gray-700 dark:bg-gray-900/70"
            >
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{row.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{row.address || 'Adresse non renseignée'}</div>
            </Link>
          ))}
        </div>
      )}
    </MobileLayout>
  );
};

export default MobileWarehouses;
