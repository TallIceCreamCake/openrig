import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Settings, Building2, LogOut, ChevronDown, X, HelpCircle } from 'lucide-react';
import GlobalSearchDropdown from './search/GlobalSearchDropdown';
import NotificationCenter from './notifications/NotificationCenter';
import HelpPanel from './help/HelpPanel';
import TabBar from './tabs/TabBar';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../context/AuthContext';
import { hasPerm } from '../utils/perm';
import { searchGlobalEntities, type GlobalSearchSection } from '../utils/globalSearch';
import { useTabMode } from '../hooks/useTabMode';

/* ── Shared search overlay panel ─────────────────────────────────────────── */
interface SearchOverlayProps {
  searchQuery: string;
  results: GlobalSearchSection[];
  isSearching: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onClose: () => void;
  className?: string;
  /** When true, hide the input row (used when the trigger is already an input) */
  hideInput?: boolean;
}

const SearchOverlay: React.FC<SearchOverlayProps> = ({
  searchQuery, results, isSearching, inputRef, onChange, onClear, onClose, className = '', hideInput = false,
}) => (
  <div
    className={`z-50 ${className}`}
    style={{ animation: 'searchOverlayIn 140ms cubic-bezier(0.4,0,0.2,1)' }}
  >
    <style>{`
      @keyframes searchOverlayIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>

    {/* Panel — uses topbar background so it blends in */}
    <div
      className="rounded-xl overflow-hidden shadow-2xl ring-1 ring-black/[0.07] dark:ring-white/[0.07]"
      style={{ background: 'var(--topbar-bg, white)' }}
    >
      {!hideInput && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/[0.05] dark:border-white/[0.05]">
          <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            placeholder="Rechercher matériel, presta, client..."
            type="search"
            value={searchQuery}
            onChange={onChange}
          />
          {searchQuery && (
            <button onClick={onClear} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <GlobalSearchDropdown
        sections={results}
        searchQuery={searchQuery}
        loading={isSearching}
        onClose={onClose}
        inline
      />
    </div>

  </div>
);

const TopBar = () => {
  const tabMode = useTabMode();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [results, setResults] = useState<GlobalSearchSection[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [tabSearchClosing, setTabSearchClosing] = useState(false);
  const searchOverlayRef = useRef<HTMLDivElement>(null);
  const searchOverlayInputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const tabSearchClosingRef = useRef(false);
  const {
    notifications,
    unreadCount,
    isOpen,
    setIsOpen,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();
  const { user } = useAuth();

  const profile = useMemo(() => {
    const full = user?.full_name || '';
    let first = full.trim();
    let last = '';
    if (full.includes(' ')) {
      const parts = full.trim().split(' ');
      first = parts.slice(0, -1).join(' ');
      last = parts.slice(-1).join(' ');
    }
    const avatar = user?.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face';
    return { first, last, avatar };
  }, [user]);

  const closeTabSearch = () => {
    if (tabSearchClosingRef.current) return;
    tabSearchClosingRef.current = true;
    setTabSearchClosing(true);
    setTimeout(() => {
      tabSearchClosingRef.current = false;
      setTabSearchClosing(false);
      setShowSearchOverlay(false);
      setSearchQuery('');
      setResults([]);
    }, 140);
  };

  // Ref-based handler so click-outside always reads fresh state (no stale closure)
  const clickOutsideHandlerRef = useRef((_e: MouseEvent) => {});
  clickOutsideHandlerRef.current = (event: MouseEvent) => {
    if (searchOverlayRef.current && !searchOverlayRef.current.contains(event.target as Node)) {
      if (tabMode && showSearchOverlay) {
        closeTabSearch();
      } else {
        setShowSearchOverlay(false);
        setSearchQuery('');
        setResults([]);
      }
    }
    if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
      setShowProfileMenu(false);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => clickOutsideHandlerRef.current(e);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


  useEffect(() => {
    if (showSearchOverlay) {
      setTimeout(() => searchOverlayInputRef.current?.focus(), 50);
    }
  }, [showSearchOverlay]);

  const handleSearchOverlay = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Apply accent early from cookie (to avoid flash)
  useEffect(() => {
    try {
      const m = document.cookie.match(/(?:^|; )or_accent=([^;]+)/);
      const accent = m ? decodeURIComponent(m[1]) : '';
      if (accent) document.documentElement.style.setProperty('--accent', accent);
    } catch {}
  }, []);

  // Debounced DB search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 3) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const sections = await searchGlobalEntities(q);
        setResults(sections);
      } catch (err) {
        console.error('Search error', err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  return (
    <header className="app-topbar shadow relative z-[45]">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 gap-3">

          {tabMode ? (
            /* TAB MODE — self-stretch so absolute children span full topbar height */
            <div className="relative self-stretch flex items-center flex-shrink-0 ml-12 md:ml-0 z-10" ref={searchOverlayRef}>
              <button
                onClick={() => setShowSearchOverlay(true)}
                className={`topbar-icon-btn h-9 w-9 flex items-center justify-center rounded-full transition-colors ${showSearchOverlay ? 'invisible pointer-events-none' : ''}`}
                title="Recherche rapide"
              >
                <Search className="h-5 w-5" />
              </button>

              {showSearchOverlay && (
                <>
                  <style>{`
                    @keyframes searchFadeIn  { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes searchFadeOut { from { opacity: 1; } to { opacity: 0; } }
                  `}</style>

                  {/* Solid background — full topbar height, hides tab underline */}
                  <div
                    className="absolute inset-y-0 left-0 pointer-events-none"
                    style={{ width: '32rem', background: 'var(--topbar-bg, white)' }}
                  />

                  {/* Right gradient — full topbar height */}
                  <div
                    className="absolute inset-y-0 pointer-events-none"
                    style={{ left: '32rem', width: '5rem', background: 'linear-gradient(to right, var(--topbar-bg, white), transparent)' }}
                  />

                  {/* Animated search input — centered */}
                  <div
                    className="absolute left-0 inset-y-0 flex items-center"
                    style={{ width: '32rem', animation: tabSearchClosing ? 'searchFadeOut 130ms ease forwards' : 'searchFadeIn 150ms ease' }}
                  >
                    <div className="relative w-full">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="topbar-leading-icon h-5 w-5" />
                      </div>
                      <input
                        ref={searchOverlayInputRef}
                        className="topbar-search-input block w-full pl-10 pr-3 py-2 border rounded-md leading-5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Rechercher matériel, presta, client..."
                        type="search"
                        value={searchQuery}
                        onChange={handleSearchOverlay}
                      />
                      {searchQuery.trim().length >= 3 && (
                        <SearchOverlay
                          searchQuery={searchQuery}
                          results={results}
                          isSearching={isSearching}
                          onChange={handleSearchOverlay}
                          onClear={() => { setSearchQuery(''); setResults([]); }}
                          onClose={closeTabSearch}
                          className="absolute top-full left-0 w-full min-w-[400px]"
                          hideInput
                        />
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* DEFAULT MODE — full visible search bar */
            <div className="flex-1 flex items-center ml-12 md:ml-0" ref={searchOverlayRef}>
              <div className="relative w-full max-w-lg lg:max-w-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="topbar-leading-icon h-5 w-5" />
                </div>
                <input
                  id="search"
                  ref={searchOverlayInputRef}
                  className="topbar-search-input block w-full pl-10 pr-3 py-2 border rounded-md leading-5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Rechercher matériel, presta, client..."
                  type="search"
                  value={searchQuery}
                  onChange={handleSearchOverlay}
                  onFocus={() => setShowSearchOverlay(true)}
                />
                {showSearchOverlay && searchQuery.trim().length >= 3 && (
                  <SearchOverlay
                    searchQuery={searchQuery}
                    results={results}
                    isSearching={isSearching}
                    onChange={handleSearchOverlay}
                    onClear={() => { setSearchQuery(''); setResults([]); }}
                    onClose={() => { setShowSearchOverlay(false); setSearchQuery(''); setResults([]); }}
                    className="absolute top-full left-0 w-full min-w-[400px]"
                    hideInput
                  />
                )}
              </div>
            </div>
          )}

          {/* Tab bar */}
          {tabMode && (
            <div className="flex-1 min-w-0 self-stretch overflow-hidden">
              <TabBar />
            </div>
          )}

          {/* Right icons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Help */}
            <div className="relative">
              <button
                onClick={() => setShowHelp((v) => !v)}
                className="topbar-icon-btn relative p-2 rounded-full focus:outline-none transition-colors"
                title="Aide"
              >
                <HelpCircle className="h-6 w-6" />
              </button>
              <HelpPanel isOpen={showHelp} onClose={() => setShowHelp(false)} />
            </div>

            {/* Notification bell */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="topbar-icon-btn relative p-2 rounded-full focus:outline-none transition-colors"
            >
              <Bell className="h-6 w-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Profile */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="topbar-icon-btn flex items-center gap-2 px-2 py-1.5 rounded-full focus:outline-none transition-colors"
              >
                <img
                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                  src={profile.avatar}
                  alt="Profile"
                />
                <span className="hidden md:block text-sm font-medium leading-tight max-w-[120px] truncate">
                  {profile.first || 'Utilisateur'} {profile.last}
                </span>
                <ChevronDown
                  className="hidden md:block h-3.5 w-3.5 flex-shrink-0"
                  style={{ transform: showProfileMenu ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}
                />
              </button>

              <div
                className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 z-[12010] overflow-hidden origin-top-right"
                style={{
                  opacity: showProfileMenu ? 1 : 0,
                  transform: showProfileMenu ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-8px)',
                  transition: 'opacity 200ms ease, transform 200ms ease',
                  pointerEvents: showProfileMenu ? 'auto' : 'none',
                }}
              >
                <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800">
                  <img
                    className="h-10 w-10 rounded-full object-cover flex-shrink-0 ring-2 ring-gray-100 dark:ring-gray-800"
                    src={profile.avatar}
                    alt="Profile"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {profile.first || 'Utilisateur'} {profile.last}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {user?.email || ''}
                    </div>
                  </div>
                </div>

                <div className="py-1.5">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => { setShowProfileMenu(false); navigate('/settings'); }}
                  >
                    <div className="h-7 w-7 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <Settings className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    </div>
                    Préférences utilisateur
                  </button>
                  {hasPerm(user, 'cs_view_company') && (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => { setShowProfileMenu(false); navigate('/company'); }}
                    >
                      <div className="h-7 w-7 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                      </div>
                      Gestion entreprise
                    </button>
                  )}
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 py-1.5">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    onClick={() => { setShowProfileMenu(false); try { (window as any).__auth_logout?.(); } finally { window.location.href = '/login'; } }}
                  >
                    <div className="h-7 w-7 rounded-md bg-red-50 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0">
                      <LogOut className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                    </div>
                    Déconnexion
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <NotificationCenter
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        markAsRead={markAsRead}
        markAllAsRead={markAllAsRead}
        deleteNotification={deleteNotification}
        clearAll={clearAll}
      />
    </header>
  );
};

export default TopBar;
