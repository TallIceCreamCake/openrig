import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Edit, FileText, Loader2, Save, Trash2, Upload, Wrench, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import {
  maintenanceDocTypeLabels,
  maintenancePriorityTone,
  maintenancePriorityLabels,
  maintenancePriorityOptions,
  maintenanceStatusTone,
  maintenanceStatusLabels,
  maintenanceStatusOptions,
  maintenanceTypeLabels,
  maintenanceTypeOptions,
} from '../constants/maintenance';
import {
  MaintenanceDocument,
  MaintenanceTask,
  useMaintenance,
} from '../hooks/useMaintenance';
import MaintenanceDocumentModal from '../components/maintenance/MaintenanceDocumentModal';
import { StatusBadge } from '../components/ui-kit';

const toInputDate = (value?: string | null) => {
  if (!value) return '';
  if (value.length >= 10) return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
};

const DEFAULT_EQUIPMENT_IMAGE = 'https://images.unsplash.com/photo-1606857521015-7f9fcf423740?w=600&auto=format&fit=crop';

type EditForm = {
  title: string;
  description: string;
  type: MaintenanceTask['type'];
  priority: MaintenanceTask['priority'];
  status: MaintenanceTask['status'];
  scheduled_date: string;
  completed_date: string;
  cost: string;
  notes: string;
};

type UploadForm = {
  doc_type: MaintenanceDocument['doc_type'];
  title: string;
};

const MaintenanceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    tasks,
    loading,
    updateTaskStatus,
    updateTask,
    deleteTask,
    listDocuments,
    createDocument,
    deleteDocument,
  } = useMaintenance();
  const navigate = useNavigate();

  const [detailTab, setDetailTab] = useState<'overview' | 'documents'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const [documents, setDocuments] = useState<MaintenanceDocument[]>([]);
  const [docLoading, setDocLoading] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadForm>({ doc_type: 'upload', title: '' });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [equipmentImageUrl, setEquipmentImageUrl] = useState<string>(DEFAULT_EQUIPMENT_IMAGE);

  const maintenance = useMemo(
    () => tasks.find((t) => t.id === id) || null,
    [tasks, id]
  );

  useEffect(() => {
    if (!maintenance) {
      setEditForm(null);
      setIsEditing(false);
      return;
    }
    setEditForm({
      title: maintenance.title,
      description: maintenance.description || '',
      type: maintenance.type,
      priority: maintenance.priority,
      status: maintenance.status,
      scheduled_date: toInputDate(maintenance.scheduled_date),
      completed_date: toInputDate(maintenance.completed_date),
      cost: typeof maintenance.cost === 'number' ? maintenance.cost.toString() : '',
      notes: maintenance.notes || '',
    });
    setIsEditing(false);
  }, [maintenance]);

  useEffect(() => {
    let ignore = false;
    const loadImage = async () => {
      if (!maintenance?.equipment_id) {
        setEquipmentImageUrl(DEFAULT_EQUIPMENT_IMAGE);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('equipment')
          .select('image_url')
          .eq('id', maintenance.equipment_id)
          .maybeSingle();
        if (error) throw error;
        if (!ignore) {
          const img = data?.image_url?.trim();
          setEquipmentImageUrl(img && img.length > 0 ? img : DEFAULT_EQUIPMENT_IMAGE);
        }
      } catch (err) {
        console.error(err);
        if (!ignore) setEquipmentImageUrl(DEFAULT_EQUIPMENT_IMAGE);
      }
    };
    loadImage();
    return () => {
      ignore = true;
    };
  }, [maintenance?.equipment_id]);

  useEffect(() => {
    let ignore = false;
    const loadDocs = async () => {
      if (!id) {
        setDocuments([]);
        setActiveDocId(null);
        return;
      }
      try {
        setDocLoading(true);
        const data = await listDocuments(id);
        if (!ignore) {
          setDocuments(data);
          setActiveDocId(data[0]?.id || null);
        }
      } catch (e) {
        console.error(e);
        if (!ignore) toast.error('Impossible de charger les documents');
      } finally {
        if (!ignore) setDocLoading(false);
      }
    };
    loadDocs();
    return () => {
      ignore = true;
    };
  }, [id, listDocuments]);

  const handleSave = async () => {
    if (!id || !editForm) return;
    try {
      setSaving(true);
      await updateTask(id, {
        title: editForm.title,
        description: editForm.description || null,
        type: editForm.type,
        priority: editForm.priority,
        status: editForm.status,
        scheduled_date: editForm.scheduled_date,
        completed_date: editForm.completed_date || null,
        cost: editForm.cost !== '' ? Number(editForm.cost) : null,
        notes: editForm.notes || null,
      });
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      toast.error('Impossible de mettre à jour la maintenance');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await deleteDocument(docId);
      const remaining = documents.filter((d) => d.id !== docId);
      setDocuments(remaining);
      setActiveDocId(remaining[0]?.id || null);
    } catch (e) {
      console.error(e);
      toast.error('Suppression impossible');
    }
  };

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const handleUpload = async () => {
    if (!id || !uploadFile) {
      toast.error('Choisissez un fichier à importer');
      return;
    }
    try {
      setUploading(true);
      const base64 = await fileToDataUrl(uploadFile);
      const doc = await createDocument({
        maintenance_id: id,
        doc_type: uploadForm.doc_type,
        title: uploadForm.title.trim() || uploadFile.name,
        file_url: base64,
      });
      setDocuments((prev) => [doc, ...prev]);
      setActiveDocId(doc.id);
      setUploadFile(null);
      setUploadForm({ doc_type: 'upload', title: '' });
      toast.success('Document importé');
    } catch (e) {
      console.error(e);
      toast.error('Impossible d\'importer le document');
    } finally {
      setUploading(false);
    }
  };

  const handleQuickStatus = async (status: MaintenanceTask['status']) => {
    if (!maintenance) return;
    try {
      await updateTaskStatus(maintenance.id, status);
    } catch (err) {
      console.error(err);
      toast.error('Impossible de mettre à jour le statut');
    }
  };

  const handleDeleteMaintenance = async () => {
    if (!maintenance) return;
    if (!window.confirm(`Supprimer la maintenance "${maintenance.title}" ?`)) return;
    try {
      await deleteTask(maintenance.id);
      navigate('/maintenance');
    } catch (err) {
      console.error(err);
      toast.error('Impossible de supprimer la maintenance');
    }
  };

  if (loading && !maintenance) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!maintenance) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link
            to="/maintenance"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-xl font-semibold">Maintenance introuvable</h1>
        </div>
        <div className="bg-white rounded-lg shadow p-6">Aucune donnée à afficher.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link
            to="/maintenance"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{maintenance.title}</h1>
          <StatusBadge tone={maintenanceStatusTone[maintenance.status]} size="md">
            {maintenanceStatusLabels[maintenance.status]}
          </StatusBadge>
          <StatusBadge tone={maintenancePriorityTone[maintenance.priority]} variant="outline" size="md">
            {maintenancePriorityLabels[maintenance.priority]}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-2">
          {maintenance.status !== 'completed' && maintenance.status !== 'cancelled' && (
            <button
              onClick={() => handleQuickStatus('completed')}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <CheckCircle className="h-4 w-4" /> Terminer
            </button>
          )}
          <button
            onClick={handleDeleteMaintenance}
            className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </button>
          <button
            onClick={() => setIsEditing((prev) => !prev)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            {isEditing ? (
              <>
                <X className="h-4 w-4 mr-2" /> Annuler
              </>
            ) : (
              <>
                <Edit className="h-4 w-4 mr-2" /> Modifier
              </>
            )}
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200 px-4 sm:px-6">
        <nav className="-mb-px flex space-x-6 sm:space-x-8">
          {([
            { id: 'overview', name: "Vue d'ensemble", icon: Wrench },
            { id: 'documents', name: 'Documents', icon: FileText },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setDetailTab(tab.id)}
                className={`${
                  detailTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {detailTab === 'overview' && (
        <div className="bg-gray-100 p-6">
          <div className="flex flex-col lg:flex-row gap-6 items-stretch">
            <div className="flex-1 space-y-6">
              <div className="bg-white rounded-lg p-6 space-y-6">
                <h2 className="text-lg font-medium text-gray-900 border-b border-gray-100 pb-3">Détails</h2>

                {editForm && (
                  <div className="space-y-6 pt-6">
                    {isEditing ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium text-gray-600">Titre</label>
                            <input
                              value={editForm.title}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Type</label>
                            <select
                              value={editForm.type}
                              onChange={(e) => setEditForm({ ...editForm, type: e.target.value as MaintenanceTask['type'] })}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                              {maintenanceTypeOptions.map((opt) => (
                                <option key={opt} value={opt}>{maintenanceTypeLabels[opt]}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Priorité</label>
                            <select
                              value={editForm.priority}
                              onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as MaintenanceTask['priority'] })}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                              {maintenancePriorityOptions.map((opt) => (
                                <option key={opt} value={opt}>{maintenancePriorityLabels[opt]}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Statut</label>
                            <select
                              value={editForm.status}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value as MaintenanceTask['status'] })}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                              {maintenanceStatusOptions.map((opt) => (
                                <option key={opt} value={opt}>{maintenanceStatusLabels[opt]}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium text-gray-600">Date planifiée</label>
                            <input
                              type="date"
                              value={editForm.scheduled_date}
                              onChange={(e) => setEditForm({ ...editForm, scheduled_date: e.target.value })}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Date de fin</label>
                            <input
                              type="date"
                              value={editForm.completed_date}
                              onChange={(e) => setEditForm({ ...editForm, completed_date: e.target.value })}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Coût (EUR)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.cost}
                              onChange={(e) => setEditForm({ ...editForm, cost: e.target.value })}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Description</label>
                          <textarea
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="mt-1 w-full min-h-[90px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Notes internes</label>
                          <textarea
                            value={editForm.notes}
                            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                            className="mt-1 w-full min-h-[90px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Numéros de série concernés</label>
                          {maintenance.serial_numbers.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {maintenance.serial_numbers.map((sn) => (
                                <span key={sn} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                                  {sn}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-gray-500">Aucun numéro de série renseigné</p>
                          )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 pt-2">
                          <button
                            onClick={() => {
                              setIsEditing(false);
                              setEditForm({
                                title: maintenance.title,
                                description: maintenance.description || '',
                                type: maintenance.type,
                                priority: maintenance.priority,
                                status: maintenance.status,
                                scheduled_date: toInputDate(maintenance.scheduled_date),
                                completed_date: toInputDate(maintenance.completed_date),
                                cost: typeof maintenance.cost === 'number' ? maintenance.cost.toString() : '',
                                notes: maintenance.notes || '',
                              });
                            }}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                          >
                            {saving ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sauvegarde…
                              </>
                            ) : (
                              <>
                                <Save className="h-4 w-4 mr-2" /> Sauvegarder
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Type</h4>
                          <p className="mt-1 text-sm font-medium text-gray-900">{maintenanceTypeLabels[maintenance.type]}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Priorité</h4>
                          <p className="mt-1 text-sm font-medium text-gray-900">{maintenancePriorityLabels[maintenance.priority]}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date planifiée</h4>
                          <p className="mt-1 text-sm text-gray-900">{new Date(maintenance.scheduled_date).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date de fin</h4>
                          <p className="mt-1 text-sm text-gray-900">
                            {maintenance.completed_date ? new Date(maintenance.completed_date).toLocaleDateString('fr-FR') : '—'}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Coût</h4>
                          <p className="mt-1 text-sm text-gray-900">
                            {typeof maintenance.cost === 'number' ? `${maintenance.cost.toFixed(2)} €` : '—'}
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Numéros de série</h4>
                          {maintenance.serial_numbers.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {maintenance.serial_numbers.map((sn) => (
                                <span key={sn} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                                  {sn}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-sm text-gray-900">—</p>
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h4>
                          <p className="mt-1 whitespace-pre-line text-sm text-gray-900">
                            {maintenance.notes ? maintenance.notes : '—'}
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</h4>
                          <p className="mt-1 whitespace-pre-line text-sm text-gray-900">
                            {maintenance.description ? maintenance.description : '—'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="lg:w-1/4 lg:min-w-[240px] flex-shrink-0 self-stretch">
              <div className="bg-white rounded-lg p-4 h-full flex flex-col gap-4">
                <div className="w-full aspect-square overflow-hidden rounded-lg bg-gray-200">
                  <img
                    src={equipmentImageUrl}
                    alt={maintenance.equipment_name || 'Matériel'}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="text-sm text-gray-600 space-y-2">
                  <div>
                    <span className="text-gray-500">Matériel : </span>
                    {maintenance.equipment_name || maintenance.equipment_id || '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">Créée le : </span>
                    {new Date(maintenance.created_at).toLocaleString('fr-FR')}
                  </div>
                  <div>
                    <span className="text-gray-500">ID : </span>
                    {maintenance.id}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailTab === 'documents' && (
        <div className="space-y-6 bg-gray-100 p-6">
          <div className="bg-white rounded-lg p-6 space-y-6">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <FileText className="h-5 w-5 text-blue-600" /> Documents
                </h3>
                <button
                  onClick={() => setShowDocModal(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Générer un rapport
                </button>
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                      Liste des documents
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {docLoading ? (
                        <div className="flex items-center justify-center px-4 py-8 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Chargement…
                        </div>
                      ) : documents.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-gray-500">Aucun document</div>
                      ) : (
                        documents.map((doc) => (
                          <button
                            key={doc.id}
                            onClick={() => setActiveDocId(doc.id)}
                            className={`flex w-full flex-col items-start gap-1 border-b border-gray-100 px-4 py-3 text-left transition last:border-b-0 ${
                              activeDocId === doc.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <span className="text-sm font-medium text-gray-900">{doc.title}</span>
                            <span className="text-xs text-gray-500">
                              {maintenanceDocTypeLabels[doc.doc_type]} • {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-dashed border-gray-300 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Upload className="h-4 w-4" /> Importer un document
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Type</label>
                      <select
                        value={uploadForm.doc_type}
                        onChange={(e) => setUploadForm({ ...uploadForm, doc_type: e.target.value as MaintenanceDocument['doc_type'] })}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                      >
                        <option value="upload">Document</option>
                        <option value="facture">Facture</option>
                        <option value="autre">Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Nom du document</label>
                      <input
                        value={uploadForm.title}
                        onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="Ex: Facture maintenance"
                      />
                    </div>
                    <div>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          setUploadFile(file || null);
                          if (file && !uploadForm.title) {
                            setUploadForm({ ...uploadForm, title: file.name.replace(/\.[^.]+$/, '') });
                          }
                        }}
                        className="block w-full text-xs text-gray-500"
                      />
                    </div>
                    <button
                      onClick={handleUpload}
                      disabled={uploading || !uploadFile}
                      className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {uploading ? 'Importer…' : 'Importer'}
                    </button>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">Aperçu</h4>
                    {activeDocId && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteDocument(activeDocId)}
                          className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Supprimer
                        </button>
                        {(() => {
                          const doc = documents.find((d) => d.id === activeDocId);
                          if (!doc) return null;
                          return (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
                            >
                              Ouvrir
                            </a>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex h-96 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
                    {activeDocId ? (
                      (() => {
                        const doc = documents.find((d) => d.id === activeDocId);
                        if (!doc) return <div className="text-sm text-gray-500">Aucun document sélectionné</div>;
                        return (
                          <iframe
                            src={doc.file_url}
                            title={doc.title}
                            className="h-full w-full border-0 rounded-xl"
                          />
                        );
                      })()
                    ) : (
                      <div className="text-sm text-gray-500">Sélectionnez un document pour l'afficher</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
        </div>
      )}

      {maintenance && (
        <MaintenanceDocumentModal
          isOpen={showDocModal}
          onClose={() => setShowDocModal(false)}
          maintenance={maintenance}
          onSaveDocument={async (title, pdfBase64) => {
            try {
              const doc = await createDocument({
                maintenance_id: maintenance.id,
                doc_type: 'rapport',
                title,
                file_url: pdfBase64,
              });
              setDocuments((prev) => [doc, ...prev]);
              setActiveDocId(doc.id);
            } catch (e) {
              console.error(e);
              toast.error('Impossible d\'enregistrer le rapport');
            }
          }}
        />
      )}
    </div>
  );
};

export default MaintenanceDetailPage;
