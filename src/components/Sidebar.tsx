import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { hasPerm } from '../utils/perm';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_MENU_LAYOUT,
  MENU_ICON_PLACEHOLDER,
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

  const renderNavLink = (def: NavigationItemDefinition, depth = 0) => (
    <NavLink
      key={def.key}
      to={def.href}
      onClick={() => setIsMobileOpen(false)}
      className={({ isActive }) =>
        `group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
          isActive
            ? 'sidebar-nav-item-active'
            : 'sidebar-nav-item hover:sidebar-nav-item-hover'
        } ${isExpanded ? 'justify-start' : 'justify-center'} ${depth > 0 ? 'ml-4' : ''}`
      }
      title={!isExpanded ? def.name : undefined}
    >
      <def.icon className={`h-6 w-6 flex-shrink-0 ${isExpanded ? 'mr-3' : ''}`} />
      <span className={`transition-all duration-300 ${
        isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 md:opacity-0 md:-translate-x-2'
      } ${isExpanded ? 'block' : 'hidden'}`}>
        {def.name}
      </span>
    </NavLink>
  );

  const renderNavigation = () => navigation.map(node => {
    if (node.type === 'item') {
      return renderNavLink(node.def);
    }
    const Icon = node.children.find(child => child.type === 'item')?.def.icon || MENU_ICON_PLACEHOLDER;
    const isOpen = expandedGroups[node.id] ?? true;
    return (
      <div key={node.id} className="space-y-1">
        <button
          type="button"
          onClick={() => toggleGroup(node.id)}
          className={`w-full flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors sidebar-nav-item ${
            isExpanded ? 'justify-between' : 'justify-center'
          }`}
        >
          <div className={`flex items-center ${isExpanded ? '' : 'justify-center w-full'}`}>
            <Icon className={`h-6 w-6 flex-shrink-0 ${isExpanded ? 'mr-3' : ''}`} />
            <span className={`transition-all duration-300 ${
              isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 md:opacity-0 md:-translate-x-2'
            } ${isExpanded ? 'block' : 'hidden'}`}>
              {node.label}
            </span>
          </div>
          {isExpanded && (
            (isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)
          )}
        </button>
        {isOpen && (
          <div className="pl-0 space-y-1">
            {node.children.map(child =>
              child.type === 'item'
                ? renderNavLink(child.def, 1)
                : null
            )}
          </div>
        )}
      </div>
    );
  });

  return (
    <>
      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors dark:bg-gray-800 dark:text-white dark:border-gray-700 dark:hover:bg-gray-700"
        >
          {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed md:relative inset-y-0 left-0 z-40
          flex flex-col border-r transition-all duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isExpanded ? 'w-64' : 'w-16 md:w-16'}
        `}
        style={{
          background: 'var(--sidebar-bg)',
          borderColor: 'var(--sidebar-border)',
          color: 'var(--sidebar-text)',
        }}
      >
        {/* Header */}
        <div className="flex items-center flex-shrink-0 px-4 py-4">
          <div className={`transition-all duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 md:opacity-0'}`}>
            {isExpanded && (
              <h1 className="text-xl font-bold whitespace-nowrap" style={{ color: 'var(--sidebar-text)' }}>Open RIG</h1>
            )}
          </div>
          {!isExpanded && (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent, #2563eb)' }}>
              <span className="text-white font-bold text-sm">OR</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
          {renderNavigation()}
        </nav>

        {/* Expand/Collapse button */}
        <div className="hidden md:flex flex-shrink-0 p-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-center px-2 py-2 text-sm font-medium rounded-md transition-colors sidebar-soft-hover"
            title={isExpanded ? 'Réduire' : 'Déployer'}
          >
            <Menu className={`h-5 w-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
            {isExpanded && <span className="ml-2">Réduire</span>}
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
