import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ClientPortalLayout from './ClientPortalLayout';
import {
  Loader2, AlertCircle, ArrowLeft, CalendarDays, MapPin, Truck,
  Package, Users, FileText, Receipt, FileCheck, ChevronRight,
  Hash, StickyNote,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
type RentalDetail = {
  id: string;
  reference_code: string | null;
  title: string | null;
  type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  description: string | null;
  notes: string | null;
  total_price: number | null;
  created_at: string;
};

type EquipmentItem = {
  id: string;
  quantity: number;
  price_per_day: number | null;
  group_id: string | null;
  position: number | null;
  is_external: boolean;
  external_name: string | null;
  external_type: string | null;
  equipment: { id: string; name: string; type: string } | null;
};

type ItemGroup = { id: string; name: string; position: number; color: string | null };

type PersonnelMember = {
  id: string;
  first_name: string;
  last_name: string;
  role: string | null;
};

type Document = {
  id: string;
  invoice_number: string;
  document_type: string;
  status: string;
  quote_status: string | null;
  amount_ttc: number;
  due_date: string | null;
  created_at: string;
};

type ProjectData = {
  rental: RentalDetail;
  items: EquipmentItem[];
  groups: ItemGroup[];
  personnel: PersonnelMember[];
  documents: Document[];
};

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:       { label: 'Brouillon',   className: 'bg-gray-100 text-gray-600' },
  pending:     { label: 'En attente',  className: 'bg-amber-100 text-amber-700' },
  confirmed:   { label: 'Confirmé',    className: 'bg-emerald-100 text-emerald-700' },
  in_progress: { label: 'En cours',    className: 'bg-blue-100 text-blue-700' },
  completed:   { label: 'Terminé',     className: 'bg-slate-100 text-slate-600' },
  cancelled:   { label: 'Annulé',      className: 'bg-red-100 text-red-600' },
};

const DOC_TYPE: Record<string, { label: string; icon: React.ReactNode }> = {
  quote:           { label: 'Devis',            icon: <FileCheck className="h-4 w-4" /> },
  invoice:         { label: 'Facture',          icon: <Receipt className="h-4 w-4" /> },
  deposit_invoice: { label: "Facture d'acompte",icon: <Receipt className="h-4 w-4" /> },
  credit_note:     { label: 'Avoir',            icon: <FileText className="h-4 w-4" /> },
};

const DOC_STATUS: Record<string, string> = {
  draft:    'Brouillon',
  sent:     'Envoyé(e)',
  paid:     'Payé(e)',
  overdue:  'En retard',
  accepted: 'Accepté',
  declined: 'Refusé',
  expired:  'Expiré',
  invoiced: 'Facturé',
};

const fmt = (n: number | null) =>
  n != null ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—';

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

// ── Detail content ────────────────────────────────────────────────────────────
const ProjectDetailContent: React.FC<{ id: string }> = ({ id }) => {
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('cp_token') || '';
    fetch(`/api/client-portal/projects/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 403) throw new Error('Accès refusé.');
        if (!r.ok) throw new Error(`Erreur ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-100 px-5 py-4 text-red-700 text-sm">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        {error || 'Projet introuvable.'}
      </div>
    );
  }

  const { rental, items, groups, personnel, documents } = data;
  const status = STATUS_CONFIG[rental.status] || { label: rental.status, className: 'bg-gray-100 text-gray-600' };

  // Group items by group_id
  const groupedItems = groups.map((g) => ({
    group: g,
    items: items.filter((i) => i.group_id === g.id),
  }));
  const ungroupedItems = items.filter((i) => !i.group_id);

  const itemName = (item: EquipmentItem) =>
    item.is_external ? (item.external_name || 'Matériel externe') : (item.equipment?.name || '—');

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link to="/espaceclient/projets" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Mes projets
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            {rental.reference_code && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                <Hash className="h-3.5 w-3.5" />
                {rental.reference_code}
              </div>
            )}
            <h1 className="text-xl font-bold text-gray-900">{rental.title || '(sans titre)'}</h1>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold flex-shrink-0 ${status.className}`}>
            {status.label}
          </span>
        </div>

        {/* Key info grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(rental.start_date || rental.end_date) && (
            <InfoCell icon={<CalendarDays className="h-4 w-4" />} label="Dates">
              {fmtDate(rental.start_date)}
              {rental.end_date && rental.end_date !== rental.start_date && (
                <> → {fmtDate(rental.end_date)}</>
              )}
            </InfoCell>
          )}
          {rental.location && (
            <InfoCell icon={<MapPin className="h-4 w-4" />} label="Lieu">
              {rental.location}
            </InfoCell>
          )}
          {rental.total_price != null && (
            <InfoCell icon={<Receipt className="h-4 w-4" />} label="Montant total">
              <span className="font-semibold">{fmt(rental.total_price)}</span>
            </InfoCell>
          )}
          {rental.delivery_address && (
            <InfoCell icon={<Truck className="h-4 w-4" />} label="Adresse de livraison">
              {rental.delivery_address}
            </InfoCell>
          )}
          {rental.pickup_address && (
            <InfoCell icon={<Truck className="h-4 w-4 scale-x-[-1]" />} label="Adresse de retour">
              {rental.pickup_address}
            </InfoCell>
          )}
        </div>

        {/* Description */}
        {rental.description && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Description</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{rental.description}</p>
          </div>
        )}

        {/* Notes */}
        {rental.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              <StickyNote className="h-3.5 w-3.5 text-gray-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</p>
            </div>
            <p className="text-sm text-gray-600 whitespace-pre-line">{rental.notes}</p>
          </div>
        )}
      </div>

      {/* Equipment */}
      {items.length > 0 && (
        <Section icon={<Package className="h-5 w-5" />} title={`Matériel (${items.length} ligne${items.length > 1 ? 's' : ''})`}>
          <div className="divide-y divide-gray-100">
            {/* Grouped items */}
            {groupedItems.filter((g) => g.items.length > 0).map(({ group, items: gItems }) => (
              <div key={group.id}>
                <div className="px-5 py-2 bg-gray-50 flex items-center gap-2">
                  {group.color && (
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                  )}
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.name}</span>
                </div>
                {gItems.map((item) => <EquipmentRow key={item.id} item={item} itemName={itemName(item)} />)}
              </div>
            ))}
            {/* Ungrouped items */}
            {ungroupedItems.map((item) => <EquipmentRow key={item.id} item={item} itemName={itemName(item)} />)}
          </div>
        </Section>
      )}

      {/* Personnel */}
      {personnel.length > 0 && (
        <Section icon={<Users className="h-5 w-5" />} title={`Équipe (${personnel.length} personne${personnel.length > 1 ? 's' : ''})`}>
          <div className="px-5 py-3 divide-y divide-gray-100">
            {personnel.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-700))' }}
                >
                  {p.first_name.charAt(0)}{p.last_name.charAt(0)}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.first_name} {p.last_name}</p>
                  {p.role && <p className="text-xs text-gray-400">{p.role}</p>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <Section icon={<FileText className="h-5 w-5" />} title="Documents liés">
          <div className="divide-y divide-gray-100">
            {documents.map((doc) => {
              const docType = DOC_TYPE[doc.document_type] || { label: doc.document_type, icon: <FileText className="h-4 w-4" /> };
              const docStatus = doc.document_type === 'quote'
                ? DOC_STATUS[doc.quote_status || 'draft'] || doc.quote_status
                : DOC_STATUS[doc.status] || doc.status;
              const pdfPath = doc.document_type === 'quote'
                ? `/api/client-portal/quotes/${doc.id}/pdf`
                : `/api/client-portal/invoices/${doc.id}/pdf`;

              return (
                <div key={doc.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <span className="text-gray-400">{docType.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 font-mono">{doc.invoice_number}</p>
                      <span className="text-xs text-gray-400">{docType.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{docStatus} — {fmt(doc.amount_ttc)}</p>
                  </div>
                  <a
                    href={pdfPath}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      const token = localStorage.getItem('cp_token') || '';
                      fetch(pdfPath, { headers: { Authorization: `Bearer ${token}` } })
                        .then((r) => r.ok ? r.blob() : Promise.reject())
                        .then((blob) => {
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url; a.download = `${doc.invoice_number}.pdf`; a.click();
                          URL.revokeObjectURL(url);
                        })
                        .catch(() => alert('Impossible de télécharger ce document.'));
                    }}
                    className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0"
                    title="Télécharger le PDF"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────
const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
      <span className="text-gray-400">{icon}</span>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
    </div>
    {children}
  </div>
);

const InfoCell: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-start gap-2.5">
    <span className="text-gray-300 mt-0.5 flex-shrink-0">{icon}</span>
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{children}</p>
    </div>
  </div>
);

const EquipmentRow: React.FC<{ item: EquipmentItem; itemName: string }> = ({ item, itemName }) => (
  <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
    <span className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
      <Package className="h-3.5 w-3.5 text-gray-400" />
    </span>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 truncate">{itemName}</p>
      {item.is_external && item.external_type && (
        <p className="text-xs text-gray-400">{item.external_type}</p>
      )}
    </div>
    <span className="text-sm font-semibold text-gray-700 tabular-nums flex-shrink-0">
      × {item.quantity}
    </span>
  </div>
);

// ── Page wrapper ──────────────────────────────────────────────────────────────
const ClientPortalProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <ClientPortalLayout>
      {() => (
        <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-10">
          {id ? <ProjectDetailContent id={id} /> : <p className="text-gray-400 text-sm">ID manquant.</p>}
        </div>
      )}
    </ClientPortalLayout>
  );
};

export default ClientPortalProjectDetail;
