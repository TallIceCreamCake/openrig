import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { CheckSquare, Square } from 'lucide-react';
import toast from 'react-hot-toast';

type Perm = {
  user_id: string;
  email: string;
  full_name: string;
  superadmin: boolean;
  can_create_service: boolean;
  can_edit_equipment: boolean;
  can_manage_warehouses: boolean;
  can_manage_personnel: boolean;
  can_manage_clients: boolean;
  can_view_accounting: boolean;
  can_manage_maintenance: boolean;
  can_manage_notifications: boolean;
  can_edit_settings: boolean;
  eq_view_menu: boolean;
  eq_view_list: boolean;
  eq_view_detail: boolean;
  eq_create: boolean;
  eq_edit: boolean;
  eq_delete: boolean;
  eq_manage_pricing: boolean;
  eq_manage_stock: boolean;
  eq_manage_serials: boolean;
  eq_upload_media: boolean;
  eq_export: boolean;
  eq_import: boolean;
  eq_bulk_actions: boolean;
  eq_archive: boolean;
  eq_manage_categories: boolean;
  eq_view_costs: boolean;
  eq_view_margins: boolean;
  rn_view_menu: boolean; rn_view_list: boolean; rn_view_detail: boolean; rn_create: boolean; rn_edit: boolean; rn_delete: boolean; rn_change_status: boolean; rn_manage_items: boolean; rn_generate_documents: boolean; rn_send_documents: boolean; rn_accept_service: boolean; rn_refuse_service: boolean; rn_export: boolean; rn_import: boolean; rn_view_reports: boolean; rn_view_calendar: boolean; rn_schedule: boolean; rn_invoice: boolean; rn_discount: boolean; rn_view_costs: boolean; rn_view_margins: boolean;
  cl_view_menu: boolean; cl_view_list: boolean; cl_view_detail: boolean; cl_create: boolean; cl_edit: boolean; cl_delete: boolean; cl_manage_contacts: boolean; cl_view_invoices: boolean; cl_export: boolean; cl_import: boolean; cl_view_reports: boolean;
};

// Fonctionnalités non-"équipement"
const rentalsVisibility: { key: keyof Perm; label: string }[] = [
  { key: 'rn_view_menu', label: 'Voir menu' },
  { key: 'rn_view_list', label: 'Voir liste' },
  { key: 'rn_view_detail', label: 'Voir détail' },
  { key: 'rn_view_calendar', label: 'Voir calendrier' },
  { key: 'rn_view_reports', label: 'Voir rapports' },
];
const rentalsCrud: { key: keyof Perm; label: string }[] = [
  { key: 'rn_create', label: 'Créer' },
  { key: 'rn_edit', label: 'Éditer' },
  { key: 'rn_delete', label: 'Supprimer' },
  { key: 'rn_change_status', label: 'Changer statut' },
  { key: 'rn_manage_items', label: 'Gérer items' },
  { key: 'rn_schedule', label: 'Planifier' },
  { key: 'rn_invoice', label: 'Facturer' },
  { key: 'rn_discount', label: 'Remises' },
];
const rentalsDocs: { key: keyof Perm; label: string }[] = [
  { key: 'rn_generate_documents', label: 'Générer documents' },
  { key: 'rn_send_documents', label: 'Envoyer documents' },
  { key: 'rn_export', label: 'Exporter' },
  { key: 'rn_import', label: 'Importer' },
  { key: 'rn_view_costs', label: 'Voir coûts' },
  { key: 'rn_view_margins', label: 'Voir marges' },
  { key: 'rn_accept_service', label: 'Accepter prestation' },
  { key: 'rn_refuse_service', label: 'Refuser prestation' },
];
const clientsVisibility: { key: keyof Perm; label: string }[] = [
  { key: 'cl_view_menu', label: 'Voir menu' },
  { key: 'cl_view_list', label: 'Voir liste' },
  { key: 'cl_view_detail', label: 'Voir détail' },
  { key: 'cl_view_reports', label: 'Voir rapports' },
];
const clientsCrud: { key: keyof Perm; label: string }[] = [
  { key: 'cl_create', label: 'Créer' },
  { key: 'cl_edit', label: 'Éditer' },
  { key: 'cl_delete', label: 'Supprimer' },
  { key: 'cl_manage_contacts', label: 'Contacts' },
  { key: 'cl_view_invoices', label: 'Voir factures' },
  { key: 'cl_export', label: 'Exporter' },
  { key: 'cl_import', label: 'Importer' },
];
const warehousesFields: { key: keyof Perm; label: string }[] = [
  { key: 'can_manage_warehouses', label: 'Gérer entrepôts' },
];
const personnelFields: { key: keyof Perm; label: string }[] = [
  { key: 'can_manage_personnel', label: 'Gérer personnel' },
];
const accountingFields: { key: keyof Perm; label: string }[] = [
  { key: 'can_view_accounting', label: 'Voir comptabilité' },
];
const maintenanceFields: { key: keyof Perm; label: string }[] = [
  { key: 'can_manage_maintenance', label: 'Gérer maintenance' },
];
const notificationsFields: { key: keyof Perm; label: string }[] = [
  { key: 'can_manage_notifications', label: 'Gérer notifications' },
];
const settingsFields: { key: keyof Perm; label: string }[] = [
  { key: 'can_edit_settings', label: 'Éditer paramètres' },
];

const eqVisibility: { key: keyof Perm; label: string }[] = [
  { key: 'eq_view_menu', label: 'Voir menu' },
  { key: 'eq_view_list', label: 'Voir liste' },
  { key: 'eq_view_detail', label: 'Voir détail' },
  { key: 'eq_view_history', label: 'Voir historique' },
  { key: 'eq_view_audit', label: 'Voir audit' },
  { key: 'eq_view_reports', label: 'Voir rapports' },
];

const eqCrud: { key: keyof Perm; label: string }[] = [
  { key: 'can_edit_equipment', label: 'Éditer (global)' },
  { key: 'eq_create', label: 'Créer' },
  { key: 'eq_edit', label: 'Éditer' },
  { key: 'eq_delete', label: 'Supprimer' },
  { key: 'eq_archive', label: 'Archiver/Restaurer' },
  { key: 'eq_change_status', label: 'Changer statut' },
  { key: 'eq_manage_categories', label: 'Catégories/Types' },
  { key: 'eq_tag', label: 'Taguer' },
  { key: 'eq_manage_tags', label: 'Gérer tags' },
];

const eqStockSerials: { key: keyof Perm; label: string }[] = [
  { key: 'eq_manage_stock', label: 'Gérer stock' },
  { key: 'eq_manage_serials', label: 'Gérer numéros de série' },
  { key: 'eq_assign_warehouse', label: 'Assigner entrepôt' },
  { key: 'eq_transfer_stock', label: 'Transférer stock' },
  { key: 'eq_generate_barcodes', label: 'Générer codes-barres' },
  { key: 'eq_scan_barcodes', label: 'Scanner codes-barres' },
  { key: 'eq_print_labels', label: 'Imprimer étiquettes' },
  { key: 'eq_bulk_actions', label: 'Actions groupées' },
];

const eqMediaDocs: { key: keyof Perm; label: string }[] = [
  { key: 'eq_upload_media', label: 'Uploader média' },
  { key: 'eq_view_documents', label: 'Voir documents' },
  { key: 'eq_manage_documents', label: 'Gérer documents' },
  { key: 'eq_export', label: 'Exporter' },
  { key: 'eq_import', label: 'Importer' },
  { key: 'eq_share', label: 'Partager' },
  { key: 'eq_publish_catalog', label: 'Publier au catalogue' },
];

const eqPricingMaint: { key: keyof Perm; label: string }[] = [
  { key: 'eq_manage_pricing', label: 'Gérer tarification' },
  { key: 'eq_view_costs', label: 'Voir coûts' },
  { key: 'eq_view_margins', label: 'Voir marges' },
  { key: 'eq_view_maintenance', label: 'Voir maintenance' },
  { key: 'eq_schedule_maintenance', label: 'Planifier maintenance' },
  { key: 'eq_calibrate', label: 'Calibrer' },
  { key: 'eq_deprecate', label: 'Déprécier' },
  { key: 'eq_restore_item', label: 'Restaurer' },
];

const UserRightsEditor: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Perm[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmSuperFor, setConfirmSuperFor] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('app_users')
        .select('id, email, full_name, app_permissions(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped: Perm[] = (data || []).map((u: any) => ({
        user_id: u.id,
        email: u.email,
        full_name: u.full_name || '',
        superadmin: !!u.app_permissions?.superadmin,
        can_create_service: !!u.app_permissions?.can_create_service,
        can_edit_equipment: !!u.app_permissions?.can_edit_equipment,
        can_manage_warehouses: !!u.app_permissions?.can_manage_warehouses,
        can_manage_personnel: !!u.app_permissions?.can_manage_personnel,
        can_manage_clients: !!u.app_permissions?.can_manage_clients,
        can_view_accounting: !!u.app_permissions?.can_view_accounting,
        can_manage_maintenance: !!u.app_permissions?.can_manage_maintenance,
        can_manage_notifications: !!u.app_permissions?.can_manage_notifications,
        can_edit_settings: !!u.app_permissions?.can_edit_settings,
        eq_view_menu: !!u.app_permissions?.eq_view_menu,
        eq_view_list: !!u.app_permissions?.eq_view_list,
        eq_view_detail: !!u.app_permissions?.eq_view_detail,
        eq_create: !!u.app_permissions?.eq_create,
        eq_edit: !!u.app_permissions?.eq_edit,
        eq_delete: !!u.app_permissions?.eq_delete,
        eq_manage_pricing: !!u.app_permissions?.eq_manage_pricing,
        eq_manage_stock: !!u.app_permissions?.eq_manage_stock,
        eq_manage_serials: !!u.app_permissions?.eq_manage_serials,
        eq_upload_media: !!u.app_permissions?.eq_upload_media,
        eq_export: !!u.app_permissions?.eq_export,
        eq_import: !!u.app_permissions?.eq_import,
        eq_bulk_actions: !!u.app_permissions?.eq_bulk_actions,
        eq_archive: !!u.app_permissions?.eq_archive,
        eq_manage_categories: !!u.app_permissions?.eq_manage_categories,
        eq_view_costs: !!u.app_permissions?.eq_view_costs,
        eq_view_margins: !!u.app_permissions?.eq_view_margins,
        rn_view_menu: !!u.app_permissions?.rn_view_menu,
        rn_view_list: !!u.app_permissions?.rn_view_list,
        rn_view_detail: !!u.app_permissions?.rn_view_detail,
        rn_create: !!u.app_permissions?.rn_create,
        rn_edit: !!u.app_permissions?.rn_edit,
        rn_delete: !!u.app_permissions?.rn_delete,
        rn_change_status: !!u.app_permissions?.rn_change_status,
        rn_manage_items: !!u.app_permissions?.rn_manage_items,
        rn_generate_documents: !!u.app_permissions?.rn_generate_documents,
        rn_send_documents: !!u.app_permissions?.rn_send_documents,
        rn_accept_service: !!u.app_permissions?.rn_accept_service,
        rn_refuse_service: !!u.app_permissions?.rn_refuse_service,
        rn_export: !!u.app_permissions?.rn_export,
        rn_import: !!u.app_permissions?.rn_import,
        rn_view_reports: !!u.app_permissions?.rn_view_reports,
        rn_view_calendar: !!u.app_permissions?.rn_view_calendar,
        rn_schedule: !!u.app_permissions?.rn_schedule,
        rn_invoice: !!u.app_permissions?.rn_invoice,
        rn_discount: !!u.app_permissions?.rn_discount,
        rn_view_costs: !!u.app_permissions?.rn_view_costs,
        rn_view_margins: !!u.app_permissions?.rn_view_margins,
        cl_view_menu: !!u.app_permissions?.cl_view_menu,
        cl_view_list: !!u.app_permissions?.cl_view_list,
        cl_view_detail: !!u.app_permissions?.cl_view_detail,
        cl_create: !!u.app_permissions?.cl_create,
        cl_edit: !!u.app_permissions?.cl_edit,
        cl_delete: !!u.app_permissions?.cl_delete,
        cl_manage_contacts: !!u.app_permissions?.cl_manage_contacts,
        cl_view_invoices: !!u.app_permissions?.cl_view_invoices,
        cl_export: !!u.app_permissions?.cl_export,
        cl_import: !!u.app_permissions?.cl_import,
        cl_view_reports: !!u.app_permissions?.cl_view_reports,
      }));
      setRows(mapped);
    } catch (e) {
      console.error(e);
      toast.error('Impossible de charger les droits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (user_id: string, key: keyof Perm) => {
    try {
      const next = rows.map(r => r.user_id === user_id ? { ...r, [key]: !r[key] } : r);
      setRows(next);
      const row = next.find(r => r.user_id === user_id)!;
      const payload: any = { user_id };
      if (key === 'superadmin') payload.superadmin = row.superadmin;
      else payload[key] = row[key];
      const { error } = await supabase.from('app_permissions').upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      toast.success('Droits mis à jour');
    } catch (e) {
      console.error(e);
      toast.error('Échec de la mise à jour');
      load();
    }
  };

  if (!user?.superadmin) {
    return <div className="text-sm text-gray-500">Seul un superadmin peut modifier les droits des utilisateurs.</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Droits des utilisateurs</h3>
        <p className="text-sm text-gray-500">Activez/désactivez les permissions. Superadmin a tous les droits.</p>
      </div>
      {loading ? (
        <div className="p-6 text-sm text-gray-500">Chargement…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Superadmin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fonctionnalités</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map(r => (
                <tr key={r.user_id}>
                  <td className="px-4 py-2 text-sm">
                    <div className="font-medium text-gray-900">{r.full_name || r.email}</div>
                    <div className="text-gray-500">{r.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => {
                        if (!r.superadmin) { setConfirmSuperFor(r.user_id); return; }
                        toggle(r.user_id, 'superadmin');
                      }}
                      className="text-gray-700 hover:text-gray-900 inline-flex items-center"
                    >
                      {(r.superadmin) ? <CheckSquare className="h-4 w-4 mr-1" /> : <Square className="h-4 w-4 mr-1" />} Superadmin
                    </button>
                  </td>
                  <td className="px-4 py-2 space-y-5">
                    {/* Équipements */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Équipements</div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">Visibilité</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {eqVisibility.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">CRUD & Statut</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {eqCrud.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">Stock & Séries</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {eqStockSerials.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">Média & Documents</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {eqMediaDocs.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">Tarifs & Maintenance</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {eqPricingMaint.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Prestations / Locations */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Prestations / Locations</div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">Visibilité</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {rentalsVisibility.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">CRUD & Gestion</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {rentalsCrud.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">Documents & Divers</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {rentalsDocs.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Clients */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Clients</div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">Visibilité</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {clientsVisibility.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-gray-500 mb-1">CRUD & Gestion</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {clientsCrud.map(f => (
                              <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                                {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                                <span className="text-xs">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Entrepôts */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Entrepôts</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {warehousesFields.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Personnel */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Personnel</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {personnelFields.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Comptabilité */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Comptabilité</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {accountingFields.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Maintenance */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Maintenance</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {maintenanceFields.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notifications */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Notifications</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {notificationsFields.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Paramètres */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Paramètres</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {settingsFields.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Visibilité</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {eqVisibility.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">CRUD & Statut</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {eqCrud.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Stock & Séries</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {eqStockSerials.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Média & Documents</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {eqMediaDocs.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Tarifs & Maintenance</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {eqPricingMaint.map(f => (
                          <button key={f.key as string} onClick={() => { if (!r.superadmin) toggle(r.user_id, f.key); }} className={`text-left inline-flex items-center ${r.superadmin ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900'}`} disabled={r.superadmin}>
                            {(r.superadmin || r[f.key]) ? <CheckSquare className="h-4 w-4 mr-2" /> : <Square className="h-4 w-4 mr-2" />}
                            <span className="text-xs">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {confirmSuperFor && (
            <div className="fixed inset-0 z-[12040] flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-5">
                <h4 className="text-lg font-medium text-gray-900 mb-2">Confirmer Superadmin</h4>
                <p className="text-sm text-gray-600">Accorder le rôle Superadmin donne tous les droits et verrouille les autres permissions. Confirmez-vous ?</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="px-3 py-2 rounded-md border border-gray-300 text-gray-700" onClick={() => setConfirmSuperFor(null)}>Annuler</button>
                  <button
                    className="px-3 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700"
                    onClick={async () => { await toggle(confirmSuperFor!, 'superadmin'); setConfirmSuperFor(null); }}
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserRightsEditor;
