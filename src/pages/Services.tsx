import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { StepTransition } from '../components/ui-kit';
import { useServices } from '../hooks/useServices';
import ServiceFormModal from '../components/services/ServiceFormModal';
import ServiceTable from '../components/services/ServiceTable';

const ServicesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'insurance' | 'other'>(() => {
    const t = searchParams.get('tab');
    return t === 'other' ? 'other' : 'insurance';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState<'insurance' | 'other'>('insurance');
  // Open the create form when arriving via a quick-action shortcut
  // (/services?new=other or ?new=insurance). Read once on mount before the tab
  // effect above rewrites the query string.
  useEffect(() => {
    const requested = searchParams.get('new');
    if (requested === 'other' || requested === 'insurance') {
      setActiveTab(requested);
      setCreateCategory(requested);
      setIsCreateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { services, loading, createService, deleteService, deleteServicesBulk } = useServices();
  const insuranceServices = useMemo(
    () => services.filter((service) => service.category === 'insurance'),
    [services]
  );
  const otherServices = useMemo(
    () => services.filter((service) => service.category === 'other'),
    [services]
  );

  const openCreate = (category: 'insurance' | 'other') => {
    setCreateCategory(category);
    setIsCreateOpen(true);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Services</h1>
        </div>
        <button
          onClick={() => openCreate(activeTab)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          {activeTab === 'insurance' ? 'Créer un service assurance' : 'Créer un service autre'}
        </button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          <button
            type="button"
            onClick={() => setActiveTab('insurance')}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'insurance'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Assurance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('other')}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'other'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Autre
          </button>
        </nav>
      </div>

      <StepTransition stepKey={activeTab} className="space-y-6">
        {activeTab === 'insurance' ? (
          <div className="space-y-4">
            <ServiceTable
              category="insurance"
              services={insuranceServices}
              onDelete={deleteService}
              onBulkDelete={deleteServicesBulk}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <ServiceTable
              category="other"
              services={otherServices}
              onDelete={deleteService}
              onBulkDelete={deleteServicesBulk}
            />
          </div>
        )}
      </StepTransition>

      <ServiceFormModal
        open={isCreateOpen}
        category={createCategory}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={createService}
      />
    </div>
  );
};

export default ServicesPage;
