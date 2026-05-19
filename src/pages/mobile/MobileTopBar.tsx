import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Home, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import SearchDropdown from '../../components/equipment/SearchDropdown';
import NotificationCenter from '../../components/notifications/NotificationCenter';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase } from '../../lib/supabase';

type SearchItem = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  rental_price_ht: number;
  rental_price_ttc: number;
  status: string;
  image_url: string | null;
  available_units?: number;
};

const MobileTopBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef<HTMLDivElement>(null);
  const previousPathRef = useRef<string | null>(null);
  const [previousPath, setPreviousPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [results, setResults] = useState<SearchItem[]>([]);
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
    setShowDropdown(true);
  };

  useEffect(() => {
    try {
      const match = document.cookie.match(/(?:^|; )or_accent=([^;]+)/);
      const accent = match ? decodeURIComponent(match[1]) : '';
      if (accent) document.documentElement.style.setProperty('--accent', accent);
    } catch {
      // ignore accent load failure
    }
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const pattern = `%${q}%`;
        const { data, error } = await supabase
          .from('equipment')
          .select('id,name,type,subtype,rental_price_ht,rental_price_ttc,status,image_url')
          .or(`name.ilike.${pattern},type.ilike.${pattern},subtype.ilike.${pattern}`)
          .limit(5);
        if (error) throw error;
        const list = data || [];
        if (list.length) {
          const ids = list.map(item => item.id);
          const now = new Date().toISOString();
          const { data: availability, error: availabilityErr } = await supabase.rpc('get_units_availability_for_equipment', {
            p_ids: ids,
            p_start: now,
            p_end: now,
          });
          const availabilityMap: Record<string, number> = {};
          if (!availabilityErr && Array.isArray(availability)) {
            availability.forEach((row: any) => {
              availabilityMap[row.equipment_id] = Number(row.available ?? 0);
            });
          }
          setResults(list.map(item => ({ ...item, available_units: availabilityMap[item.id] ?? 0 })));
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error('Search error', err);
        setResults([]);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    setPreviousPath(previousPathRef.current);
    previousPathRef.current = location.pathname;
  }, [location.pathname]);

  const isHome = location.pathname === '/m';
  const showHomeIcon = isHome || previousPath === '/m' || !previousPath;

  const handlePrimaryNav = () => {
    if (isHome) {
      navigate('/m');
      return;
    }
    if (!previousPath) {
      navigate('/m', { replace: true });
      return;
    }
    navigate(-1);
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
      <div className="px-4 py-3">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3">
          <button
            type="button"
            onClick={handlePrimaryNav}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm active:scale-[.98]"
            aria-label={showHomeIcon ? 'Accueil' : 'Retour'}
          >
            {showHomeIcon ? <Home className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
          </button>
          <div className="relative flex-1" ref={searchRef}>
            <label htmlFor="mobile-search" className="sr-only">Recherche rapide</label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="mobile-search"
              type="search"
              value={searchQuery}
              onChange={handleSearch}
              onFocus={() => setShowDropdown(true)}
              placeholder="Rechercher du matériel..."
              className="block w-full rounded-full border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm leading-5 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800/80 dark:border-gray-700 dark:text-white dark:placeholder-gray-400"
            />
            {showDropdown && (
              <SearchDropdown
                equipment={results as any}
                searchQuery={searchQuery}
                onClose={() => setShowDropdown(false)}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors active:scale-[.98]"
            aria-label="Ouvrir les notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
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

export default MobileTopBar;
