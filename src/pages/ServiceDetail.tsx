import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Pencil } from 'lucide-react';
import { useServices } from '../hooks/useServices';
import { ServiceStatus } from '../types/service';
import ServiceFormModal from '../components/services/ServiceFormModal';
import { useEquipmentCategories } from '../hooks/useEquipmentCategories';
import { StatusBadge, type BadgeTone } from '../components/ui-kit';

const statusMeta: Record<ServiceStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Actif', tone: 'emerald' },
  pending: { label: 'En attente', tone: 'amber' },
  expired: { label: 'Expire', tone: 'slate' },
  cancelled: { label: 'Annule', tone: 'rose' },
};

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('fr-FR');
};

const formatDateRange = (start: string | null, end: string | null) => {
  if (!start && !end) return '-';
  if (start && end) return `${formatDate(start)} -> ${formatDate(end)}`;
  if (start) return `Des ${formatDate(start)}`;
  return `Jusqu'au ${formatDate(end)}`;
};

const ServiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { services, loading, updateService } = useServices();
  const { categories } = useEquipmentCategories();
  const [editOpen, setEditOpen] = useState(false);

  const service = useMemo(
    () => services.find((entry) => entry.id === id),
    [services, id]
  );

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }),
    []
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat.name])),
    [categories]
  );
  const subcategoryMap = useMemo(
    () => new Map(categories.flatMap((cat) => cat.subcategories.map((sub) => [sub.id, sub.name]))),
    [categories]
  );

  if (loading && !service) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/services')}
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
          </button>
          <h1 className="text-xl font-semibold">Service introuvable</h1>
        </div>
        <div className="bg-white rounded-lg shadow p-6">Aucune donnee a afficher.</div>
      </div>
    );
  }

  const isInsurance = service.category === 'insurance';
  const isOther = service.category === 'other';
  const statusBadge = statusMeta[service.status as ServiceStatus] || {
    label: service.status || '-',
    tone: 'slate' as BadgeTone,
  };
  const coverages = service.coverage || [];
  const typeLabel = service.category_id ? (categoryMap.get(service.category_id) || '-') : '-';
  const subtypeLabel = service.subcategory_id ? (subcategoryMap.get(service.subcategory_id) || '-') : '-';

  const renderValue = (value: string | null | undefined) => value && value.length > 0 ? value : '-';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to="/services"
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Services
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{service.title}</h1>
          <StatusBadge tone="gray" className="ml-2">
            {isInsurance ? 'Assurance' : (isOther ? 'Autre' : 'Personnel')}
          </StatusBadge>
        </div>
        <button
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <Pencil className="h-4 w-4 mr-2" />
          Editer
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-medium">Details</h2>
            {isInsurance ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                <div>
                  <div className="text-xs uppercase text-gray-500">Assureur</div>
                  <div className="font-medium text-gray-900">{renderValue(service.provider)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Validite</div>
                  <div className="font-medium text-gray-900">{formatDateRange(service.start_date, service.end_date)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Montant/jour</div>
                  <div className="font-medium text-gray-900">
                    {service.amount_per_day == null ? '-' : currencyFormatter.format(service.amount_per_day)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Statut</div>
                  <div>
                    <StatusBadge tone={statusBadge.tone}>
                      {statusBadge.label}
                    </StatusBadge>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs uppercase text-gray-500">Couvertures</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {coverages.length === 0 ? (
                      <span className="text-gray-500">-</span>
                    ) : (
                      coverages.map((item) => (
                        <StatusBadge key={item} tone="gray">
                          {item}
                        </StatusBadge>
                      ))
                    )}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs uppercase text-gray-500">Justificatif</div>
                  {service.proof_file_url ? (
                    <a
                      href={service.proof_file_url}
                      download={service.proof_file_name || undefined}
                      className="mt-2 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                    >
                      <FileText className="h-4 w-4" />
                      {service.proof_file_name || 'Justificatif'}
                    </a>
                  ) : (
                    <div className="text-gray-500">-</div>
                  )}
                </div>
              </div>
            ) : isOther ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                <div>
                  <div className="text-xs uppercase text-gray-500">Type</div>
                  <div className="font-medium text-gray-900">{typeLabel}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Sous-type</div>
                  <div className="font-medium text-gray-900">{subtypeLabel}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Prix</div>
                  <div className="font-medium text-gray-900">
                    {service.price == null ? '-' : currencyFormatter.format(service.price)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                <div>
                  <div className="text-xs uppercase text-gray-500">Cout / personne</div>
                  <div className="font-medium text-gray-900">
                    {service.cost_per_person == null ? '-' : currencyFormatter.format(service.cost_per_person)}
                  </div>
                </div>
              </div>
            )}
            <div>
              <div className="text-xs uppercase text-gray-500">{isOther ? 'Description' : 'Notes'}</div>
              <div className="mt-1 text-sm text-gray-700">{service.notes || '-'}</div>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-3">Infos</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <div><span className="text-gray-500">Cree le: </span>{new Date(service.created_at).toLocaleString('fr-FR')}</div>
              <div><span className="text-gray-500">ID: </span>{service.id}</div>
            </div>
          </div>
        </div>
      </div>

      <ServiceFormModal
        open={editOpen}
        category={service.category}
        initialValues={service}
        submitLabel="Enregistrer"
        onClose={() => setEditOpen(false)}
        onSubmit={(payload) => updateService(service.id, payload)}
      />
    </div>
  );
};

export default ServiceDetail;
