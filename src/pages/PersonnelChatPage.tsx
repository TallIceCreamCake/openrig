import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Settings as SettingsIcon } from 'lucide-react';
import PersonnelChat from '../components/personnel/PersonnelChat';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { isFeatureEnabled } from '../utils/features';
import { usePersonnel } from '../hooks/usePersonnel';

const PersonnelChatContent: React.FC = () => {
  const { personnel, loading, error } = usePersonnel();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-red-600">{error}</div>}
      <PersonnelChat personnel={personnel} />
    </div>
  );
};

const PersonnelChatPage: React.FC = () => {
  const { settings: companySettings, loading, error } = useCompanySettings();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Chat du personnel</h1>
            <p className="text-sm text-gray-600 mt-1">Chargement des paramètres…</p>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Chat du personnel</h1>
            <p className="text-sm text-gray-600 mt-1">Impossible de charger les paramètres.</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 text-sm text-red-600">
          Impossible de récupérer les paramètres de l'entreprise. Veuillez réessayer plus tard.
        </div>
      </div>
    );
  }

  const chatEnabled = isFeatureEnabled(companySettings, 'personnel_chat', false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Chat du personnel</h1>
          <p className="text-sm text-gray-600 mt-1">
            Coordonnez votre équipe en temps réel et centralisez les échanges internes.
          </p>
        </div>
      </div>

      {!chatEnabled ? (
        <div className="bg-white rounded-lg shadow p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">Module désactivé</h2>
            <p className="text-sm text-gray-500">
              Activez le chat du personnel dans les paramètres d'entreprise pour permettre à votre équipe de discuter ici.
            </p>
          </div>
          <Link
            to="/company"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <SettingsIcon className="h-4 w-4" />
            Ouvrir les paramètres d'entreprise
          </Link>
        </div>
      ) : (
        <PersonnelChatContent />
      )}
    </div>
  );
};

export default PersonnelChatPage;
