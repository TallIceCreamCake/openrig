import {
  BookUser,
  Building2,
  Calendar,
  ClipboardList,
  Construction,
  Briefcase,
  Forklift,
  LayoutDashboard,
  MessageCircle,
  Menu,
  Projector,
  ReceiptText,
  Settings,
  Users,
  Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItemKey =
  | 'dashboard'
  | 'calendar'
  | 'equipment'
  | 'services'
  | 'rentals'
  | 'clients'
  | 'warehouses'
  | 'personnel'
  | 'chat'
  | 'accounting'
  | 'vehicles'
  | 'maintenance'
  | 'settings'
  | 'company';

export interface NavigationItemDefinition {
  key: NavItemKey;
  name: string;
  href: string;
  icon: LucideIcon;
  perm?: string;
  description?: string;
  featureKey?: string;
  featureFallback?: boolean;
}

export type MenuLayoutNode =
  | { id: string; type: 'item'; key: NavItemKey }
  | { id: string; type: 'group'; label: string; children: MenuLayoutNode[] };

export const cloneMenuNode = (node: MenuLayoutNode): MenuLayoutNode => {
  if (node.type === 'group') {
    return {
      id: node.id,
      type: 'group',
      label: node.label,
      children: node.children.map(cloneMenuNode),
    };
  }
  return { id: node.id, type: 'item', key: node.key };
};

export const cloneMenuLayout = (layout: MenuLayoutNode[]): MenuLayoutNode[] => layout.map(cloneMenuNode);

export const NAV_ITEM_DEFINITIONS: Record<NavItemKey, NavigationItemDefinition> = {
  dashboard: { key: 'dashboard', name: 'Tableau de bord', href: '/', icon: LayoutDashboard },
  calendar: { key: 'calendar', name: 'Calendrier', href: '/calendar', icon: Calendar },
  equipment: { key: 'equipment', name: 'Matériel', href: '/equipment', icon: Projector, perm: 'eq_view_menu' },
  services: { key: 'services', name: 'Services', href: '/services', icon: Briefcase },
  rentals: { key: 'rentals', name: 'Projets', href: '/rentals', icon: ClipboardList, perm: 'rn_view_menu' },
  clients: { key: 'clients', name: 'Clients', href: '/clients', icon: Users, perm: 'cl_view_menu' },
  warehouses: { key: 'warehouses', name: 'Entrepôts', href: '/warehouses', icon: Warehouse, perm: 'wh_view_menu' },
  personnel: { key: 'personnel', name: 'Crew', href: '/personnel', icon: BookUser, perm: 'pe_view_menu' },
  chat: {
    key: 'chat',
    name: 'Chat du personnel',
    href: '/chat',
    icon: MessageCircle,
    perm: 'pe_view_menu',
    featureKey: 'personnel_chat',
    featureFallback: false,
  },
  accounting: { key: 'accounting', name: 'Comptabilité', href: '/accounting', icon: ReceiptText, perm: 'ac_view_menu' },
  vehicles: { key: 'vehicles', name: 'Véhicules', href: '/vehicles', icon: Forklift },
  maintenance: { key: 'maintenance', name: 'Maintenance', href: '/maintenance', icon: Construction },
  settings: { key: 'settings', name: 'Paramètres', href: '/settings', icon: Settings },
  company: { key: 'company', name: 'Gestion entreprise', href: '/company', icon: Building2 },
};

export const DEFAULT_MENU_LAYOUT: MenuLayoutNode[] = [
  { id: 'dashboard', type: 'item', key: 'dashboard' },
  { id: 'calendar', type: 'item', key: 'calendar' },
  { id: 'equipment', type: 'item', key: 'equipment' },
  { id: 'services', type: 'item', key: 'services' },
  { id: 'rentals', type: 'item', key: 'rentals' },
  { id: 'clients', type: 'item', key: 'clients' },
  { id: 'warehouses', type: 'item', key: 'warehouses' },
  { id: 'personnel', type: 'item', key: 'personnel' },
  { id: 'chat', type: 'item', key: 'chat' },
  { id: 'accounting', type: 'item', key: 'accounting' },
  { id: 'vehicles', type: 'item', key: 'vehicles' },
  { id: 'maintenance', type: 'item', key: 'maintenance' },
];

export const MENU_ICON_PLACEHOLDER = Menu;

export const normalizeMenuLayout = (layout: MenuLayoutNode[] | undefined | null): MenuLayoutNode[] => {
  if (!Array.isArray(layout) || layout.length === 0) {
    return cloneMenuLayout(DEFAULT_MENU_LAYOUT);
  }

  const seen = new Set<NavItemKey>();

  const normalizeNode = (node: MenuLayoutNode): MenuLayoutNode | null => {
    if (node.type === 'item') {
      if (!NAV_ITEM_DEFINITIONS[node.key]) return null;
      if (seen.has(node.key)) return null;
      seen.add(node.key);
      return { id: node.id || node.key, type: 'item', key: node.key };
    }
    const children: MenuLayoutNode[] = [];
    (node.children || []).forEach((child) => {
      const normalized = normalizeNode(child);
      if (normalized) children.push(normalized);
    });
    if (children.length === 0) return null;
    return {
      id: node.id || `group-${Math.random().toString(36).slice(2, 8)}`,
      type: 'group',
      label: node.label || 'Groupe',
      children,
    };
  };

  const result: MenuLayoutNode[] = [];
  layout.forEach((node) => {
    const normalized = normalizeNode(node);
    if (normalized) result.push(normalized);
  });

  // Append missing items in their default order to guarantee access
  DEFAULT_MENU_LAYOUT.forEach((defaultNode) => {
    if (defaultNode.type === 'item') {
      if (!seen.has(defaultNode.key)) {
        result.push(cloneMenuNode({ ...defaultNode, id: defaultNode.key }));
        seen.add(defaultNode.key);
      }
    } else if (defaultNode.type === 'group') {
      const remainingChildren = defaultNode.children.filter(child => !seen.has(child.key));
      remainingChildren.forEach(child => {
        seen.add(child.key);
        result.push(cloneMenuNode({ ...child, id: child.key }));
      });
    }
  });

  return result;
};

export const flattenMenuLayout = (layout: MenuLayoutNode[]): NavItemKey[] => {
  const keys: NavItemKey[] = [];
  const walk = (nodes: MenuLayoutNode[]) => {
    nodes.forEach(node => {
      if (node.type === 'item') {
        keys.push(node.key);
      } else {
        walk(node.children);
      }
    });
  };
  walk(layout);
  return keys;
};
