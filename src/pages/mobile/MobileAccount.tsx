import React, { useEffect, useState } from 'react';
import MobileLayout from './MobileLayout';
import { useAuth } from '../../context/AuthContext';
import { Moon, Sun, User } from 'lucide-react';
import { applyTheme, resolveTheme } from '../../utils/theme';

const MobileAccount: React.FC = () => {
  const { user } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => resolveTheme());
  const displayName = user?.full_name || user?.email || 'Compte';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <div className="flex flex-col items-center mb-6 mt-6">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={displayName}
              className="h-24 w-24 rounded-full object-cover border border-gray-200 shadow-sm"
            />
          ) : (
            <div className="h-24 w-24 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-xl font-semibold text-gray-700 shadow-sm">
              {initials || <User className="h-8 w-8 text-gray-400" />}
            </div>
          )}
          <div className="mt-3 text-base font-semibold text-gray-900">{displayName}</div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-800/80 dark:border-gray-700">
            <div className="text-xs uppercase tracking-wide text-gray-400">Email</div>
            <div className="text-sm font-medium text-gray-900 mt-1">{user?.email || '—'}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-800/80 dark:border-gray-700">
            <div className="text-xs uppercase tracking-wide text-gray-400">Numéro de téléphone</div>
            <div className="text-sm font-medium text-gray-900 mt-1">{(user as any)?.phone || '—'}</div>
          </div>
        </div>

        <div className="my-6 border-t border-gray-200" />

        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-800/80 dark:border-gray-700">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">Apparence</div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-900 dark:text-white">Mode clair / sombre</div>
            <button
              type="button"
              role="switch"
              aria-checked={theme === 'light'}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={`relative inline-flex h-8 w-16 items-center rounded-full border transition-colors ${
                theme === 'light'
                  ? 'border-amber-300 bg-amber-100'
                  : 'border-slate-600 bg-slate-700'
              }`}
            >
              <span
                className={`absolute left-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
                  theme === 'light' ? 'translate-x-8' : 'translate-x-0'
                }`}
              >
                {theme === 'light' ? (
                  <Sun className="h-4 w-4 text-amber-500" />
                ) : (
                  <Moon className="h-4 w-4 text-slate-500" />
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
};

export default MobileAccount;
