import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X, ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { hasPerm } from '../utils/perm';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_MENU_LAYOUT,
  MenuLayoutNode,
  NAV_ITEM_DEFINITIONS,
  NavigationItemDefinition,
  cloneMenuLayout,
  normalizeMenuLayout,
} from '../constants/navigation';

type RenderNode =
  | { id: string; type: 'item'; def: NavigationItemDefinition }
  | { id: string; type: 'group'; label: string; children: RenderNode[] };

const Sidebar = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<MenuLayoutNode[]>(() => cloneMenuLayout(DEFAULT_MENU_LAYOUT));
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const { user } = useAuth();

  // Labels are always visible inside the mobile drawer, regardless of the
  // desktop collapsed state.
  const showLabels = isExpanded || isMobileOpen;

  useEffect(() => {
    const fetchMenuLayout = async () => {
      if (!user?.id) {
        setMenuLayout(cloneMenuLayout(DEFAULT_MENU_LAYOUT));
        return;
      }
      try {
        const { data, error } = await supabase
          .from('app_user_preferences')
          .select('preferences')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        const storedLayout = normalizeMenuLayout(data?.preferences?.menuLayout);
        setMenuLayout(storedLayout);
        const initialExpanded: Record<string, boolean> = {};
        storedLayout.forEach(node => {
          if (node.type === 'group') initialExpanded[node.id] = true;
        });
        setExpandedGroups(initialExpanded);
      } catch (err) {
        console.error('load menu layout', err);
        setMenuLayout(cloneMenuLayout(DEFAULT_MENU_LAYOUT));
      }
    };
    fetchMenuLayout();
  }, [user?.id]);

  useEffect(() => {
    const handler = () => {
      if (user?.id) {
        supabase
          .from('app_user_preferences')
          .select('preferences')
          .eq('user_id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            const storedLayout = normalizeMenuLayout(data?.preferences?.menuLayout);
            setMenuLayout(storedLayout);
          })
          .catch((err) => console.error('reload menu layout', err));
      }
    };
    window.addEventListener('user-menu-updated', handler);
    return () => window.removeEventListener('user-menu-updated', handler);
  }, [user?.id]);

  const navigation = useMemo<RenderNode[]>(() => {
    const buildNodes = (nodes: MenuLayoutNode[]): RenderNode[] => {
      const result: RenderNode[] = [];
      nodes.forEach(node => {
        if (node.type === 'item') {
          const def = NAV_ITEM_DEFINITIONS[node.key];
          if (!def) return;
          if (def.perm && !hasPerm(user, def.perm)) return;
          result.push({ id: node.id, type: 'item', def });
        } else {
          const children = buildNodes(node.children);
          if (children.length === 0) return;
          result.push({ id: node.id, type: 'group', label: node.label, children });
        }
      });
      return result;
    };
    return buildNodes(menuLayout);
  }, [menuLayout, user]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    navigation.forEach(node => {
      if (node.type === 'group') {
        next[node.id] = expandedGroups[node.id] ?? true;
      }
    });
    setExpandedGroups(prev => ({ ...next, ...prev }));
  }, [navigation.map(node => node.id).join('|')]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderNavLink = (def: NavigationItemDefinition) => (
    <NavLink
      key={def.key}
      to={def.href}
      onClick={() => setIsMobileOpen(false)}
      title={!showLabels ? def.name : undefined}
      className={({ isActive }) =>
        `sidebar-link group relative flex items-center rounded-xl text-sm font-medium ${
          isActive ? 'sidebar-link-active' : ''
        } ${showLabels ? 'px-3 py-2.5' : 'sidebar-link-rail mx-auto h-11 w-11 justify-center'}`
      }
    >
      <def.icon className="h-5 w-5 flex-shrink-0" />
      <span
        className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
          showLabels ? 'ml-3 max-w-[160px] opacity-100' : 'ml-0 max-w-0 opacity-0'
        }`}
      >
        {def.name}
      </span>
    </NavLink>
  );

  const renderNavigation = () => navigation.map(node => {
    if (node.type === 'item') {
      return renderNavLink(node.def);
    }
    const isOpen = expandedGroups[node.id] ?? true;

    // Collapsed rail: a group becomes a subtle divider followed by its items —
    // an accordion without a visible label would not be usable.
    if (!showLabels) {
      return (
        <div key={node.id} className="space-y-1.5">
          <div className="sidebar-collapsed-divider" aria-hidden="true" />
          {node.children.map(child => (child.type === 'item' ? renderNavLink(child.def) : null))}
        </div>
      );
    }

    return (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => toggleGroup(node.id)}
          aria-expanded={isOpen}
          className="sidebar-group-label w-full flex items-center justify-between gap-2 px-3 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors"
        >
          <span className="truncate">{node.label}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden space-y-1">
            {node.children.map(child => (child.type === 'item' ? renderNavLink(child.def) : null))}
          </div>
        </div>
      </div>
    );
  });

  return (
    <>
      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 rounded-xl bg-white border border-gray-200 text-gray-700 shadow-sm hover:bg-gray-50 transition-colors dark:bg-gray-800 dark:text-white dark:border-gray-700 dark:hover:bg-gray-700"
          aria-label={isMobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Floating sidebar card */}
      <aside
        className={`
          sidebar-shell fixed md:relative inset-y-0 left-0 z-40
          flex flex-col transition-all duration-300 ease-in-out
          md:my-3 md:ml-3 rounded-r-2xl md:rounded-2xl
          border-r md:border
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          w-72 ${isExpanded ? 'md:w-64' : 'md:w-[4.75rem]'}
        `}
      >
        {/* Header */}
        <div className={`flex items-center flex-shrink-0 pt-5 pb-4 ${showLabels ? 'gap-3 px-4' : 'justify-center gap-0 px-0'}`}>
          <div className="sidebar-logo-badge h-10 w-10 flex-shrink-0 rounded-xl grid place-items-center">
            <span className="text-white font-extrabold text-sm leading-none tracking-tight">OR</span>
          </div>
          <div
            className={`flex flex-col overflow-hidden whitespace-nowrap transition-all duration-300 ${
              showLabels ? 'max-w-[160px] opacity-100' : 'max-w-0 opacity-0'
            }`}
          >
            <span className="text-base font-bold tracking-tight leading-tight" style={{ color: 'var(--sidebar-text)' }}>
              Open RIG
            </span>
            <span className="text-[11px] font-medium sidebar-subtle leading-tight">Gestion de parc</span>
          </div>
        </div>

        <div className="sidebar-header-divider" aria-hidden="true" />

        {/* Navigation */}
        <nav className={`sidebar-scroll sidebar-fade flex-1 py-3 space-y-1 overflow-y-auto overflow-x-hidden ${showLabels ? 'px-3' : 'px-2'}`}>
          {renderNavigation()}
        </nav>

        {/* Bottom: expand/collapse */}
        <div className={`hidden md:block flex-shrink-0 pb-3 pt-2 ${showLabels ? 'px-3' : 'px-2'}`}>
          <div className="sidebar-header-divider mb-2" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            title={isExpanded ? 'Réduire' : 'Déployer'}
            className={`sidebar-link group relative flex items-center rounded-xl text-sm font-medium ${
              showLabels ? 'w-full px-3 py-2.5' : 'sidebar-link-rail mx-auto h-11 w-11 justify-center'
            }`}
          >
            {isExpanded ? (
              <PanelLeftClose className="h-5 w-5 flex-shrink-0" />
            ) : (
              <PanelLeftOpen className="h-5 w-5 flex-shrink-0" />
            )}
            <span
              className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
                showLabels ? 'ml-3 max-w-[160px] opacity-100' : 'ml-0 max-w-0 opacity-0'
              }`}
            >
              Réduire
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
