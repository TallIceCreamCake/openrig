import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, Truck, Car, Search } from 'lucide-react';
import { useVehicles } from '../hooks/useVehicles';
import VehicleCreateWizard from '../components/vehicles/VehicleCreateWizard';
import VehicleTable from '../components/vehicles/VehicleTable';
import DeliveryOffersPanel from '../components/vehicles/DeliveryOffersPanel';
import { StepTransition } from '../components/ui-kit';

const VehiclesPage: React.FC = () => {
  const { vehicles, loading, addVehicle, deleteVehiclesBulk } = useVehicles();
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'vehicles' | 'offers'>(() => {
    const t = searchParams.get('tab');
    return t === 'offers' ? 'offers' : 'vehicles';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);
  const [offerCreateSignal, setOfferCreateSignal] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter(v => v.name.toLowerCase().includes(q) || v.license_plate.toLowerCase().includes(q));
  }, [vehicles, query]);

  if (loading && activeTab === 'vehicles') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">Véhicules</h1>
          {activeTab === 'vehicles' && !showForm && (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher (nom/plaque)"
                className="pl-9 pr-8 py-2 w-full rounded-md border border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
        {activeTab === 'vehicles' ? (
          !showForm ? (
            <button onClick={() => setShowForm(true)} className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="h-5 w-5 mr-2" /> Nouveau véhicule
            </button>
          ) : (
            <button onClick={() => setShowForm(false)} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" aria-label="Fermer"><X className="h-5 w-5" /></button>
          )
        ) : (
          <button
            onClick={() => setOfferCreateSignal((prev) => prev + 1)}
            className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" /> Nouvelle offre
          </button>
        )}
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          <button
            type="button"
            onClick={() => setActiveTab('vehicles')}
            className={`py-3 px-1 border-b-2 text-sm font-medium inline-flex items-center gap-2 ${
              activeTab === 'vehicles' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Car className="h-4 w-4" />
            Véhicules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('offers')}
            className={`py-3 px-1 border-b-2 text-sm font-medium inline-flex items-center gap-2 ${
              activeTab === 'offers' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Truck className="h-4 w-4" />
            Offre et livraison
          </button>
        </nav>
      </div>

      <StepTransition stepKey={activeTab} className="space-y-6">
        {activeTab === 'vehicles' ? (
          showForm ? (
            <VehicleCreateWizard onSubmit={async (data) => { await addVehicle(data); setShowForm(false); }} onCancel={() => setShowForm(false)} />
          ) : (
            <VehicleTable
              vehicles={filtered}
              onBulkDelete={deleteVehiclesBulk}
            />
          )
        ) : (
          <DeliveryOffersPanel createSignal={offerCreateSignal} />
        )}
      </StepTransition>
    </div>
  );
};

export default VehiclesPage;
