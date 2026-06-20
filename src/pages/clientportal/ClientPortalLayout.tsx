import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Home, LogOut, ChevronDown, UserCircle, Receipt,
  FileCheck, ClipboardList, List, CalendarDays, KeyRound, Settings,
} from 'lucide-react';

export type CPUser = {
  client_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  must_change_password: boolean;
  company_client_id: string | null;
  company_name: string | null;
};

type Props = {
  children: (user: CPUser) => React.ReactNode;
};

// ── Popover dropdown nav ─────────────────────────────────────────────────────
type DropdownItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc?: string;
};

const NavDropdown: React.FC<{
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: DropdownItem[];
  activePaths: string[];
}> = ({ label, icon: Icon, items, activePaths }) => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = activePaths.some((p) => location.pathname.startsWith(p));

  const open_ = () => { if (timerRef.current) clearTimeout(timerRef.current); setOpen(true); };
  const close_ = () => { timerRef.current = setTimeout(() => setOpen(false), 130); };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div ref={ref} className="relative" onMouseEnter={open_} onMouseLeave={close_}>
      <button
        type="button"
        className={`sidebar-link flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium select-none ${isActive ? 'sidebar-link-active' : ''}`}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span>{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full pt-2 z-50 min-w-[220px]">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden py-1.5 shadow-lg">
            {items.map(({ to, label: lbl, icon: ItemIcon, desc }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive: a }) =>
                  `sidebar-link flex items-start gap-3 px-3 py-2.5 mx-1.5 rounded-xl text-sm font-medium ${a ? 'sidebar-link-active' : ''}`
                }
              >
                <ItemIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="leading-tight">{lbl}</p>
                  {desc && (
                    <p className="text-[11px] opacity-60 mt-0.5 font-normal">{desc}</p>
                  )}
                </div>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main layout ──────────────────────────────────────────────────────────────
const ClientPortalLayout: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<CPUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('cp_token');
    if (!token) { navigate('/espaceclient', { replace: true }); return; }

    fetch('/api/client-portal/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => {
        if (d.must_change_password) {
          navigate('/espaceclient/changer-mot-de-passe', { replace: true });
          return;
        }
        setUser(d);
      })
      .catch(() => {
        localStorage.removeItem('cp_token');
        navigate('/espaceclient', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem('cp_token');
    if (token) {
      await fetch('/api/client-portal/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    ['cp_token', 'cp_email', 'cp_client_id'].forEach((k) => localStorage.removeItem(k));
    navigate('/espaceclient', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin" style={{ color: 'var(--sidebar-muted-text)' }} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  if (!user) return null;

  const initials = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div
      className="min-h-screen bg-gray-100 flex flex-col"
      style={{
        '--accent': '#059669',
        '--accent-700': '#047857',
        '--accent-50': 'color-mix(in oklab, #059669 12%, white)',
        '--accent-100': 'color-mix(in oklab, #059669 20%, white)',
      } as React.CSSProperties}
    >

      {/* ── Topbar — same shell as sidebar ── */}
      <header className="sidebar-shell app-topbar sticky top-0 z-40 border-b">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-2">

          {/* Logo badge + portal label */}
          <Link to="/espaceclient/accueil" className="flex items-center gap-3 flex-shrink-0 mr-3">
            <div className="sidebar-logo-badge h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white font-extrabold text-xs tracking-tight">OR</span>
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-sm font-bold leading-tight" style={{ color: 'var(--sidebar-text)' }}>
                OpenRig
              </span>
              <span className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--sidebar-muted-text)' }}>
                Espace Client
              </span>
            </div>
          </Link>

          {/* Subtle separator */}
          <div className="hidden sm:block w-px h-6 mx-1 flex-shrink-0" style={{ background: 'var(--sidebar-border)' }} />

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            <NavLink
              to="/espaceclient/accueil"
              className={({ isActive }) =>
                `sidebar-link flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${isActive ? 'sidebar-link-active' : ''}`
              }
            >
              <Home className="h-4 w-4 flex-shrink-0" />
              Accueil
            </NavLink>

            <NavDropdown
              label="Documents"
              icon={Receipt}
              activePaths={['/espaceclient/factures', '/espaceclient/devis']}
              items={[
                { to: '/espaceclient/devis',    label: 'Devis',    icon: FileCheck, desc: 'Vos devis et leur statut' },
                { to: '/espaceclient/factures', label: 'Factures', icon: Receipt,   desc: 'Vos factures et paiements' },
              ]}
            />

            <NavDropdown
              label="Projets"
              icon={CalendarDays}
              activePaths={['/espaceclient/demande', '/espaceclient/projets', '/espaceclient/planning']}
              items={[
                { to: '/espaceclient/demande',  label: 'Demande de projet', icon: ClipboardList, desc: 'Soumettre un nouveau projet' },
                { to: '/espaceclient/projets',  label: 'Mes projets',       icon: List,          desc: 'Historique et suivi' },
                { to: '/espaceclient/planning', label: 'Planning',          icon: CalendarDays,  desc: 'Vue calendrier' },
              ]}
            />
          </nav>

          <div className="flex-1" />

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className={`sidebar-link flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-sm font-medium ${userMenuOpen ? 'sidebar-link-active' : ''}`}
            >
              {/* Avatar circle using accent */}
              <span
                className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-700))' }}
              >
                {initials}
              </span>
              <span className="hidden sm:block max-w-[140px] truncate">{user.name || user.email}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 opacity-60 transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-60 z-50">
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg">
                  {/* Identity header */}
                  <div className="px-4 py-3.5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-700))' }}
                      >
                        {initials}
                      </span>
                      <div className="min-w-0">
                        {user.name && (
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--sidebar-text)' }}>
                            {user.name}
                          </p>
                        )}
                        <p className="text-xs truncate" style={{ color: 'var(--sidebar-muted-text)' }}>
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="p-1.5 space-y-0.5">
                    <NavLink
                      to="/espaceclient/profil"
                      onClick={() => setUserMenuOpen(false)}
                      className={({ isActive }) =>
                        `sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive ? 'sidebar-link-active' : ''}`
                      }
                    >
                      <UserCircle className="h-4 w-4 flex-shrink-0" />
                      Mon profil
                    </NavLink>
                    <NavLink
                      to="/espaceclient/changer-mot-de-passe"
                      onClick={() => setUserMenuOpen(false)}
                      className={({ isActive }) =>
                        `sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive ? 'sidebar-link-active' : ''}`
                      }
                    >
                      <KeyRound className="h-4 w-4 flex-shrink-0" />
                      Changer le mot de passe
                    </NavLink>
                    <NavLink
                      to="/espaceclient/parametres"
                      onClick={() => setUserMenuOpen(false)}
                      className={({ isActive }) =>
                        `sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive ? 'sidebar-link-active' : ''}`
                      }
                    >
                      <Settings className="h-4 w-4 flex-shrink-0" />
                      Paramètres
                    </NavLink>
                  </div>

                  <div className="p-1.5 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                      style={{ color: '#dc2626' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fef2f2')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <LogOut className="h-4 w-4 flex-shrink-0" />
                      Se déconnecter
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1">
        {children(user)}
      </main>

      {/* ── Footer ── */}
      <footer className="py-4 text-center text-xs" style={{ color: 'var(--sidebar-muted-text)' }}>
        © {new Date().getFullYear()} OpenRig — Espace Client
      </footer>
    </div>
  );
};

export default ClientPortalLayout;
