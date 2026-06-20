import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ClientPortalLayout, { CPUser } from './ClientPortalLayout';
import { Receipt, FileCheck, ClipboardList, List, CalendarDays, AlertCircle } from 'lucide-react';

type Summary = {
  invoices: { total: number; unpaid_amount: number };
  quotes: { pending: number };
  projects: { active: number; upcoming: number };
};

type NavCardProps = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  hoverBorder: string;
  title: string;
  desc: string;
  badge?: string;
  badgeColor?: string;
};

const NavCard: React.FC<NavCardProps> = ({
  to, icon: Icon, iconBg, iconColor, hoverBorder, title, desc, badge, badgeColor,
}) => (
  <Link
    to={to}
    className={`group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex items-start gap-4 ${hoverBorder} hover:shadow-md transition-all`}
  >
    <div className={`h-11 w-11 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
      <Icon className={`h-5 w-5 ${iconColor}`} />
    </div>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      {badge && (
        <span className={`inline-block mt-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  </Link>
);

const HomeContent: React.FC<{ user: CPUser }> = ({ user }) => {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('cp_token') || '';
    fetch('/api/client-portal/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setSummary(d))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour{user.name ? `, ${user.name}` : ''}&nbsp;!
        </h1>
        <p className="mt-1 text-gray-500 text-sm">
          Bienvenue dans votre espace personnel OpenRig.
        </p>
      </div>

      {summary && summary.invoices.unpaid_amount > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Factures en attente de paiement</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Vous avez{' '}
              {summary.invoices.unpaid_amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €{' '}
              de factures non réglées.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NavCard
          to="/espaceclient/devis"
          icon={FileCheck}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          hoverBorder="hover:border-blue-300"
          title="Devis"
          desc="Consultez et téléchargez vos devis"
          badge={summary?.quotes.pending ? `${summary.quotes.pending} en attente` : undefined}
          badgeColor="bg-blue-50 text-blue-700"
        />
        <NavCard
          to="/espaceclient/factures"
          icon={Receipt}
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
          hoverBorder="hover:border-emerald-300"
          title="Factures"
          desc="Vos factures et paiements"
        />
        <NavCard
          to="/espaceclient/demande"
          icon={ClipboardList}
          iconBg="bg-violet-100"
          iconColor="text-violet-600"
          hoverBorder="hover:border-violet-300"
          title="Demande de projet"
          desc="Soumettez un nouveau projet"
        />
        <NavCard
          to="/espaceclient/projets"
          icon={List}
          iconBg="bg-indigo-100"
          iconColor="text-indigo-600"
          hoverBorder="hover:border-indigo-300"
          title="Mes projets"
          desc="Historique et suivi de vos projets"
          badge={summary?.projects.active ? `${summary.projects.active} en cours` : undefined}
          badgeColor="bg-indigo-50 text-indigo-700"
        />
        <NavCard
          to="/espaceclient/planning"
          icon={CalendarDays}
          iconBg="bg-pink-100"
          iconColor="text-pink-600"
          hoverBorder="hover:border-pink-300"
          title="Planning"
          desc="Vue calendrier de vos projets"
          badge={summary?.projects.upcoming ? `${summary.projects.upcoming} à venir` : undefined}
          badgeColor="bg-pink-50 text-pink-700"
        />
      </div>
    </div>
  );
};

const ClientPortalHome: React.FC = () => (
  <ClientPortalLayout>
    {(user) => <HomeContent user={user} />}
  </ClientPortalLayout>
);

export default ClientPortalHome;
