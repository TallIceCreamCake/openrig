import React, { useEffect, useState } from 'react';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';

type EquipmentRow = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  description: string | null;
  image_url: string | null;
};

const MobileEquipment: React.FC = () => {
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await supabase
          .from('equipment')
          .select('id, name, type, subtype, description, image_url')
          .order('created_at', { ascending: false });
        setRows((data || []) as EquipmentRow[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <MobileLayout>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Matériel</h1>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">Aucun matériel enregistré.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`/m/materiel/${row.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm active:scale-[.99] dark:border-gray-700 dark:bg-gray-900/70"
            >
              <div className="flex gap-3">
                {row.image_url ? (
                  <img
                    src={row.image_url}
                    alt={row.name}
                    className="h-16 w-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-500 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-400">
                    —
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{row.name}</div>
                  {row.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{row.description}</div>
                  )}
                  <div className="mt-2 grid gap-1 text-xs text-gray-600 dark:text-gray-300">
                    <div>Type : <span className="text-gray-900 dark:text-white">{row.type}</span></div>
                    <div>Sous-type : <span className="text-gray-900 dark:text-white">{row.subtype || '—'}</span></div>
                    <div>Emplacement : <span className="text-gray-900 dark:text-white">À venir</span></div>
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

export default MobileEquipment;
