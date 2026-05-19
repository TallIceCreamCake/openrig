import React, { useEffect, useRef, useState } from 'react';
import { ClipboardList, Package, X, Calendar, Wrench, Warehouse, Users, Building2, User, Truck, Undo2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface Props { onClose?: () => void }

const MobileMenu: React.FC<Props> = ({ onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const tiles = [
    {
      key: 'preparations',
      label: 'Préparations',
      icon: ClipboardList,
      iconClass: 'text-indigo-600',
      to: '/m/preparations',
    },
    {
      key: 'deliveries',
      label: 'Livraison',
      icon: Truck,
      iconClass: 'text-amber-600',
      to: '/m/livraisons',
    },
    {
      key: 'returns',
      label: 'Retour',
      icon: Undo2,
      iconClass: 'text-teal-600',
      to: '/m/retours',
    },
    {
      key: 'prestations',
      label: 'Prestations',
      icon: Package,
      iconClass: 'text-sky-600',
      to: '/m/prestations',
    },
    {
      key: 'calendar',
      label: 'Calendrier',
      icon: Calendar,
      iconClass: 'text-emerald-600',
      to: '/m/calendrier',
    },
    {
      key: 'equipment',
      label: 'Matériel',
      icon: Wrench,
      iconClass: 'text-lime-600',
      to: '/m/materiel',
    },
    {
      key: 'warehouses',
      label: 'Entrepôts',
      icon: Warehouse,
      iconClass: 'text-cyan-600',
      to: '/m/entrepots',
    },
    {
      key: 'clients',
      label: 'Clients',
      icon: Users,
      iconClass: 'text-violet-600',
      to: '/m/clients',
    },
    {
      key: 'company',
      label: 'Entreprise',
      icon: Building2,
      iconClass: 'text-amber-700',
      to: '/m/entreprise',
    },
  ];

  const displayName = user?.full_name || user?.email || 'Utilisateur';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="w-full h-full bg-white flex flex-col p-6">
      <div className="flex justify-end">
        {onClose && (
          <button onClick={onClose} className="p-2 text-gray-500" aria-label="Fermer le menu">
            <X className="h-6 w-6" />
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="grid grid-cols-3 gap-4">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const isDisabled = Boolean(tile.disabled);
            const content = (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
                <Icon className={`h-8 w-8 ${isDisabled ? 'text-gray-300' : tile.iconClass}`} />
                <div
                  className={`text-sm font-medium ${
                    isDisabled ? 'text-gray-400' : 'text-gray-800 dark:text-white'
                  }`}
                >
                  {tile.label}
                </div>
              </div>
            );
            const baseClass = 'relative w-full rounded-3xl border border-gray-200 bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_10px_22px_-14px_rgba(15,23,42,0.55),0_4px_10px_-6px_rgba(15,23,42,0.35)] transition-transform active:scale-[.98] active:translate-y-[1px] dark:bg-gray-800/80 dark:border-gray-700 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_22px_-14px_rgba(0,0,0,0.65),0_4px_10px_-6px_rgba(0,0,0,0.55)]';
            const style = { aspectRatio: '1 / 1' } as React.CSSProperties;
            if (tile.to && !isDisabled) {
              return (
                <Link key={tile.key} to={tile.to} className={baseClass} style={style}>
                  {content}
                </Link>
              );
            }
            return (
              <div
                key={tile.key}
                className={`${baseClass} bg-gray-50 text-gray-400 cursor-not-allowed dark:bg-gray-700/70 dark:text-gray-500`}
                style={style}
                aria-disabled="true"
              >
                {content}
              </div>
            );
          })}
        </div>
        <div className="mt-auto pt-6">
          <div
            ref={profileRef}
            className="relative w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_10px_22px_-14px_rgba(15,23,42,0.55),0_4px_10px_-6px_rgba(15,23,42,0.35)] dark:bg-gray-800/80 dark:border-gray-700 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_22px_-14px_rgba(0,0,0,0.65),0_4px_10px_-6px_rgba(0,0,0,0.55)]"
          >
            <button
              type="button"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              className="flex w-full items-center gap-3 text-left"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={displayName}
                  className="h-10 w-10 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700">
                  {initials || <User className="h-5 w-5 text-gray-400" />}
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900">{displayName}</div>
                <div className="text-xs text-gray-500">Compte utilisateur</div>
              </div>
            </button>
            {profileMenuOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border bg-white shadow-lg dark:bg-gray-800/90 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    navigate('/m/account');
                  }}
                  className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left dark:text-gray-100 dark:hover:bg-gray-700/60"
                >
                  Paramètres du compte
                </button>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left border-t dark:text-red-400 dark:hover:bg-red-900/30 dark:border-gray-700"
                >
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileMenu;
