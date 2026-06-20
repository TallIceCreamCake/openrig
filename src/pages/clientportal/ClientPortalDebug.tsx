import React, { useEffect, useState } from 'react';
import ClientPortalLayout from './ClientPortalLayout';

type Doc = Record<string, unknown>;
type QueryResult = { count: number; error: string | null; docs: Doc[] };
type DebugData = {
  client_id: string;
  company_client_id: string | null;
  clientIds: string[];
  rentals: Doc[];
  rental_ids: string[];
  by_client_id: QueryResult;
  by_rental_id: QueryResult;
  last_10_in_db: QueryResult;
};

const DOC_COLS = ['invoice_number', 'document_type', 'status', 'quote_status', 'client_id', 'rental_id'];

const DocTable: React.FC<{ result: QueryResult }> = ({ result }) => {
  if (result.error) return <p className="text-xs text-red-600 font-mono">Erreur Supabase : {result.error}</p>;
  if (result.docs.length === 0) return <p className="text-xs text-gray-400 italic">Aucun document.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100">
            {DOC_COLS.map((h) => (
              <th key={h} className="text-left px-2 py-1 font-semibold text-gray-500 border border-gray-200 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.docs.map((doc, i) => (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              {DOC_COLS.map((col) => (
                <td key={col} className="px-2 py-1 font-mono text-[10px] border border-gray-200 max-w-[180px] truncate">
                  {doc[col] == null ? <span className="text-red-400">NULL</span> : String(doc[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DebugContent: React.FC = () => {
  const [data, setData] = useState<DebugData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('cp_token') || '';
    fetch('/api/client-portal/debug-docs', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="p-8 text-red-600 font-mono text-sm">{err}</div>;
  if (!data) return <div className="p-8 text-gray-400 text-sm">Chargement…</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Debug — Documents portail</h1>

      <Card title="Identité client">
        <Row label="client_id (personne)" value={data.client_id} />
        <Row label="company_client_id" value={data.company_client_id ?? '—'} />
        <Row label="clientIds filtrés" value={JSON.stringify(data.clientIds)} />
      </Card>

      <Card title={`Projets (rentals) trouvés — ${data.rentals.length}`}>
        {data.rentals.length === 0
          ? <p className="text-xs text-gray-400 italic">Aucun projet lié à ces client_id.</p>
          : data.rentals.map((r, i) => (
              <div key={i} className="text-xs font-mono text-gray-700">
                {String(r.id)} — {String(r.title ?? '—')} — client_id: {String(r.client_id ?? 'NULL')}
              </div>
            ))
        }
      </Card>

      <Card title={`Par client_id — ${data.by_client_id.count} résultat(s)`}>
        <p className="text-xs text-gray-400 mb-2">Cherche dans invoices où client_id IN [{data.clientIds.join(', ')}]</p>
        <DocTable result={data.by_client_id} />
      </Card>

      <Card title={`Par rental_id — ${data.by_rental_id.count} résultat(s)`}>
        <p className="text-xs text-gray-400 mb-2">Cherche dans invoices où rental_id IN [{data.rental_ids.join(', ')}]</p>
        <DocTable result={data.by_rental_id} />
      </Card>

      <Card title={`10 derniers documents dans la DB (tous clients) — ${data.last_10_in_db.count}`}>
        <p className="text-xs text-gray-400 mb-2">Permet de voir ce qui existe réellement dans la table invoices.</p>
        <DocTable result={data.last_10_in_db} />
      </Card>
    </div>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
    </div>
    <div className="p-4 space-y-1.5">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex gap-3 text-sm">
    <span className="text-gray-400 w-48 flex-shrink-0 text-xs">{label}</span>
    <span className="font-mono text-gray-800 text-xs break-all">{value}</span>
  </div>
);

const ClientPortalDebug: React.FC = () => (
  <ClientPortalLayout>
    {() => <DebugContent />}
  </ClientPortalLayout>
);

export default ClientPortalDebug;
