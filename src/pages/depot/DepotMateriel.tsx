import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildEquipmentUnitQrValue } from '../../utils/equipmentUnitTracking';

type UnitRow = {
  id: string;
  serial_number: string | null;
  status: string | null;
  qr_code_value: string | null;
  equipment_name: string | null;
  equipment_type: string | null;
  warehouse_name: string | null;
};

const DepotMateriel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<UnitRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await (supabase as any)
          .from('equipment_units')
          .select('id, serial_number, status, qr_code_value, equipment:equipment_id(name, type), warehouse:warehouse_id(name)')
          .order('serial_number', { ascending: true })
          .limit(500);
        if (error) throw error;

        const mapped = (data || []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          serial_number: (row.serial_number as string | null) ?? null,
          status: (row.status as string | null) ?? null,
          qr_code_value: (row.qr_code_value as string | null) ?? null,
          equipment_name: (row.equipment as any)?.name ?? null,
          equipment_type: (row.equipment as any)?.type ?? null,
          warehouse_name: (row.warehouse as any)?.name ?? null,
        }));

        setRows(mapped);
      } catch (fetchError) {
        console.error('depot materiel load', fetchError);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.serial_number,
        row.status,
        row.equipment_name,
        row.equipment_type,
        row.warehouse_name,
        row.qr_code_value,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Matériel unitaire</h2>
        <p className="mt-1 text-sm text-gray-600">
          Recherche un numéro de suivi et ouvre sa fiche directement dans le scanner.
        </p>
        <div className="relative mt-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Numéro, matériel, entrepôt..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-36 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-500">Aucun matériel trouvé.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredRows.map((row) => {
              const code = row.qr_code_value || buildEquipmentUnitQrValue(row.id);
              return (
                <Link
                  key={row.id}
                  to={`/depot/scan?code=${encodeURIComponent(code)}`}
                  className="block px-5 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {row.serial_number || row.id.slice(0, 8)} · {row.equipment_name || 'Matériel'}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {row.equipment_type || 'Type —'} · {row.warehouse_name || 'Sans entrepôt'}
                      </p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                      {row.status || '—'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DepotMateriel;

