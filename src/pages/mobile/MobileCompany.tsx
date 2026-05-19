import React from 'react';
import MobileLayout from './MobileLayout';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { AUTO_ENTREPRENEUR_TVA_NOTE, isAutoEntrepreneurMode } from '../../utils/accountingMode';

const MobileCompany: React.FC = () => {
  const { settings, loading } = useCompanySettings();
  const autoEntrepreneurMode = isAutoEntrepreneurMode(settings);

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Entreprise</h1>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Infos globales</div>
              <div className="grid gap-2 text-sm text-gray-600 dark:text-gray-300">
                <div>Nom commercial : <span className="text-gray-900 dark:text-white">{settings?.name || '—'}</span></div>
                <div>Raison sociale : <span className="text-gray-900 dark:text-white">{settings?.legal_name || '—'}</span></div>
                <div>SIREN : <span className="text-gray-900 dark:text-white">{settings?.siren || '—'}</span></div>
                <div>SIRET : <span className="text-gray-900 dark:text-white">{settings?.siret || '—'}</span></div>
                <div>Code NAF : <span className="text-gray-900 dark:text-white">{settings?.naf || '—'}</span></div>
                <div>Mode comptable : <span className="text-gray-900 dark:text-white">{autoEntrepreneurMode ? 'Auto-entrepreneur (TTC)' : 'Standard'}</span></div>
                <div>TVA : <span className="text-gray-900 dark:text-white">{autoEntrepreneurMode ? AUTO_ENTREPRENEUR_TVA_NOTE : (settings?.vat || '—')}</span></div>
                <div>Capital : <span className="text-gray-900 dark:text-white">{settings?.capital || '—'}</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Contact</div>
              <div className="grid gap-2 text-sm text-gray-600 dark:text-gray-300">
                <div>Email : <span className="text-gray-900 dark:text-white">{settings?.email || '—'}</span></div>
                <div>Téléphone : <span className="text-gray-900 dark:text-white">{settings?.phone || '—'}</span></div>
                <div>Adresse :</div>
                <div className="text-gray-900 dark:text-white whitespace-pre-line">{settings?.address || '—'}</div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">RIB (à venir)</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                L&apos;ajout du RIB sera disponible prochainement.
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default MobileCompany;
