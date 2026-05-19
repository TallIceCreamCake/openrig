import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Plus, Users, X } from 'lucide-react';
import { StepTransition } from '../components/ui-kit';
import { usePersonnel } from '../hooks/usePersonnel';
import { useServices } from '../hooks/useServices';
import PersonnelCreateWizard from '../components/personnel/PersonnelCreateWizard';
import PersonnelGantt from '../components/personnel/PersonnelGantt';
import PersonnelList from '../components/personnel/PersonnelList';
import ServiceFormModal from '../components/services/ServiceFormModal';
import ServiceTable from '../components/services/ServiceTable';
import ConfirmDialog from '../components/common/ConfirmDialog';

const PersonnelPage = () => {
  const [showCreateCrew, setShowCreateCrew] = useState(false);
  const [showCancelCreate, setShowCancelCreate] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'team' | 'services'>(() => {
    const t = searchParams.get('tab');
    return t === 'services' ? 'services' : 'team';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);
  const [isCreateServiceOpen, setIsCreateServiceOpen] = useState(false);
  const { personnel, activities, loading: personnelLoading, deletePersonnelBulk, refetchPersonnel } = usePersonnel();
  const {
    services,
    loading: servicesLoading,
    createService,
    deleteService,
    deleteServicesBulk,
  } = useServices();
  const personnelServices = useMemo(
    () => services.filter((service) => service.category === 'personnel'),
    [services]
  );
  const showCreatePage = showCreateCrew;

  if (personnelLoading || servicesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Gestion Crew</h1>
          {showCreatePage ? (
            <p className="text-sm text-gray-600 mt-1">
              Creation d une fiche crew complete, avec ou sans acces application.
            </p>
          ) : null}
        </div>
        {showCreatePage ? (
          <button
            type="button"
            onClick={() => setShowCancelCreate(true)}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Annuler la creation"
          >
            <X className="h-5 w-5" />
          </button>
        ) : activeTab === 'team' ? (
          <button
            onClick={() => setShowCreateCrew(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nouveau crew
          </button>
        ) : (
          <button
            onClick={() => setIsCreateServiceOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nouveau service personnel
          </button>
        )}
      </div>

      {!showCreatePage && (
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6">
            <button
              type="button"
              onClick={() => setActiveTab('team')}
              className={`py-3 px-1 border-b-2 text-sm font-medium inline-flex items-center gap-2 ${
                activeTab === 'team'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="h-4 w-4" />
              Équipe
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('services')}
              className={`py-3 px-1 border-b-2 text-sm font-medium inline-flex items-center gap-2 ${
                activeTab === 'services'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Briefcase className="h-4 w-4" />
              Services personnel
            </button>
          </nav>
        </div>
      )}

      {showCreatePage ? (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Nouveau crew</h2>
          <PersonnelCreateWizard
            onCancel={() => setShowCancelCreate(true)}
            onCreated={async () => {
              await refetchPersonnel();
              setShowCreateCrew(false);
              setActiveTab('team');
            }}
          />
        </div>
      ) : (
        <StepTransition stepKey={activeTab} className="space-y-6">
          {activeTab === 'team' ? (
            <div className="space-y-6">
              <PersonnelGantt personnel={personnel} activities={activities} />
              <PersonnelList personnel={personnel} onBulkDelete={deletePersonnelBulk} />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Catalogue services personnel</h2>
                <p className="text-sm text-gray-500">
                  Gérez les prestations et coûts liés aux intervenants directement depuis le module crew.
                </p>
              </div>
              <ServiceTable
                category="personnel"
                services={personnelServices}
                onDelete={deleteService}
                onBulkDelete={deleteServicesBulk}
              />
            </div>
          )}
        </StepTransition>
      )}

      <ServiceFormModal
        open={isCreateServiceOpen}
        category="personnel"
        onClose={() => setIsCreateServiceOpen(false)}
        onSubmit={createService}
      />

      <ConfirmDialog
        isOpen={showCancelCreate}
        title="Annuler la creation"
        message="Quitter le formulaire de creation crew ? Les informations en cours seront perdues."
        onCancel={() => setShowCancelCreate(false)}
        onConfirm={() => {
          setShowCancelCreate(false);
          setShowCreateCrew(false);
        }}
        confirmLabel="Quitter"
        cancelLabel="Rester"
      />
    </div>
  );
};

export default PersonnelPage;
