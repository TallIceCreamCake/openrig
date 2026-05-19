import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import BugReportLauncher from '../../components/bug-reports/BugReportLauncher';
import StepTransition from '../../components/ui-kit/StepTransition';

const DepotLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Interface dépôt</h1>
            <p className="text-xs text-gray-500">
              {user?.full_name || user?.email || 'Utilisateur'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Interface classique
            </Link>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 py-6">
        <StepTransition stepKey={`${location.pathname}${location.search}`}>
          {children}
        </StepTransition>
      </main>
      <BugReportLauncher />
    </div>
  );
};

export default DepotLayout;
