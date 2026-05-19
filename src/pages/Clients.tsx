import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter, X } from 'lucide-react';
import ClientTable from '../components/clients/ClientTable';
import ClientForm from '../components/clients/ClientForm';
import CompanyClientForm, { type CompanyClientFormPayload } from '../components/clients/CompanyClientForm';
import { useClients } from '../hooks/useClients';
import { Client } from '../types/client';
import { StepTransition } from '../components/ui-kit';

const ClientsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'clients' | 'companies'>(() => {
    const t = searchParams.get('tab');
    return t === 'companies' ? 'companies' : 'clients';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);
  const [showForm, setShowForm] = useState(false);
  const { clients, loading, addClient, deleteClientsBulk, createCompanyClient } = useClients();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const companyClients = useMemo(
    () => clients.filter((client) => client.client_type === 'company'),
    [clients]
  );

  const personClients = useMemo(
    () => clients.filter((client) => client.client_type !== 'company'),
    [clients]
  );

  const visibleClients = useMemo(
    () => (activeTab === 'companies' ? companyClients : personClients),
    [activeTab, companyClients, personClients]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleClients;
    return visibleClients.filter((client) => (
      (client.name || '').toLowerCase().includes(q)
      || (client.company || '').toLowerCase().includes(q)
      || (client.email || '').toLowerCase().includes(q)
      || (client.phone || '').toLowerCase().includes(q)
    ));
  }, [visibleClients, query]);

  const handleSubmit = async (data: Partial<Client>) => {
    await addClient({
      ...data,
      client_type: 'person',
    });
    setShowForm(false);
  };

  const handleCompanySubmit = async (payload: CompanyClientFormPayload) => {
    await createCompanyClient(payload);
    setShowForm(false);
  };

  if (loading) {
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
          <h1 className="text-2xl font-semibold text-gray-900">Clients</h1>
          {!showForm && (
            <>
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-6">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('clients');
                      setShowForm(false);
                    }}
                    className={`py-3 px-1 border-b-2 text-sm font-medium ${
                      activeTab === 'clients' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Clients
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('companies');
                      setShowForm(false);
                    }}
                    className={`py-3 px-1 border-b-2 text-sm font-medium ${
                      activeTab === 'companies' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Entreprises
                  </button>
                </nav>
              </div>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={activeTab === 'companies' ? 'Rechercher une entreprise...' : 'Rechercher un client...'}
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilters((s) => !s)}
                  aria-haspopup="dialog"
                  aria-expanded={showFilters}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50"
                  title="Filtres (démo)"
                >
                  <Filter className="h-4 w-4" />
                  Filtres
                </button>

                {showFilters && (
                  <div className="absolute z-20 mt-2 w-80 right-0 bg-white border border-gray-200 rounded-md shadow-lg">
                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-900">Filtres (démo)</div>
                        <button
                          type="button"
                          className="p-1 text-gray-400 hover:text-gray-600"
                          aria-label="Fermer"
                          onClick={() => setShowFilters(false)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">Type de client</div>
                        <select disabled className="block w-full rounded-md border-gray-300 text-sm bg-gray-50 text-gray-500">
                          <option>— Sélection (démo) —</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">Ville</div>
                        <input disabled placeholder="Ex: Paris" className="w-full rounded-md border-gray-300 text-sm bg-gray-50" />
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button disabled className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-500">Réinitialiser</button>
                        <button disabled className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white">Appliquer</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            {activeTab === 'companies' ? 'Ajouter une entreprise' : 'Ajouter un client'}
          </button>
        </div>
      </div>

      <StepTransition stepKey={showForm ? `${activeTab}-form` : activeTab} className="space-y-6">
        {showForm ? (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium mb-4">
              {activeTab === 'companies' ? 'Ajouter une entreprise' : 'Ajouter un client'}
            </h2>
            {activeTab === 'companies' ? (
              <CompanyClientForm
                clients={personClients}
                onSubmit={handleCompanySubmit}
                onCancel={() => setShowForm(false)}
              />
            ) : (
              <ClientForm
                onSubmit={handleSubmit}
                clientType="person"
                companyOptions={companyClients}
              />
            )}
          </div>
        ) : (
          <ClientTable
            clients={filtered}
            onBulkDelete={deleteClientsBulk}
            mode={activeTab}
          />
        )}
      </StepTransition>
    </div>
  );
};

export default ClientsPage;
