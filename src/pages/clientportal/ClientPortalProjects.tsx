import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ClientPortalLayout from './ClientPortalLayout';
import { Loader2, AlertCircle, Layers, CalendarDays, ChevronRight } from 'lucide-react';

type Project = {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  total_price: number | null;
  created_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:       { label: 'Brouillon',   className: 'bg-gray-100 text-gray-600' },
  pending:     { label: 'En attente',  className: 'bg-amber-100 text-amber-700' },
  confirmed:   { label: 'Confirmé',    className: 'bg-emerald-100 text-emerald-700' },
  in_progress: { label: 'En cours',    className: 'bg-blue-100 text-blue-700' },
  completed:   { label: 'Terminé',     className: 'bg-slate-100 text-slate-500' },
  cancelled:   { label: 'Annulé',      className: 'bg-red-100 text-red-600' },
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const fmt = (n: number | null) =>
  n != null
    ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    : '—';

const ProjectsContent: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('cp_token') || '';
    fetch('/api/client-portal/projects', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setProjects(d.projects || []))
      .catch((e) => setError(`Impossible de charger vos projets. (${e.message})`))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-100 px-5 py-4 text-red-700 text-sm">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        {error}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-24">
        <Layers className="h-10 w-10 mx-auto mb-3 text-gray-200" />
        <p className="text-sm text-gray-400">Aucun projet pour le moment.</p>
      </div>
    );
  }

  const active = projects.filter((p) => ['confirmed', 'in_progress'].includes(p.status)).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',     value: String(projects.length) },
          { label: 'En cours',  value: String(active) },
          { label: 'Terminés',  value: String(projects.filter((p) => p.status === 'completed').length) },
          { label: 'Annulés',   value: String(projects.filter((p) => p.status === 'cancelled').length) },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className="text-xl font-bold tabular-nums text-gray-900">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Projet</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Dates</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Lieu</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Montant</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.map((p) => {
              const status = STATUS_CONFIG[p.status] || { label: p.status, className: 'bg-gray-100 text-gray-500' };
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                  <td className="px-5 py-4">
                    <Link to={`/espaceclient/projets/${p.id}`} className="block">
                      <p className="font-medium text-gray-900 group-hover:text-emerald-700 transition-colors">{p.title || '(sans titre)'}</p>
                      <p className="text-xs text-gray-400 mt-0.5 sm:hidden">{fmt(p.total_price)}</p>
                    </Link>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                      <span>{fmtDate(p.start_date)}</span>
                      {p.end_date && p.end_date !== p.start_date && (
                        <span className="text-gray-300">→ {fmtDate(p.end_date)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-gray-500 truncate max-w-[180px]">
                    {p.location || '—'}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums font-semibold text-gray-900 hidden sm:table-cell">
                    {fmt(p.total_price)}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <Link to={`/espaceclient/projets/${p.id}`} className="text-gray-300 group-hover:text-gray-500 transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ClientPortalProjects: React.FC = () => (
  <ClientPortalLayout>
    {() => (
      <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div>
          <p className="text-sm font-medium text-indigo-600 uppercase tracking-wider mb-1">Projets</p>
          <h1 className="text-2xl font-bold text-gray-900">Mes projets</h1>
        </div>
        <ProjectsContent />
      </div>
    )}
  </ClientPortalLayout>
);

export default ClientPortalProjects;
