import React, { useRef, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTabs } from '../../context/TabsContext';
import { NAV_ITEM_DEFINITIONS, type NavItemKey } from '../../constants/navigation';

/** Derive the nav section icon key from a pathname */
function iconKeyFromPath(pathname: string): NavItemKey | null {
  // Sort by href length descending so more-specific paths match first
  const sorted = Object.values(NAV_ITEM_DEFINITIONS).sort(
    (a, b) => b.href.length - a.href.length
  );
  for (const def of sorted) {
    if (def.href === '/') {
      if (pathname === '/') return def.key;
    } else if (pathname === def.href || pathname.startsWith(def.href + '/')) {
      return def.key;
    }
  }
  return null;
}

/** Strip the app suffix from document.title */
function cleanTitle(raw: string): string {
  return raw.replace(/\s*[·|–-]\s*Open RIG\s*$/i, '').trim() || raw;
}

const TabBar: React.FC = () => {
  const { tabs, activeTabId, switchTab, closeTab, newTab, updateActiveTabPath, updateActiveTabLabel, updateActiveTabIcon, getTabIcon } = useTabs();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Keep active tab path + icon in sync with navigation
  useEffect(() => {
    updateActiveTabPath(location.pathname + location.search);
    updateActiveTabIcon(iconKeyFromPath(location.pathname));
  }, [location.pathname, location.search]);

  // Watch document.title for precise tab names (e.g. actual entity names set by pages)
  useEffect(() => {
    const sync = () => {
      const label = cleanTitle(document.title);
      if (label) updateActiveTabLabel(label);
    };
    // Sync immediately for current title
    sync();
    const titleEl = document.querySelector('title');
    if (!titleEl) return;
    const obs = new MutationObserver(sync);
    obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
    return () => obs.disconnect();
  }, [activeTabId]);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [tabs]);

  return (
    <div className="flex items-stretch h-full gap-0 min-w-0">
      {/* Left scroll */}
      {canScrollLeft && (
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
          className="flex-shrink-0 w-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Tabs */}
      <div
        ref={scrollRef}
        className="flex items-stretch overflow-x-auto flex-1 min-w-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map((tab, idx) => {
          const Icon = getTabIcon(tab.iconKey);
          const active = tab.id === activeTabId;
          const isLast = idx === tabs.length - 1;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id, navigate)}
              title={tab.label}
              className={[
                'group relative flex items-center gap-1.5 px-4 h-full select-none transition-colors duration-150 flex-shrink-0 text-sm',
                !isLast ? 'after:absolute after:right-0 after:inset-y-3 after:w-px after:bg-gray-200 dark:after:bg-gray-700 after:pointer-events-none' : '',
                active ? 'topbar-tab-active font-medium' : 'font-normal hover:bg-black/[0.03] dark:hover:bg-white/[0.03]',
              ].join(' ')}
              style={active
                ? { color: 'var(--topbar-tab-active-text, #2563eb)' }
                : { color: 'var(--topbar-muted-text, #9ca3af)' }
              }
            >
              {active && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{ background: 'var(--topbar-tab-indicator, var(--accent, #2563eb))' }}
                />
              )}
              {Icon && (
                <Icon
                  className="h-3.5 w-3.5 flex-shrink-0"
                  style={{ color: active ? 'var(--topbar-tab-indicator, var(--accent, #2563eb))' : 'var(--topbar-muted-text, #9ca3af)' }}
                />
              )}
              <span className="max-w-[150px] truncate leading-none">{tab.label}</span>
              <span
                role="button"
                onClick={e => { e.stopPropagation(); closeTab(tab.id, navigate); }}
                className={[
                  'ml-0.5 h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-100',
                  active
                    ? 'text-blue-400 dark:text-blue-500 hover:bg-red-100 dark:hover:bg-red-950/50 hover:text-red-500'
                    : 'text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500',
                ].join(' ')}
              >
                <X className="h-2.5 w-2.5" />
              </span>
            </button>
          );
        })}

        {/* + button glued after last tab */}
        <button
          onClick={() => newTab(navigate)}
          title="Nouvel onglet"
          className="flex-shrink-0 flex items-center justify-center w-8 h-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>

      </div>

      {/* Right scroll */}
      {canScrollRight && (
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
          className="flex-shrink-0 w-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export default TabBar;
