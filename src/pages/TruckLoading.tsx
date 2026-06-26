import React from 'react';
import { Link } from 'react-router-dom';
import { Truck, Settings as SettingsIcon } from 'lucide-react';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { isFeatureEnabled } from '../utils/features';
import FlightCaseManager from '../components/truckloading/FlightCaseManager';

/**
 * Chargement camion (TruckPacker) — toggleable module.
 *
 * Scaffold only: the loading/packing system (truck profiles, item dimensions &
 * weights, 2D/3D placement, load plan per project) is built in a later step.
 * Gated by the `truck_loading` feature flag, like the personnel chat module.
 */
const TruckLoadingPage: React.FC = () => {
  const { settings: companySettings, loading, error } = useCompanySettings();

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Chargement camion</h1>
          <p className="text-sm text-gray-600 mt-1">Chargement des paramètres…</p>
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
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Chargement camion</h1>
          <p className="text-sm text-gray-600 mt-1">Impossible de charger les paramètres.</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 text-sm text-red-600">
          Impossible de récupérer les paramètres de l'entreprise. Veuillez réessayer plus tard.
        </div>
      </div>
    );
  }

  const enabled = isFeatureEnabled(companySettings, 'truck_loading', false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Truck className="h-6 w-6 text-orange-600" /> Chargement camion
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Planifiez et optimisez le calage du matériel dans vos véhicules pour chaque projet.
        </p>
      </div>

      {!enabled ? (
        <div className="bg-white rounded-lg shadow p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-orange-50 text-orange-600">
            <Truck className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">Module désactivé</h2>
            <p className="text-sm text-gray-500">
              Activez le module « Chargement camion » dans les paramètres d'entreprise pour planifier le calage de vos véhicules.
            </p>
          </div>
          <Link
            to="/company"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-orange-600 text-white text-sm font-medium hover:bg-orange-700"
          >
            <SettingsIcon className="h-4 w-4" />
            Ouvrir les paramètres d'entreprise
          </Link>
        </div>
      ) : (
        <FlightCaseManager />
      )}
    </div>
  );
};

export default TruckLoadingPage;
