import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NAV_ITEM_DEFINITIONS, type NavItemKey } from '../constants/navigation';

export interface AppTab {
  id: string;
  path: string;
  label: string;
  iconKey: NavItemKey | null;
}

interface TabsContextValue {
  tabs: AppTab[];
  activeTabId: string | null;
  openTab: (path: string, label: string, iconKey?: NavItemKey | null) => string;
  closeTab: (id: string, navigate: (path: string) => void) => void;
  switchTab: (id: string, navigate: (path: string) => void) => void;
  updateActiveTabPath: (path: string) => void;
  updateActiveTabLabel: (label: string) => void;
  updateActiveTabIcon: (iconKey: NavItemKey | null) => void;
  newTab: (navigate: (path: string) => void) => void;
  getTabIcon: (iconKey: NavItemKey | null) => LucideIcon | null;
}

const TabsContext = createContext<TabsContextValue | null>(null);

const TABS_KEY = 'or_app_tabs';
const ACTIVE_KEY = 'or_app_tabs_active';

function loadTabs(): AppTab[] {
  try {
    const raw = sessionStorage.getItem(TABS_KEY);
    if (raw) return JSON.parse(raw) as AppTab[];
  } catch {}
  return [];
}

function loadActiveId(): string | null {
  try { return sessionStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export const TabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<AppTab[]>(loadTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(loadActiveId);

  // Mutable refs for synchronous reads inside callbacks
  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeTabId);
  // Flag: skip the next path-update triggered by a tab switch navigation
  const skipNextPathUpdateRef = useRef(false);

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { activeRef.current = activeTabId; }, [activeTabId]);

  useEffect(() => {
    try { sessionStorage.setItem(TABS_KEY, JSON.stringify(tabs)); } catch {}
  }, [tabs]);

  useEffect(() => {
    try {
      if (activeTabId) sessionStorage.setItem(ACTIVE_KEY, activeTabId);
      else sessionStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }, [activeTabId]);

  /** Open a new tab (or reuse if same root path exists). Returns the tab id. */
  const openTab = useCallback((path: string, label: string, iconKey?: NavItemKey | null): string => {
    const existing = tabsRef.current.find(
      t => t.path === path || t.path.startsWith(path + '/') || path.startsWith(t.path + '/')
    );
    if (existing) return existing.id;
    const tab: AppTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      path,
      label,
      iconKey: iconKey ?? null,
    };
    setTabs(prev => [...prev, tab]);
    return tab.id;
  }, []);

  /** Close a tab. If it was active, navigate to the adjacent one. */
  const closeTab = useCallback((id: string, navigate: (path: string) => void) => {
    const current = tabsRef.current;
    const idx = current.findIndex(t => t.id === id);
    const next = current.filter(t => t.id !== id);
    if (next.length === 0) {
      // Always keep at least one tab — fall back to dashboard
      const def = NAV_ITEM_DEFINITIONS.dashboard;
      const fallback: AppTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        path: def.href,
        label: def.name,
        iconKey: 'dashboard',
      };
      skipNextPathUpdateRef.current = true;
      setTabs([fallback]);
      setActiveTabId(fallback.id);
      navigate(def.href);
    } else {
      setTabs(next);
      if (activeRef.current === id) {
        const newActive = next[Math.min(idx, next.length - 1)];
        skipNextPathUpdateRef.current = true;
        setActiveTabId(newActive.id);
        navigate(newActive.path);
      }
    }
  }, []);

  /** Switch to a tab and navigate to its stored path. */
  const switchTab = useCallback((id: string, navigate: (path: string) => void) => {
    const tab = tabsRef.current.find(t => t.id === id);
    if (!tab) return;
    skipNextPathUpdateRef.current = true;
    setActiveTabId(id);
    navigate(tab.path);
  }, []);

  /** Update the label of the active tab (called when document.title changes). */
  const updateActiveTabLabel = useCallback((label: string) => {
    const id = activeRef.current;
    if (!id) return;
    setTabs(prev => prev.map(t => t.id === id ? { ...t, label } : t));
  }, []);

  /** Update the icon of the active tab (called when the section changes). */
  const updateActiveTabIcon = useCallback((iconKey: NavItemKey | null) => {
    const id = activeRef.current;
    if (!id) return;
    setTabs(prev => prev.map(t => t.id === id ? { ...t, iconKey } : t));
  }, []);

  /** Called on every location change — keeps the active tab's path up to date. */
  const updateActiveTabPath = useCallback((path: string) => {
    if (skipNextPathUpdateRef.current) {
      skipNextPathUpdateRef.current = false;
      return;
    }
    const id = activeRef.current;
    if (!id) return;
    setTabs(prev => prev.map(t => t.id === id ? { ...t, path } : t));
  }, []);

  const newTab = useCallback((navigate: (path: string) => void) => {
    const def = NAV_ITEM_DEFINITIONS.dashboard;
    const tab: AppTab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      path: def.href,
      label: def.name,
      iconKey: 'dashboard',
    };
    skipNextPathUpdateRef.current = true;
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    navigate(def.href);
  }, []);

  const getTabIcon = useCallback((iconKey: NavItemKey | null): LucideIcon | null => {
    if (!iconKey) return null;
    return NAV_ITEM_DEFINITIONS[iconKey]?.icon ?? null;
  }, []);

  return (
    <TabsContext.Provider value={{ tabs, activeTabId, openTab, closeTab, switchTab, updateActiveTabPath, updateActiveTabLabel, updateActiveTabIcon, newTab, getTabIcon }}>
      {children}
    </TabsContext.Provider>
  );
};

export function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used inside TabsProvider');
  return ctx;
}
