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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

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

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    visibleClients.forEach((c) => (c.tags || []).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [visibleClients]);

  const filtered = useMemo(() => {
    let list = visibleClients;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((client) => (
        (client.name || '').toLowerCase().includes(q)
        || (client.email || '').toLowerCase().includes(q)
        || (client.phone || '').toLowerCase().includes(q)
      ));
    }
    if (selectedTags.length > 0) {
      list = list.filter((client) =>
        selectedTags.some((tag) => (client.tags || []).includes(tag))
      );
    }
    return list;
  }, [visibleClients, query, selectedTags]);

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
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm bg-white hover:bg-gray-50 transition-colors ${
                    selectedTags.length > 0
                      ? 'border-violet-400 text-violet-700'
                      : 'border-gray-300 text-gray-700'
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  Filtres
                  {selectedTags.length > 0 && (
                    <span className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-semibold text-white">
                      {selectedTags.length}
                    </span>
                  )}
                </button>

                {showFilters && (
                  <div className="absolute z-20 mt-2 w-80 right-0 bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">Filtres</div>
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
                        <div className="text-xs font-medium text-gray-500 mb-2">Étiquettes</div>
                        {allTags.length === 0 ? (
                          <p className="text-xs text-gray-400">Aucune étiquette définie sur ces clients.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {allTags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => setSelectedTags((prev) =>
                                  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                                )}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                                  selectedTags.includes(tag)
                                    ? 'bg-violet-600 text-white border-violet-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-violet-300 hover:text-violet-600'
                                }`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedTags.length > 0 && (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setSelectedTags([])}
                            className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
                          >
                            Réinitialiser
                          </button>
                        </div>
                      )}
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
          <div>
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
                onCancel={() => setShowForm(false)}
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
