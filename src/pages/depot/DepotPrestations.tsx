import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type PrestationRow = {
  id: string;
  reference_code: string | null;
  title: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  client_name: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const DepotPrestations: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<PrestationRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('rentals')
          .select('id, reference_code, title, status, start_date, end_date, location, clients(name)')
          .neq('status', 'archived')
          .order('start_date', { ascending: false })
          .limit(200);

        if (error) throw error;

        const mapped = (data || []).map((row: any) => ({
          id: row.id as string,
          reference_code: (row.reference_code as string | null) ?? null,
          title: (row.title as string | null) ?? null,
          status: (row.status as string | null) ?? null,
          start_date: (row.start_date as string | null) ?? null,
          end_date: (row.end_date as string | null) ?? null,
          location: (row.location as string | null) ?? null,
          client_name: (row.clients?.name as string | null) ?? null,
        }));

        setRows(mapped);
      } catch (fetchError) {
        console.error('depot prestations load', fetchError);
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
        row.reference_code,
        row.title,
        row.client_name,
        row.location,
        row.status,
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
        <h2 className="text-xl font-semibold text-gray-900">Prestations</h2>
        <p className="mt-1 text-sm text-gray-600">
          Ouvre une prestation en un clic ou scanne son QR dans l&apos;écran scanner.
        </p>
        <div className="relative mt-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Réf, client, lieu..."
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
          <div className="px-5 py-8 text-sm text-gray-500">Aucun projet trouvé.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredRows.map((row) => (
              <Link
                key={row.id}
                to={`/depot/scan?code=${encodeURIComponent(`rental:${row.id}`)}`}
                className="block px-5 py-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {row.reference_code || row.id.slice(0, 8)} · {row.title || 'Prestation'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {row.client_name || 'Client'} · {formatDate(row.start_date)} → {formatDate(row.end_date)}
                    </p>
                    {row.location && (
                      <p className="mt-0.5 text-xs text-gray-400">{row.location}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                    {row.status || '—'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DepotPrestations;

