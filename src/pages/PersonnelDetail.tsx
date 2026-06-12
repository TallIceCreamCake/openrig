import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ClipboardList,
  CreditCard,
  Edit,
  Package,
  Save,
  Settings2,
  Shield,
  UserCircle2,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const permissionDefaults = {
  superadmin: false,
  can_create_service: false,
  can_edit_equipment: false,
  can_manage_warehouses: false,
  can_manage_personnel: false,
  can_manage_clients: false,
  can_view_accounting: false,
  can_manage_maintenance: false,
  can_manage_notifications: false,
  can_edit_settings: false,
  eq_view_menu: false,
  eq_view_list: false,
  eq_view_detail: false,
  eq_view_history: false,
  eq_view_audit: false,
  eq_view_reports: false,
  eq_create: false,
  eq_edit: false,
  eq_delete: false,
  eq_archive: false,
  eq_change_status: false,
  eq_manage_categories: false,
  eq_tag: false,
  eq_manage_tags: false,
  eq_manage_stock: false,
  eq_manage_serials: false,
  eq_assign_warehouse: false,
  eq_transfer_stock: false,
  eq_generate_barcodes: false,
  eq_scan_barcodes: false,
  eq_print_labels: false,
  eq_bulk_actions: false,
  eq_upload_media: false,
  eq_view_documents: false,
  eq_manage_documents: false,
  eq_export: false,
  eq_import: false,
  eq_share: false,
  eq_publish_catalog: false,
  eq_manage_pricing: false,
  eq_view_costs: false,
  eq_view_margins: false,
  eq_view_maintenance: false,
  eq_schedule_maintenance: false,
  eq_calibrate: false,
  eq_deprecate: false,
  eq_restore_item: false,
  rn_view_menu: false,
  rn_view_list: false,
  rn_view_detail: false,
  rn_view_calendar: false,
  rn_view_reports: false,
  rn_create: false,
  rn_edit: false,
  rn_delete: false,
  rn_change_status: false,
  rn_manage_items: false,
  rn_schedule: false,
  rn_invoice: false,
  rn_discount: false,
  rn_generate_documents: false,
  rn_send_documents: false,
  rn_export: false,
  rn_import: false,
  rn_view_costs: false,
  rn_view_margins: false,
  rn_accept_service: false,
  rn_refuse_service: false,
  cl_view_menu: false,
  cl_view_list: false,
  cl_view_detail: false,
  cl_view_reports: false,
  cl_create: false,
  cl_edit: false,
  cl_delete: false,
  cl_manage_contacts: false,
  cl_view_invoices: false,
  cl_export: false,
  cl_import: false,
  wh_view_menu: false,
  wh_view_list: false,
  wh_view_detail: false,
  wh_view_reports: false,
  wh_audit: false,
  wh_create: false,
  wh_edit: false,
  wh_delete: false,
  wh_manage_stock: false,
  wh_transfer: false,
  wh_print_labels: false,
  wh_export: false,
  wh_import: false,
  pe_view_menu: false,
  pe_view_list: false,
  pe_view_detail: false,
  pe_view_reports: false,
  pe_create_user: false,
  pe_edit_user: false,
  pe_delete_user: false,
  pe_manage_roles: false,
  pe_manage_permissions: false,
  pe_view_activities: false,
  pe_schedule: false,
  pe_export: false,
  pe_import: false,
  ac_view_menu: false,
  ac_view_dashboard: false,
  ac_view_invoices: false,
  ac_view_payments: false,
  ac_view_reports: false,
  ac_create_invoice: false,
  ac_edit_invoice: false,
  ac_delete_invoice: false,
  ac_send_invoice: false,
  ac_mark_paid: false,
  ac_refund: false,
  ac_manage_taxes: false,
  ac_manage_accounts: false,
  ac_export: false,
  ac_import: false,
  mt_view_menu: false,
  mt_view_list: false,
  mt_view_detail: false,
  mt_view_calendar: false,
  mt_view_reports: false,
  mt_create_task: false,
  mt_edit_task: false,
  mt_delete_task: false,
  mt_schedule: false,
  mt_assign: false,
  mt_complete: false,
  mt_cancel: false,
  mt_manage_procedures: false,
  mt_export: false,
  mt_import: false,
};

type PermissionKey = keyof typeof permissionDefaults;
type PermissionsRow = { user_id: string } & Record<PermissionKey, boolean>;
type TabKey = 'overview' | 'permissions';

type PersonnelRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
  hire_date?: string | null;
  salary?: number | null;
  avatar_url?: string | null;
  address?: string | null;
  emergency_contact?: {
    name?: string | null;
    phone?: string | null;
    relationship?: string | null;
  } | null;
  skills?: string[] | null;
  certifications?: string[] | null;
  employment_type?: string | null;
  payment_model?: string | null;
  default_hourly_rate?: number | null;
  default_day_rate?: number | null;
  default_cachet_rate?: number | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  legal_identifier?: string | null;
  school_name?: string | null;
  payroll_notes?: string | null;
  created_at?: string | null;
  is_app_creator?: boolean | null;
  full_name?: string | null;
  must_change_password?: boolean | null;
  two_factor_email_enabled?: boolean | null;
  two_factor_totp_enabled?: boolean | null;
  job_title?: string | null;
  company?: string | null;
  location?: string | null;
  bio?: string | null;
};

type OverviewForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  company: string;
  location: string;
  address: string;
  bio: string;
  skills: string;
  certifications: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  role: string;
  status: string;
  hireDate: string;
  salary: string;
  employmentType: string;
  paymentModel: string;
  hourlyRate: string;
  dayRate: string;
  cachetRate: string;
  contractStartDate: string;
  contractEndDate: string;
  legalIdentifier: string;
  schoolName: string;
  payrollNotes: string;
};

type PermissionField = {
  key: PermissionKey;
  label: string;
};

type PermissionGroup = {
  label: string;
  fields: readonly PermissionField[];
};

type ModuleConfig = {
  key: string;
  label: string;
  icon: LucideIcon;
  accentClass: string;
  groups: readonly PermissionGroup[];
};

const inputClass = 'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const textareaClass = `${inputClass} min-h-[110px] resize-y`;
const tabs: readonly { id: TabKey; name: string; icon: LucideIcon }[] = [
  { id: 'overview', name: 'Apercu', icon: ClipboardList },
  { id: 'permissions', name: 'Permissions', icon: Shield },
];

const roleOptions = [
  { value: 'admin', label: 'Administrateur' },
  { value: 'manager', label: 'Manager' },
  { value: 'technician', label: 'Technicien' },
  { value: 'driver', label: 'Chauffeur' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'accountant', label: 'Comptable' },
] as const;

const statusOptions = [
  { value: 'active', label: 'Actif' },
  { value: 'inactive', label: 'Inactif' },
  { value: 'vacation', label: 'Conges' },
  { value: 'sick_leave', label: 'Arret maladie' },
] as const;

const employmentTypeOptions = [
  { value: 'employee', label: 'Salarie' },
  { value: 'intermittent', label: 'Intermittent' },
  { value: 'auto_entrepreneur', label: 'Auto-entrepreneur' },
  { value: 'intern', label: 'Stagiaire' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'subcontractor', label: 'Sous-traitant' },
] as const;

const paymentModelOptions = [
  { value: 'salary', label: 'Salaire' },
  { value: 'hourly', label: 'Horaire' },
  { value: 'daily', label: 'Forfait jour' },
  { value: 'cachet', label: 'Cachet' },
  { value: 'mixed', label: 'Mixte' },
] as const;

const moduleConfigs: readonly ModuleConfig[] = [
  {
    key: 'general',
    label: 'General',
    icon: Shield,
    accentClass: 'bg-slate-900 text-white',
    groups: [
      {
        label: 'Administration',
        fields: [
          { key: 'superadmin', label: 'Superadmin' },
          { key: 'can_manage_notifications', label: 'Gerer notifications' },
          { key: 'can_edit_settings', label: 'Modifier parametres globaux' },
        ],
      },
    ],
  },
  {
    key: 'rentals',
    label: 'Prestations',
    icon: ClipboardList,
    accentClass: 'bg-blue-600 text-white',
    groups: [
      {
        label: 'Visibilite',
        fields: [
          { key: 'can_create_service', label: 'Creation globale' },
          { key: 'rn_view_menu', label: 'Voir menu' },
          { key: 'rn_view_list', label: 'Voir liste' },
          { key: 'rn_view_detail', label: 'Voir detail' },
          { key: 'rn_view_calendar', label: 'Voir calendrier' },
          { key: 'rn_view_reports', label: 'Voir rapports' },
        ],
      },
      {
        label: 'Actions',
        fields: [
          { key: 'rn_create', label: 'Creer' },
          { key: 'rn_edit', label: 'Modifier' },
          { key: 'rn_delete', label: 'Supprimer' },
          { key: 'rn_change_status', label: 'Changer statut' },
          { key: 'rn_manage_items', label: 'Gerer items' },
          { key: 'rn_schedule', label: 'Planifier' },
          { key: 'rn_invoice', label: 'Facturer' },
          { key: 'rn_discount', label: 'Gerer remises' },
          { key: 'rn_generate_documents', label: 'Generer documents' },
          { key: 'rn_send_documents', label: 'Envoyer documents' },
          { key: 'rn_export', label: 'Exporter' },
          { key: 'rn_import', label: 'Importer' },
          { key: 'rn_view_costs', label: 'Voir couts' },
          { key: 'rn_view_margins', label: 'Voir marges' },
          { key: 'rn_accept_service', label: 'Accepter prestation' },
          { key: 'rn_refuse_service', label: 'Refuser prestation' },
        ],
      },
    ],
  },
  {
    key: 'equipment',
    label: 'Equipements',
    icon: Package,
    accentClass: 'bg-cyan-600 text-white',
    groups: [
      {
        label: 'Visibilite',
        fields: [
          { key: 'can_edit_equipment', label: 'Edition globale' },
          { key: 'eq_view_menu', label: 'Voir menu' },
          { key: 'eq_view_list', label: 'Voir liste' },
          { key: 'eq_view_detail', label: 'Voir detail' },
          { key: 'eq_view_history', label: 'Voir historique' },
          { key: 'eq_view_audit', label: 'Voir audit' },
          { key: 'eq_view_reports', label: 'Voir rapports' },
        ],
      },
      {
        label: 'Gestion',
        fields: [
          { key: 'eq_create', label: 'Creer' },
          { key: 'eq_edit', label: 'Modifier' },
          { key: 'eq_delete', label: 'Supprimer' },
          { key: 'eq_archive', label: 'Archiver / restaurer' },
          { key: 'eq_change_status', label: 'Changer statut' },
          { key: 'eq_manage_categories', label: 'Categories / types' },
          { key: 'eq_tag', label: 'Taguer' },
          { key: 'eq_manage_tags', label: 'Gerer tags' },
        ],
      },
      {
        label: 'Stock & documents',
        fields: [
          { key: 'eq_manage_stock', label: 'Gerer stock' },
          { key: 'eq_manage_serials', label: 'Numeros de serie' },
          { key: 'eq_assign_warehouse', label: 'Assigner entrepot' },
          { key: 'eq_transfer_stock', label: 'Transferer stock' },
          { key: 'eq_generate_barcodes', label: 'Generer codes-barres' },
          { key: 'eq_scan_barcodes', label: 'Scanner codes-barres' },
          { key: 'eq_print_labels', label: 'Imprimer etiquettes' },
          { key: 'eq_bulk_actions', label: 'Actions groupees' },
          { key: 'eq_upload_media', label: 'Uploader media' },
          { key: 'eq_view_documents', label: 'Voir documents' },
          { key: 'eq_manage_documents', label: 'Gerer documents' },
          { key: 'eq_export', label: 'Exporter' },
          { key: 'eq_import', label: 'Importer' },
          { key: 'eq_share', label: 'Partager' },
          { key: 'eq_publish_catalog', label: 'Publier catalogue' },
        ],
      },
      {
        label: 'Couts & maintenance',
        fields: [
          { key: 'eq_manage_pricing', label: 'Gerer tarification' },
          { key: 'eq_view_costs', label: 'Voir couts' },
          { key: 'eq_view_margins', label: 'Voir marges' },
          { key: 'eq_view_maintenance', label: 'Voir maintenance' },
          { key: 'eq_schedule_maintenance', label: 'Planifier maintenance' },
          { key: 'eq_calibrate', label: 'Calibrer' },
          { key: 'eq_deprecate', label: 'Deprecier' },
          { key: 'eq_restore_item', label: 'Restaurer' },
        ],
      },
    ],
  },
  {
    key: 'clients',
    label: 'Clients',
    icon: Users,
    accentClass: 'bg-emerald-600 text-white',
    groups: [
      {
        label: 'Acces',
        fields: [
          { key: 'can_manage_clients', label: 'Gestion globale' },
          { key: 'cl_view_menu', label: 'Voir menu' },
          { key: 'cl_view_list', label: 'Voir liste' },
          { key: 'cl_view_detail', label: 'Voir detail' },
          { key: 'cl_view_reports', label: 'Voir rapports' },
          { key: 'cl_create', label: 'Creer' },
          { key: 'cl_edit', label: 'Modifier' },
          { key: 'cl_delete', label: 'Supprimer' },
          { key: 'cl_manage_contacts', label: 'Gerer contacts' },
          { key: 'cl_view_invoices', label: 'Voir factures' },
          { key: 'cl_export', label: 'Exporter' },
          { key: 'cl_import', label: 'Importer' },
        ],
      },
    ],
  },
  {
    key: 'warehouses',
    label: 'Entrepots',
    icon: Warehouse,
    accentClass: 'bg-amber-500 text-slate-950',
    groups: [
      {
        label: 'Acces',
        fields: [
          { key: 'can_manage_warehouses', label: 'Gestion globale' },
          { key: 'wh_view_menu', label: 'Voir menu' },
          { key: 'wh_view_list', label: 'Voir liste' },
          { key: 'wh_view_detail', label: 'Voir detail' },
          { key: 'wh_view_reports', label: 'Voir rapports' },
          { key: 'wh_audit', label: 'Audit' },
          { key: 'wh_create', label: 'Creer' },
          { key: 'wh_edit', label: 'Modifier' },
          { key: 'wh_delete', label: 'Supprimer' },
          { key: 'wh_manage_stock', label: 'Gerer stock' },
          { key: 'wh_transfer', label: 'Transferer' },
          { key: 'wh_print_labels', label: 'Imprimer etiquettes' },
          { key: 'wh_export', label: 'Exporter' },
          { key: 'wh_import', label: 'Importer' },
        ],
      },
    ],
  },
  {
    key: 'personnel',
    label: 'Crew',
    icon: UserCircle2,
    accentClass: 'bg-fuchsia-600 text-white',
    groups: [
      {
        label: 'Acces',
        fields: [
          { key: 'can_manage_personnel', label: 'Gestion globale' },
          { key: 'pe_view_menu', label: 'Voir menu' },
          { key: 'pe_view_list', label: 'Voir liste' },
          { key: 'pe_view_detail', label: 'Voir detail' },
          { key: 'pe_view_reports', label: 'Voir rapports' },
          { key: 'pe_create_user', label: 'Creer utilisateur' },
          { key: 'pe_edit_user', label: 'Modifier utilisateur' },
          { key: 'pe_delete_user', label: 'Supprimer utilisateur' },
          { key: 'pe_manage_roles', label: 'Gerer roles' },
          { key: 'pe_manage_permissions', label: 'Gerer permissions' },
          { key: 'pe_view_activities', label: 'Voir activites' },
          { key: 'pe_schedule', label: 'Planifier' },
          { key: 'pe_export', label: 'Exporter' },
          { key: 'pe_import', label: 'Importer' },
        ],
      },
    ],
  },
  {
    key: 'accounting',
    label: 'Compta',
    icon: CreditCard,
    accentClass: 'bg-rose-600 text-white',
    groups: [
      {
        label: 'Acces',
        fields: [
          { key: 'can_view_accounting', label: 'Acces global' },
          { key: 'ac_view_menu', label: 'Voir menu' },
          { key: 'ac_view_dashboard', label: 'Voir tableau de bord' },
          { key: 'ac_view_invoices', label: 'Voir factures' },
          { key: 'ac_view_payments', label: 'Voir paiements' },
          { key: 'ac_view_reports', label: 'Voir rapports' },
          { key: 'ac_create_invoice', label: 'Creer facture' },
          { key: 'ac_edit_invoice', label: 'Modifier facture' },
          { key: 'ac_delete_invoice', label: 'Supprimer facture' },
          { key: 'ac_send_invoice', label: 'Envoyer facture' },
          { key: 'ac_mark_paid', label: 'Marquer payee' },
          { key: 'ac_refund', label: 'Rembourser' },
          { key: 'ac_manage_taxes', label: 'Gerer taxes' },
          { key: 'ac_manage_accounts', label: 'Gerer comptes' },
          { key: 'ac_export', label: 'Exporter' },
          { key: 'ac_import', label: 'Importer' },
        ],
      },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    icon: Wrench,
    accentClass: 'bg-orange-600 text-white',
    groups: [
      {
        label: 'Acces',
        fields: [
          { key: 'can_manage_maintenance', label: 'Gestion globale' },
          { key: 'mt_view_menu', label: 'Voir menu' },
          { key: 'mt_view_list', label: 'Voir liste' },
          { key: 'mt_view_detail', label: 'Voir detail' },
          { key: 'mt_view_calendar', label: 'Voir calendrier' },
          { key: 'mt_view_reports', label: 'Voir rapports' },
          { key: 'mt_create_task', label: 'Creer tache' },
          { key: 'mt_edit_task', label: 'Modifier tache' },
          { key: 'mt_delete_task', label: 'Supprimer tache' },
          { key: 'mt_schedule', label: 'Planifier' },
          { key: 'mt_assign', label: 'Assigner' },
          { key: 'mt_complete', label: 'Terminer' },
          { key: 'mt_cancel', label: 'Annuler' },
          { key: 'mt_manage_procedures', label: 'Gerer procedures' },
          { key: 'mt_export', label: 'Exporter' },
          { key: 'mt_import', label: 'Importer' },
        ],
      },
    ],
  },
];

const createEmptyPermissions = (userId: string): PermissionsRow => ({
  user_id: userId,
  ...permissionDefaults,
});

const normalizePermissions = (
  value: Partial<PermissionsRow> | null | undefined,
  userId: string,
  isAppCreator = false,
): PermissionsRow => ({
  ...createEmptyPermissions(userId),
  ...(value ?? {}),
  user_id: userId,
  superadmin: isAppCreator ? true : Boolean(value?.superadmin),
});

const toInputDate = (value?: string | null) => (value ? String(value).slice(0, 10) : '');
const parseList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const formatMoney = (value?: string | number | null) => {
  if (value == null || value === '') return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '—';
  return `${amount.toLocaleString('fr-FR')} €`;
};

const pickLabel = (value: string | null | undefined, items: readonly { value: string; label: string }[]) => {
  const item = items.find((entry) => entry.value === value);
  return item?.label ?? value ?? '—';
};

const buildOverviewForm = (row: PersonnelRow): OverviewForm => ({
  firstName: row.first_name ?? '',
  lastName: row.last_name ?? '',
  email: row.email ?? '',
  phone: row.phone ?? '',
  jobTitle: row.job_title ?? '',
  company: row.company ?? '',
  location: row.location ?? '',
  address: row.address ?? '',
  bio: row.bio ?? '',
  skills: (row.skills ?? []).join(', '),
  certifications: (row.certifications ?? []).join(', '),
  emergencyName: row.emergency_contact?.name ?? '',
  emergencyPhone: row.emergency_contact?.phone ?? '',
  emergencyRelationship: row.emergency_contact?.relationship ?? '',
  role: row.role ?? 'manager',
  status: row.status ?? 'active',
  hireDate: toInputDate(row.hire_date),
  salary: row.salary == null ? '' : String(row.salary),
  employmentType: row.employment_type ?? 'employee',
  paymentModel: row.payment_model ?? 'salary',
  hourlyRate: row.default_hourly_rate == null ? '' : String(row.default_hourly_rate),
  dayRate: row.default_day_rate == null ? '' : String(row.default_day_rate),
  cachetRate: row.default_cachet_rate == null ? '' : String(row.default_cachet_rate),
  contractStartDate: toInputDate(row.contract_start_date),
  contractEndDate: toInputDate(row.contract_end_date),
  legalIdentifier: row.legal_identifier ?? '',
  schoolName: row.school_name ?? '',
  payrollNotes: row.payroll_notes ?? '',
});

const SectionCard: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, action, children }) => (
  <section className="rounded-lg bg-white p-6 shadow">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const InfoLine: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-b-0">
    <span className="text-gray-500">{label}</span>
    <span className="text-right font-medium text-gray-900">{value ?? '—'}</span>
  </div>
);

const DetailField: React.FC<{ label: string; value?: React.ReactNode; className?: string }> = ({ label, value, className = '' }) => (
  <div className={className}>
    <div className="text-xs uppercase text-gray-500">{label}</div>
    <div className="mt-1 whitespace-pre-wrap text-sm font-medium text-gray-900">{value ?? '—'}</div>
  </div>
);

const BadgeList: React.FC<{ items: string[] }> = ({ items }) => (
  <div className="mt-2 flex flex-wrap gap-2">
    {items.length > 0 ? (
      items.map((item) => (
        <span key={item} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {item}
        </span>
      ))
    ) : (
      <span className="text-sm text-gray-500">—</span>
    )}
  </div>
);

const PermissionCheckbox: React.FC<{
  checked: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ checked, label, disabled = false, onToggle }) => (
  <label
    className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition ${
      disabled
        ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
        : checked
          ? 'cursor-pointer border-blue-200 bg-blue-50 text-blue-900'
          : 'cursor-pointer border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
    }`}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      disabled={disabled}
      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
    />
    <span className="leading-4">{label}</span>
  </label>
);

const PersonnelDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const canEditPermissions = !!me?.superadmin;

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const t = searchParams.get('tab');
    return t === 'permissions' ? 'permissions' : 'overview';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSavingOverlayVisible, setIsSavingOverlayVisible] = useState(false);
  const [savingOverview, setSavingOverview] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [row, setRow] = useState<PersonnelRow | null>(null);
  const [overviewForm, setOverviewForm] = useState<OverviewForm>(buildOverviewForm({ id: '' }));
  const [permissions, setPermissions] = useState<PermissionsRow | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<PermissionsRow | null>(null);
  const [selectedModule, setSelectedModule] = useState<string>('general');

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [personnelRes, userRes, profileRes, permissionsRes] = await Promise.all([
        supabase.from('personnel').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('app_users')
          .select('id, full_name, email, avatar_url, must_change_password, two_factor_email_enabled, two_factor_totp_enabled, is_app_creator')
          .eq('id', id)
          .maybeSingle(),
        supabase.from('app_user_profiles').select('phone, job_title, company, location, bio').eq('user_id', id).maybeSingle(),
        supabase.from('app_permissions').select('*').eq('user_id', id).maybeSingle(),
      ]);

      if (personnelRes.error) throw personnelRes.error;
      if (userRes.error) throw userRes.error;
      if (profileRes.error) throw profileRes.error;
      if (permissionsRes.error) throw permissionsRes.error;

      const merged: PersonnelRow | null = personnelRes.data
        ? {
            ...(personnelRes.data as PersonnelRow),
            ...(userRes.data as Partial<PersonnelRow> | null),
            ...(profileRes.data as Partial<PersonnelRow> | null),
          }
        : null;

      setRow(merged);
      if (merged) {
        setOverviewForm(buildOverviewForm(merged));
      }
      const nextPermissions = normalizePermissions(
        permissionsRes.data as Partial<PermissionsRow> | null,
        id,
        Boolean(merged?.is_app_creator),
      );
      setPermissions(nextPermissions);
      setPermissionDraft(nextPermissions);
    } catch (error) {
      console.error(error);
      toast.error('Impossible de charger la fiche crew');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const selectedModuleConfig = useMemo(
    () => moduleConfigs.find((module) => module.key === selectedModule) ?? moduleConfigs[0],
    [selectedModule],
  );
  const effectivePermissions = permissionDraft ?? permissions;
  const isCreatorSuperadminLocked = Boolean(row?.is_app_creator && effectivePermissions?.superadmin);

  const saveOverview = async () => {
    if (!id) return;
    if (!overviewForm.email.trim()) {
      toast.error('Un email de connexion est requis');
      return;
    }

    setSavingOverview(true);
    setIsSavingOverlayVisible(true);
    try {
      const fullName = `${overviewForm.firstName} ${overviewForm.lastName}`.trim();
      const emergencyContact = [
        overviewForm.emergencyName,
        overviewForm.emergencyPhone,
        overviewForm.emergencyRelationship,
      ].some(Boolean)
        ? {
            name: overviewForm.emergencyName || null,
            phone: overviewForm.emergencyPhone || null,
            relationship: overviewForm.emergencyRelationship || null,
          }
        : null;

      const [userUpdate, profileUpsert, hrUpsert] = await Promise.all([
        supabase
          .from('app_users')
          .update({
            full_name: fullName || null,
            email: overviewForm.email.trim(),
          })
          .eq('id', id),
        supabase.from('app_user_profiles').upsert(
          {
            user_id: id,
            phone: overviewForm.phone.trim() || null,
            job_title: overviewForm.jobTitle.trim() || null,
            company: overviewForm.company.trim() || null,
            location: overviewForm.location.trim() || null,
            bio: overviewForm.bio.trim() || null,
          },
          { onConflict: 'user_id' },
        ),
        supabase.from('app_user_hr').upsert(
          {
            user_id: id,
            address: overviewForm.address.trim() || null,
            emergency_contact: emergencyContact,
            skills: parseList(overviewForm.skills),
            certifications: parseList(overviewForm.certifications),
            role: overviewForm.role,
            status: overviewForm.status,
            hire_date: overviewForm.hireDate || null,
            salary: overviewForm.salary === '' ? 0 : Number(overviewForm.salary),
            employment_type: overviewForm.employmentType,
            payment_model: overviewForm.paymentModel,
            default_hourly_rate: overviewForm.hourlyRate === '' ? null : Number(overviewForm.hourlyRate),
            default_day_rate: overviewForm.dayRate === '' ? null : Number(overviewForm.dayRate),
            default_cachet_rate: overviewForm.cachetRate === '' ? null : Number(overviewForm.cachetRate),
            contract_start_date: overviewForm.contractStartDate || null,
            contract_end_date: overviewForm.contractEndDate || null,
            legal_identifier: overviewForm.legalIdentifier.trim() || null,
            school_name: overviewForm.schoolName.trim() || null,
            payroll_notes: overviewForm.payrollNotes.trim() || null,
          },
          { onConflict: 'user_id' },
        ),
      ]);

      if (userUpdate.error) throw userUpdate.error;
      if (profileUpsert.error) throw profileUpsert.error;
      if (hrUpsert.error) throw hrUpsert.error;

      toast.success('Fiche crew enregistree');
      await load();
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      toast.error('Impossible d enregistrer la fiche crew');
    } finally {
      setSavingOverview(false);
      setIsSavingOverlayVisible(false);
    }
  };

  const savePermissions = async () => {
    if (!id || !permissionDraft || !canEditPermissions) return;

    const payload = normalizePermissions(permissionDraft, id, Boolean(row?.is_app_creator));

    setSavingPermissions(true);
    setIsSavingOverlayVisible(true);
    try {
      const { error } = await supabase.from('app_permissions').upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;

      setPermissions(payload);
      setPermissionDraft(payload);
      setIsEditing(false);
      toast.success('Permissions enregistrees');
    } catch (error) {
      console.error(error);
      setPermissionDraft(permissions);
      toast.error('Impossible d enregistrer les permissions');
    } finally {
      setSavingPermissions(false);
      setIsSavingOverlayVisible(false);
    }
  };

  const togglePermission = (key: PermissionKey) => {
    if (!permissionDraft || !canEditPermissions || !isEditing) return;
    if (permissionDraft.superadmin && key !== 'superadmin') return;
    if (key === 'superadmin' && row?.is_app_creator) return;

    setPermissionDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        [key]: !current[key],
      };
    });
  };

  const primaryButtonLabel = isEditing ? 'Enregistrer' : 'Modifier';
  const PrimaryButtonIcon = isEditing ? Save : Edit;

  const handlePrimaryAction = () => {
    if (isSavingOverlayVisible) return;
    if (activeTab === 'permissions') {
      if (!canEditPermissions) return;
      if (!isEditing) {
        setPermissionDraft(permissions ? { ...permissions } : createEmptyPermissions(id ?? ''));
        setIsEditing(true);
        return;
      }
      void savePermissions();
      return;
    }
    if (!isEditing) {
      setIsEditing(true);
      return;
    }
    void saveOverview();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">Cette fiche crew n existe pas.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/personnel"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Retour au crew"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <img
            src={row.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100'}
            alt="avatar"
            className="h-12 w-12 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">
                {`${overviewForm.firstName || row.first_name || ''} ${overviewForm.lastName || row.last_name || ''}`.trim() || 'Fiche crew'}
              </h1>
              <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                {pickLabel(overviewForm.role, roleOptions)}
              </span>
              <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                {pickLabel(overviewForm.status, statusOptions)}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {overviewForm.jobTitle || row.email || 'Profil crew'}
            </p>
          </div>
        </div>

        {activeTab === 'overview' || (activeTab === 'permissions' && canEditPermissions) ? (
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isSavingOverlayVisible}
            className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-colors ${
              isSavingOverlayVisible
                ? 'bg-blue-400 cursor-not-allowed'
                : isEditing
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <PrimaryButtonIcon className="h-4 w-4 mr-2" />
            {isSavingOverlayVisible ? 'Enregistrement...' : primaryButtonLabel}
          </button>
        ) : null}
      </div>

      <div className="border-b border-gray-200 px-4 sm:px-6">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium flex items-center space-x-2 ${
                  isActive ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="rounded-lg">
        {activeTab === 'overview' && (
          <div className="bg-gray-100 p-6 space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <SectionCard title="Details du profil" description="Identite, contact et informations utiles au quotidien.">
                  {isEditing ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Prenom
                        <input
                          className={inputClass}
                          value={overviewForm.firstName}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, firstName: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Nom
                        <input
                          className={inputClass}
                          value={overviewForm.lastName}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, lastName: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                        Email de connexion
                        <input
                          type="email"
                          className={inputClass}
                          value={overviewForm.email}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, email: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Telephone
                        <input
                          className={inputClass}
                          value={overviewForm.phone}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, phone: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Poste / fonction
                        <input
                          className={inputClass}
                          value={overviewForm.jobTitle}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, jobTitle: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Structure
                        <input
                          className={inputClass}
                          value={overviewForm.company}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, company: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Ville / base
                        <input
                          className={inputClass}
                          value={overviewForm.location}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, location: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                        Adresse complete
                        <input
                          className={inputClass}
                          value={overviewForm.address}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, address: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Contact urgence
                        <input
                          className={inputClass}
                          value={overviewForm.emergencyName}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, emergencyName: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Telephone urgence
                        <input
                          className={inputClass}
                          value={overviewForm.emergencyPhone}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, emergencyPhone: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                        Lien avec le contact d urgence
                        <input
                          className={inputClass}
                          value={overviewForm.emergencyRelationship}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, emergencyRelationship: e.target.value }))}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailField label="Prenom" value={overviewForm.firstName || '—'} />
                      <DetailField label="Nom" value={overviewForm.lastName || '—'} />
                      <DetailField label="Email de connexion" value={overviewForm.email || '—'} className="md:col-span-2" />
                      <DetailField label="Telephone" value={overviewForm.phone || '—'} />
                      <DetailField label="Poste / fonction" value={overviewForm.jobTitle || '—'} />
                      <DetailField label="Structure" value={overviewForm.company || '—'} />
                      <DetailField label="Ville / base" value={overviewForm.location || '—'} />
                      <DetailField label="Adresse complete" value={overviewForm.address || '—'} className="md:col-span-2" />
                      <DetailField label="Contact urgence" value={overviewForm.emergencyName || '—'} />
                      <DetailField label="Telephone urgence" value={overviewForm.emergencyPhone || '—'} />
                      <DetailField label="Lien avec le contact d urgence" value={overviewForm.emergencyRelationship || '—'} className="md:col-span-2" />
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Competences & presentation" description="Tout le profil metier est regroupe ici.">
                  {isEditing ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Competences
                        <input
                          className={inputClass}
                          value={overviewForm.skills}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, skills: e.target.value }))}
                          placeholder="son, video, plateau, regie"
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Certifications
                        <input
                          className={inputClass}
                          value={overviewForm.certifications}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, certifications: e.target.value }))}
                          placeholder="CACES, habilitation electrique"
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                        Notes de presentation
                        <textarea
                          className={textareaClass}
                          value={overviewForm.bio}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, bio: e.target.value }))}
                          placeholder="Resume, points forts, habitudes de mission..."
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <div className="text-xs uppercase text-gray-500">Competences</div>
                        <BadgeList items={parseList(overviewForm.skills)} />
                      </div>
                      <div>
                        <div className="text-xs uppercase text-gray-500">Certifications</div>
                        <BadgeList items={parseList(overviewForm.certifications)} />
                      </div>
                      <DetailField label="Notes de presentation" value={overviewForm.bio || '—'} />
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="RH & paie" description="Toutes les informations administratives sont dans le meme onglet.">
                  {isEditing ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="block text-sm font-medium text-gray-700">
                        Role interne
                        <select
                          className={inputClass}
                          value={overviewForm.role}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, role: e.target.value }))}
                        >
                          {roleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Statut
                        <select
                          className={inputClass}
                          value={overviewForm.status}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, status: e.target.value }))}
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Date d embauche
                        <input
                          type="date"
                          className={inputClass}
                          value={overviewForm.hireDate}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, hireDate: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Type d emploi
                        <select
                          className={inputClass}
                          value={overviewForm.employmentType}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, employmentType: e.target.value }))}
                        >
                          {employmentTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-gray-700 md:col-span-2 xl:col-span-4">
                        Mode de remuneration
                        <select
                          className={inputClass}
                          value={overviewForm.paymentModel}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, paymentModel: e.target.value }))}
                        >
                          {paymentModelOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Salaire (€)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={overviewForm.salary}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, salary: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Taux horaire (€)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={overviewForm.hourlyRate}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, hourlyRate: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Forfait jour (€)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={overviewForm.dayRate}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, dayRate: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Cachet (€)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={overviewForm.cachetRate}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, cachetRate: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Debut contrat
                        <input
                          type="date"
                          className={inputClass}
                          value={overviewForm.contractStartDate}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, contractStartDate: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Fin contrat
                        <input
                          type="date"
                          className={inputClass}
                          value={overviewForm.contractEndDate}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, contractEndDate: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                        Identifiant legal
                        <input
                          className={inputClass}
                          value={overviewForm.legalIdentifier}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, legalIdentifier: e.target.value }))}
                          placeholder="SIRET, reference RH, dossier..."
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                        Ecole / organisme
                        <input
                          className={inputClass}
                          value={overviewForm.schoolName}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, schoolName: e.target.value }))}
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700 md:col-span-2 xl:col-span-4">
                        Notes RH / paie
                        <textarea
                          className={textareaClass}
                          value={overviewForm.payrollNotes}
                          onChange={(e) => setOverviewForm((current) => ({ ...current, payrollNotes: e.target.value }))}
                          placeholder="Frais, points d attention, notes de contrat..."
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <DetailField label="Role interne" value={pickLabel(overviewForm.role, roleOptions)} />
                      <DetailField label="Statut" value={pickLabel(overviewForm.status, statusOptions)} />
                      <DetailField label="Date d embauche" value={overviewForm.hireDate || '—'} />
                      <DetailField label="Type d emploi" value={pickLabel(overviewForm.employmentType, employmentTypeOptions)} />
                      <DetailField label="Mode de remuneration" value={pickLabel(overviewForm.paymentModel, paymentModelOptions)} className="md:col-span-2 xl:col-span-4" />
                      <DetailField label="Salaire (€)" value={formatMoney(overviewForm.salary)} />
                      <DetailField label="Taux horaire (€)" value={formatMoney(overviewForm.hourlyRate)} />
                      <DetailField label="Forfait jour (€)" value={formatMoney(overviewForm.dayRate)} />
                      <DetailField label="Cachet (€)" value={formatMoney(overviewForm.cachetRate)} />
                      <DetailField label="Debut contrat" value={overviewForm.contractStartDate || '—'} />
                      <DetailField label="Fin contrat" value={overviewForm.contractEndDate || '—'} />
                      <DetailField label="Identifiant legal" value={overviewForm.legalIdentifier || '—'} className="md:col-span-2" />
                      <DetailField label="Ecole / organisme" value={overviewForm.schoolName || '—'} className="md:col-span-2" />
                      <DetailField label="Notes RH / paie" value={overviewForm.payrollNotes || '—'} className="md:col-span-2 xl:col-span-4" />
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="space-y-6">
                <SectionCard title="Infos" description="Lecture rapide de la fiche.">
                  <div className="space-y-1">
                    <InfoLine label="Nom complet" value={`${overviewForm.firstName} ${overviewForm.lastName}`.trim() || '—'} />
                    <InfoLine label="Email" value={overviewForm.email || '—'} />
                    <InfoLine label="Telephone" value={overviewForm.phone || '—'} />
                    <InfoLine label="Poste" value={overviewForm.jobTitle || '—'} />
                    <InfoLine label="Structure" value={overviewForm.company || '—'} />
                    <InfoLine label="Base" value={overviewForm.location || '—'} />
                    <InfoLine label="Adresse" value={overviewForm.address || '—'} />
                  </div>
                </SectionCard>

                <SectionCard title="RH & paie" description="Resume administratif et financier.">
                  <div className="space-y-1">
                    <InfoLine label="Role interne" value={pickLabel(overviewForm.role, roleOptions)} />
                    <InfoLine label="Statut" value={pickLabel(overviewForm.status, statusOptions)} />
                    <InfoLine label="Type d emploi" value={pickLabel(overviewForm.employmentType, employmentTypeOptions)} />
                    <InfoLine label="Mode de remuneration" value={pickLabel(overviewForm.paymentModel, paymentModelOptions)} />
                    <InfoLine label="Salaire" value={formatMoney(overviewForm.salary)} />
                    <InfoLine label="Taux horaire" value={formatMoney(overviewForm.hourlyRate)} />
                    <InfoLine label="Forfait jour" value={formatMoney(overviewForm.dayRate)} />
                    <InfoLine label="Cachet" value={formatMoney(overviewForm.cachetRate)} />
                    <InfoLine label="Debut contrat" value={overviewForm.contractStartDate || '—'} />
                    <InfoLine label="Fin contrat" value={overviewForm.contractEndDate || '—'} />
                  </div>
                </SectionCard>

                <SectionCard title="Competences & urgence" description="Lecture terrain et disponibilite immediate.">
                  <div className="space-y-1">
                    <InfoLine label="Competences" value={overviewForm.skills || '—'} />
                    <InfoLine label="Certifications" value={overviewForm.certifications || '—'} />
                    <InfoLine label="Contact urgence" value={overviewForm.emergencyName || '—'} />
                    <InfoLine label="Telephone urgence" value={overviewForm.emergencyPhone || '—'} />
                    <InfoLine label="Lien" value={overviewForm.emergencyRelationship || '—'} />
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'permissions' && permissions && (
          <div className="p-6">
            <div className="w-full rounded-lg bg-white shadow">
              <div className="flex min-h-[420px] items-stretch px-8 py-6">
                <div className="min-h-[372px] min-w-0 flex-1">
                  <div className="space-y-2 pr-4">
                    {moduleConfigs.map((module) => {
                      const Icon = module.icon;
                      const isActive = selectedModule === module.key;

                      return (
                        <button
                          key={module.key}
                          type="button"
                          onClick={() => setSelectedModule(module.key)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                            isActive
                              ? 'border-blue-500 bg-blue-50 text-blue-900'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${module.accentClass}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium">{module.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mx-6 flex shrink-0 items-center justify-center py-2">
                  <div className="h-full min-h-[372px] w-px rounded-full bg-gray-200" />
                </div>
                <div className="min-h-[372px] min-w-0 flex-1 pl-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedModuleConfig.label} · Permissions
                  </h2>
                  {row.is_app_creator && (
                    <p className="mt-2 text-sm text-gray-500">
                      Compte createur: le mode superadmin reste verrouille.
                    </p>
                  )}
                  <div className="mt-6 space-y-4">
                    {selectedModuleConfig.groups.map((group) => (
                      <div key={group.label} className="space-y-2">
                        <h3 className="text-sm font-semibold text-gray-700">{group.label}</h3>
                        <div className="flex flex-wrap gap-2">
                          {group.fields.map((field) => (
                            <PermissionCheckbox
                              key={field.key}
                              label={field.label}
                              checked={Boolean(effectivePermissions?.superadmin || effectivePermissions?.[field.key])}
                              disabled={
                                !isEditing
                                || savingPermissions
                                || !canEditPermissions
                                || Boolean(effectivePermissions?.superadmin && field.key !== 'superadmin')
                                || (field.key === 'superadmin' && isCreatorSuperadminLocked)
                              }
                              onToggle={() => togglePermission(field.key)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isSavingOverlayVisible && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
          <div className="flex flex-col items-center space-y-3 rounded-lg bg-white/90 px-6 py-5 shadow-xl">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
            <p className="text-sm font-medium text-gray-700">
              {activeTab === 'permissions' ? 'Enregistrement des permissions...' : 'Enregistrement de la fiche...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonnelDetail;
