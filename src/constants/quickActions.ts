import {
  ClipboardList,
  FilePlus,
  Inbox,
  Package,
  PackagePlus,
  Boxes,
  Truck,
  Wrench,
  AlertTriangle,
  Users,
  UserPlus,
  Building2,
  Warehouse,
  Layers,
  FileText,
  Calendar,
  MessageSquare,
  Settings,
  LayoutTemplate,
  type LucideIcon,
} from 'lucide-react';

export interface QuickActionDef {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile (text + background). */
  tone: string;
}

export interface QuickActionGroup {
  id: string;
  label: string;
  actions: QuickActionDef[];
}

// Single source of truth for the Quick Actions widget. The widget renders
// selected actions as buttons; the widget settings render every action grouped
// by category in an accordion. Each "create" action carries a `?new=…` query
// param that the destination page reads to auto-open its create form.
export const QUICK_ACTION_GROUPS: QuickActionGroup[] = [
  {
    id: 'projects',
    label: 'Projets',
    actions: [
      { id: 'rentals-list', label: 'Voir les projets', to: '/rentals', icon: ClipboardList, tone: 'text-indigo-600 bg-indigo-50' },
      { id: 'rentals-create', label: 'Créer un projet', to: '/rentals?new=1', icon: FilePlus, tone: 'text-indigo-600 bg-indigo-50' },
      { id: 'portal-requests', label: 'Demandes portail', to: '/portal-requests', icon: Inbox, tone: 'text-violet-600 bg-violet-50' },
    ],
  },
  {
    id: 'equipment',
    label: 'Matériel',
    actions: [
      { id: 'equipment-list', label: 'Voir le matériel', to: '/equipment', icon: Package, tone: 'text-lime-600 bg-lime-50' },
      { id: 'equipment-create', label: 'Ajouter du matériel', to: '/equipment?new=equipment', icon: PackagePlus, tone: 'text-lime-600 bg-lime-50' },
      { id: 'pack-create', label: 'Créer un pack', to: '/equipment?new=pack', icon: Boxes, tone: 'text-lime-600 bg-lime-50' },
      { id: 'maintenance-list', label: 'Maintenance', to: '/maintenance', icon: Wrench, tone: 'text-orange-600 bg-orange-50' },
      { id: 'incidents-list', label: 'Sinistres', to: '/maintenance?tab=incidents', icon: AlertTriangle, tone: 'text-red-600 bg-red-50' },
    ],
  },
  {
    id: 'vehicles',
    label: 'Véhicules',
    actions: [
      { id: 'vehicles-list', label: 'Voir les véhicules', to: '/vehicles', icon: Truck, tone: 'text-amber-600 bg-amber-50' },
    ],
  },
  {
    id: 'clients',
    label: 'Clients',
    actions: [
      { id: 'clients-list', label: 'Voir les clients', to: '/clients', icon: Users, tone: 'text-sky-600 bg-sky-50' },
      { id: 'client-create', label: 'Ajouter un client', to: '/clients?new=client', icon: UserPlus, tone: 'text-sky-600 bg-sky-50' },
      { id: 'company-create', label: 'Ajouter une entreprise', to: '/clients?new=company', icon: Building2, tone: 'text-sky-600 bg-sky-50' },
    ],
  },
  {
    id: 'services',
    label: 'Prestations',
    actions: [
      { id: 'services-list', label: 'Voir les prestations', to: '/services', icon: Layers, tone: 'text-teal-600 bg-teal-50' },
      { id: 'service-create', label: 'Créer une prestation', to: '/services?new=other', icon: FilePlus, tone: 'text-teal-600 bg-teal-50' },
    ],
  },
  {
    id: 'warehouses',
    label: 'Entrepôts',
    actions: [
      { id: 'warehouses-list', label: 'Voir les entrepôts', to: '/warehouses', icon: Warehouse, tone: 'text-cyan-600 bg-cyan-50' },
      { id: 'warehouse-create', label: 'Ajouter un entrepôt', to: '/warehouses?new=1', icon: PackagePlus, tone: 'text-cyan-600 bg-cyan-50' },
    ],
  },
  {
    id: 'personnel',
    label: 'Personnel',
    actions: [
      { id: 'personnel-list', label: 'Voir le personnel', to: '/personnel', icon: Users, tone: 'text-purple-600 bg-purple-50' },
      { id: 'crew-create', label: 'Nouveau crew', to: '/personnel?new=crew', icon: UserPlus, tone: 'text-purple-600 bg-purple-50' },
      { id: 'chat', label: 'Messagerie', to: '/chat', icon: MessageSquare, tone: 'text-blue-600 bg-blue-50' },
    ],
  },
  {
    id: 'accounting',
    label: 'Comptabilité',
    actions: [
      { id: 'billing-list', label: 'Documents', to: '/accounting/documents', icon: FileText, tone: 'text-emerald-600 bg-emerald-50' },
      { id: 'billing-create', label: 'Nouveau document', to: '/accounting/documents/new', icon: FilePlus, tone: 'text-emerald-600 bg-emerald-50' },
    ],
  },
  {
    id: 'planning',
    label: 'Agenda',
    actions: [
      { id: 'calendar', label: 'Calendrier', to: '/calendar', icon: Calendar, tone: 'text-blue-600 bg-blue-50' },
    ],
  },
  {
    id: 'settings',
    label: 'Réglages',
    actions: [
      { id: 'settings', label: 'Paramètres', to: '/settings', icon: Settings, tone: 'text-gray-600 bg-gray-100' },
      { id: 'company', label: 'Entreprise', to: '/company', icon: Building2, tone: 'text-gray-600 bg-gray-100' },
      { id: 'template-studio', label: 'Template Studio', to: '/company/template-studio', icon: LayoutTemplate, tone: 'text-gray-600 bg-gray-100' },
    ],
  },
];

export const QUICK_ACTIONS_BY_ID: Record<string, QuickActionDef> = QUICK_ACTION_GROUPS.reduce(
  (acc, group) => {
    group.actions.forEach((action) => {
      acc[action.id] = action;
    });
    return acc;
  },
  {} as Record<string, QuickActionDef>,
);

export const DEFAULT_QUICK_ACTION_IDS: string[] = [
  'rentals-list',
  'rentals-create',
  'equipment-list',
  'clients-list',
  'calendar',
  'billing-create',
];
