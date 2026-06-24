import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  ScanLine,
  Calendar,
  MoreHorizontal,
  X,
  Truck,
  Undo2,
  Package,
  Wrench,
  Users,
  Warehouse,
  Building2,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Accueil', to: '/m' },
  { icon: ClipboardList, label: 'Projets', to: '/m/projets' },
  { icon: ScanLine, label: 'Scan', to: '/m/scan', center: true },
  { icon: Calendar, label: 'Planning', to: '/m/calendrier' },
  { icon: MoreHorizontal, label: 'Plus', to: null },
];

const sheetItems = [
  { icon: ClipboardList, label: 'Préparations', to: '/m/preparations', iconClass: 'text-indigo-600 bg-indigo-50' },
  { icon: Truck, label: 'Livraisons', to: '/m/livraisons', iconClass: 'text-amber-600 bg-amber-50' },
  { icon: Undo2, label: 'Retours', to: '/m/retours', iconClass: 'text-teal-600 bg-teal-50' },
  { icon: Package, label: 'Prestations', to: '/m/prestations', iconClass: 'text-sky-600 bg-sky-50' },
  { icon: Wrench, label: 'Matériel', to: '/m/materiel', iconClass: 'text-lime-600 bg-lime-50' },
  { icon: Users, label: 'Clients', to: '/m/clients', iconClass: 'text-violet-600 bg-violet-50' },
  { icon: Warehouse, label: 'Entrepôts', to: '/m/entrepots', iconClass: 'text-cyan-600 bg-cyan-50' },
  { icon: Building2, label: 'Entreprise', to: '/m/entreprise', iconClass: 'text-amber-700 bg-amber-50' },
];

const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (to: string | null) => {
    if (!to) return false;
    if (to === '/m') return location.pathname === '/m';
    return location.pathname.startsWith(to);
  };

  const handleNav = (item: typeof navItems[0]) => {
    if (item.to === null) {
      setSheetOpen(true);
    } else {
      navigate(item.to);
    }
  };

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-1 z-40">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);

          if (item.center) {
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.to!)}
                className="flex flex-col items-center justify-center -mt-5"
                aria-label={item.label}
              >
                <div className="h-14 w-14 rounded-full bg-blue-600 flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </button>
            );
          }

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNav(item)}
              className="flex flex-col items-center justify-center gap-0.5 min-w-[44px] py-1 px-2"
              aria-label={item.label}
            >
              <Icon className={`h-6 w-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className={`text-[10px] font-medium ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Plus sheet overlay */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setSheetOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white rounded-t-2xl px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-semibold text-gray-900">Menu</span>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {sheetItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => {
                      setSheetOpen(false);
                      navigate(item.to);
                    }}
                    className="flex flex-col items-center gap-2 py-3"
                  >
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${item.iconClass}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-medium text-gray-700 text-center leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileBottomNav;
