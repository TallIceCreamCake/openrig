import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { ServiceCategory, ServiceRecord, ServiceStatus } from '../../types/service';
import { ServiceCreatePayload } from '../../hooks/useServices';
import { useEquipmentCategories } from '../../hooks/useEquipmentCategories';

type ServiceFormModalProps = {
  open: boolean;
  category: ServiceCategory;
  initialValues?: Partial<ServiceRecord>;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (payload: ServiceCreatePayload) => Promise<void> | void;
};

const labelStyles = 'block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide';
const inputStyles = 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const parseAmount = (value: string) => {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const statusOptions: Array<{ value: ServiceStatus; label: string }> = [
  { value: 'active', label: 'Actif' },
  { value: 'pending', label: 'En attente' },
  { value: 'expired', label: 'Expiré' },
  { value: 'cancelled', label: 'Annulé' },
];

const coverageOptions = [
  'Responsabilite civile',
  'Materiel',
  'Transport',
  'Vol',
  'Incendie',
  'Bris accidentel',
  'Assistance',
  'Dommages tiers',
];

const ServiceFormModal: React.FC<ServiceFormModalProps> = ({
  open,
  category,
  initialValues,
  submitLabel,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [amount, setAmount] = useState('');
  const [costPerPerson, setCostPerPerson] = useState('');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<ServiceStatus>('active');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedCoverages, setSelectedCoverages] = useState<string[]>([]);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const coverageRef = useRef<HTMLDivElement | null>(null);
  const [amountError, setAmountError] = useState('');
  const [costError, setCostError] = useState('');
  const [priceError, setPriceError] = useState('');
  const [saving, setSaving] = useState(false);

  const { categories } = useEquipmentCategories();
  const isInsurance = category === 'insurance';
  const isOther = category === 'other';
  const isEditing = Boolean(initialValues);
  const modalTitle = useMemo(() => {
    if (isInsurance) {
      return isEditing ? "Modifier l'assurance" : "Creer un service d'assurance";
    }
    if (isOther) {
      return isEditing ? 'Modifier le service' : 'Creer un service autre';
    }
    return isEditing ? 'Modifier le service personnel' : 'Creer un service personnel';
  }, [isInsurance, isOther, isEditing]);
  const submitText = submitLabel || (isEditing ? 'Enregistrer' : 'Creer le service');
  const savingText = isEditing ? 'Enregistrement...' : 'Creation...';
  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === categoryId) || null,
    [categories, categoryId]
  );
  const availableSubcategories = selectedCategory?.subcategories || [];

  useEffect(() => {
    if (!open) return;
    if (initialValues) {
      setTitle(initialValues.title || '');
      setProvider(initialValues.provider || '');
      setStartDate(initialValues.start_date || '');
      setEndDate(initialValues.end_date || '');
      setAmount(initialValues.amount_per_day != null ? String(initialValues.amount_per_day) : '');
      setCostPerPerson(initialValues.cost_per_person != null ? String(initialValues.cost_per_person) : '');
      setPrice(initialValues.price != null ? String(initialValues.price) : '');
      setStatus((initialValues.status as ServiceStatus) || 'active');
      setNotes(initialValues.notes || '');
      setCategoryId(initialValues.category_id || '');
      setSubcategoryId(initialValues.subcategory_id || '');
      setSelectedCoverages(initialValues.coverage || []);
    } else {
      setTitle('');
      setProvider('');
      setStartDate('');
      setEndDate('');
      setAmount('');
      setCostPerPerson('');
      setPrice('');
      setStatus('active');
      setNotes('');
      setCategoryId('');
      setSubcategoryId('');
      setSelectedCoverages([]);
    }
    setFile(null);
    setCoverageOpen(false);
    setAmountError('');
    setCostError('');
    setPriceError('');
    setSaving(false);
  }, [open, category, initialValues]);

  useEffect(() => {
    if (!coverageOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!coverageRef.current) return;
      if (!coverageRef.current.contains(event.target as Node)) {
        setCoverageOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [coverageOpen]);

  useEffect(() => {
    if (!open || !isOther) return;
    if (!categoryId) {
      if (subcategoryId) setSubcategoryId('');
      return;
    }
    const selectedCategory = categories.find((cat) => cat.id === categoryId);
    if (!selectedCategory) {
      if (subcategoryId) setSubcategoryId('');
      return;
    }
    if (subcategoryId && !selectedCategory.subcategories.some((sub) => sub.id === subcategoryId)) {
      setSubcategoryId('');
    }
  }, [open, isOther, categoryId, subcategoryId, categories]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAmountError('');
    setCostError('');
    setPriceError('');
    const parsedAmount = isInsurance ? parseAmount(amount) : null;
    if (isInsurance && amount && parsedAmount == null) {
      setAmountError('Saisissez un montant valide.');
      return;
    }
    const parsedCost = category === 'personnel' ? parseAmount(costPerPerson) : null;
    if (category === 'personnel' && parsedCost == null) {
      setCostError('Saisissez un cout par personne valide.');
      return;
    }
    const parsedPrice = isOther ? parseAmount(price) : null;
    if (isOther && parsedPrice == null) {
      setPriceError('Saisissez un prix valide.');
      return;
    }

    setSaving(true);
    try {
      let filePayload: Partial<ServiceCreatePayload> = {};
      if (isInsurance && file) {
        const dataUrl = await readFileAsDataUrl(file);
        filePayload = {
          proof_file_url: dataUrl,
          proof_file_name: file.name,
          proof_file_type: file.type || null,
          proof_file_size: file.size || null,
        };
      }

      const basePayload: ServiceCreatePayload = {
        category,
        title: title.trim(),
        notes: notes.trim() || null,
      };

      const payload: ServiceCreatePayload = isInsurance
        ? {
            ...basePayload,
            provider: provider.trim() || null,
            coverage: selectedCoverages.length ? selectedCoverages : null,
            start_date: startDate || null,
            end_date: endDate || null,
            amount_per_day: parsedAmount,
            status,
            ...filePayload,
          }
        : isOther
          ? {
              ...basePayload,
              price: parsedPrice,
              category_id: categoryId || null,
              subcategory_id: subcategoryId || null,
            }
          : {
              ...basePayload,
              cost_per_person: parsedCost,
            };

      await onSubmit(payload);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <span className="text-lg font-medium text-gray-900">{modalTitle}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form id="service-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className={labelStyles}>Nom du service</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputStyles}
              placeholder={isInsurance ? "Assurance flotte annuelle" : (isOther ? "Service additionnel" : "Service personnel")}
              required
            />
          </div>

          {isInsurance ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelStyles}>Assureur</label>
                <input
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                  className={inputStyles}
                  placeholder="AXA, Generali..."
                />
              </div>
              <div>
                <label className={labelStyles}>Statut</label>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ServiceStatus)}
                  className={inputStyles}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : isOther ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelStyles}>Type</label>
                <select
                  value={categoryId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setCategoryId(nextId);
                    if (!nextId) {
                      setSubcategoryId('');
                      return;
                    }
                    const nextCategory = categories.find((cat) => cat.id === nextId);
                    if (subcategoryId && !nextCategory?.subcategories.some((sub) => sub.id === subcategoryId)) {
                      setSubcategoryId('');
                    }
                  }}
                  className={inputStyles}
                >
                  <option value="">Aucun type</option>
                  {categories.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelStyles}>Sous-type</label>
                <select
                  value={subcategoryId}
                  onChange={(event) => setSubcategoryId(event.target.value)}
                  className={inputStyles}
                  disabled={!categoryId || availableSubcategories.length === 0}
                >
                  <option value="">Aucun sous-type</option>
                  {availableSubcategories.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className={labelStyles}>Cout par personne (EUR)</label>
              <input
                value={costPerPerson}
                onChange={(event) => setCostPerPerson(event.target.value)}
                className={inputStyles}
                placeholder="0,00"
                required
              />
              {costError && <div className="text-xs text-red-600 mt-1">{costError}</div>}
            </div>
          )}

          {isOther && (
            <div>
              <label className={labelStyles}>Prix (EUR)</label>
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className={inputStyles}
                placeholder="0,00"
                required
              />
              {priceError && <div className="text-xs text-red-600 mt-1">{priceError}</div>}
            </div>
          )}

          {isInsurance && (
            <div ref={coverageRef} className="relative">
              <label className={labelStyles}>Couvertures</label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setCoverageOpen((prev) => !prev)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setCoverageOpen((prev) => !prev);
                  }
                }}
                className={`${inputStyles} flex flex-wrap gap-2 min-h-[44px] items-center text-left cursor-pointer`}
              >
                {selectedCoverages.length === 0 ? (
                  <span className="text-gray-400 text-sm">Choisir des couvertures</span>
                ) : (
                  selectedCoverages.map((item) => (
                    <span key={item} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                      {item}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedCoverages((prev) => prev.filter((value) => value !== item));
                        }}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label={`Supprimer ${item}`}
                      >
                        x
                      </button>
                    </span>
                  ))
                )}
              </div>
              {coverageOpen && (
                <div className="absolute z-20 mt-2 w-full rounded-md border border-gray-200 bg-white shadow-lg p-3">
                  <div className="flex flex-wrap gap-2">
                    {coverageOptions.map((option) => {
                      const selected = selectedCoverages.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setSelectedCoverages((prev) => (
                              prev.includes(option)
                                ? prev.filter((value) => value !== option)
                                : [...prev, option]
                            ));
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs border ${
                            selected
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {isInsurance && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelStyles}>Debut</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className={inputStyles}
                />
              </div>
              <div>
                <label className={labelStyles}>Echeance</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className={inputStyles}
                />
              </div>
              <div>
                <label className={labelStyles}>Montant/jour (EUR)</label>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className={inputStyles}
                  placeholder="0,00"
                />
                {amountError && <div className="text-xs text-red-600 mt-1">{amountError}</div>}
              </div>
            </div>
          )}

          {isInsurance && (
            <div>
              <label className={labelStyles}>Justificatif d'assurance</label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className={inputStyles}
              />
              {file && (
                <div className="text-xs text-gray-500 mt-1">{file.name}</div>
              )}
            </div>
          )}

          <div>
            <label className={labelStyles}>{isOther ? 'Description' : 'Notes'}</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${inputStyles} min-h-[80px]`}
              placeholder={isOther ? 'Description du service' : 'Informations complémentaires'}
            />
          </div>
        </form>
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Annuler</button>
            <button
              type="submit"
              form="service-form"
              disabled={saving}
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? savingText : submitText}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ServiceFormModal;
