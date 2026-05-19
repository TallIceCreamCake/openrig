import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AlertTriangle, Calendar as CalendarIcon } from 'lucide-react';
import { Rental } from '../../types/rental';
import toast from 'react-hot-toast';
import { AddressSearchInput, ColorPickerButton, Field, Input, SearchableSelect, Select, Text, Textarea } from '../ui-kit';

interface Props {
  rental: Rental;
  clients: Array<{ id: string; name: string }>;
  onSubmit: (updates: Partial<Rental>) => Promise<void> | void;
  formRef?: React.Ref<HTMLFormElement>;
}

const RentalGeneralForm: React.FC<Props> = ({ rental, clients, onSubmit, formRef }) => {
  const [saving, setSaving] = useState(false);
  const [locationValue, setLocationValue] = useState(rental.location || '');

  const toDatetimeLocal = (s?: string) => {
    if (!s) return '' as any;
    try {
      return new Date(s).toISOString().slice(0, 16);
    } catch {
      return s as any;
    }
  };

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<Partial<Rental>>({
    defaultValues: {
      type: rental.type,
      client_id: rental.client_id,
      start_date: toDatetimeLocal(rental.start_date) as any,
      end_date: toDatetimeLocal(rental.end_date) as any,
      usage_start_date: toDatetimeLocal(rental.usage_start_date ?? undefined) as any,
      usage_end_date: toDatetimeLocal(rental.usage_end_date ?? undefined) as any,
      title: rental.title || '',
      description: rental.description,
      notes: rental.notes || '',
      discount_type: rental.discount_type,
      discount_value: rental.discount_value,
      color: rental.color,
    },
  });

  // Sync locationValue when rental changes
  useEffect(() => {
    setLocationValue(rental.location || '');
  }, [rental.id, rental.location]);

  // Ensure form fields re-sync when rental changes (e.g., after async load)
  useEffect(() => {
    reset({
      type: rental.type,
      client_id: rental.client_id,
      start_date: toDatetimeLocal(rental.start_date) as any,
      end_date: toDatetimeLocal(rental.end_date) as any,
      usage_start_date: toDatetimeLocal(rental.usage_start_date ?? undefined) as any,
      usage_end_date: toDatetimeLocal(rental.usage_end_date ?? undefined) as any,
      title: rental.title || '',
      description: rental.description,
      notes: rental.notes || '',
      discount_type: rental.discount_type,
      discount_value: rental.discount_value,
      color: rental.color,
      generate_invoice: rental.generate_invoice,
    });
  }, [rental.id, reset]);

  const todayMin = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);

  const startMin = useMemo(() => {
    if (!rental.start_date) return todayMin;
    const start = new Date(rental.start_date);
    return start.getTime() < Date.now() ? undefined : todayMin;
  }, [rental.start_date, todayMin]);

  const endMin = useMemo(() => {
    if (!rental.end_date) return todayMin;
    const end = new Date(rental.end_date);
    return end.getTime() < Date.now() ? undefined : todayMin;
  }, [rental.end_date, todayMin]);

  const doSubmit = async (data: Partial<Rental>) => {
    try {
      setSaving(true);
      const usageStart = (data.usage_start_date as unknown as string) || '';
      const usageEnd = (data.usage_end_date as unknown as string) || '';
      await onSubmit({
        ...data,
        location: locationValue,
        usage_start_date: usageStart ? new Date(usageStart).toISOString() : null,
        usage_end_date: usageEnd ? new Date(usageEnd).toISOString() : null,
      });
      toast.success('Informations mises à jour');
    } catch (e) {
      console.error(e);
      toast.error("Impossible d'enregistrer les modifications");
    } finally {
      setSaving(false);
    }
  };

  const discount_type = watch('discount_type');
  const colorValue = watch('color') || '#111827';
  const clientId = watch('client_id') || '';

  const watchedBillingStart = watch('start_date') as unknown as string;
  const watchedBillingEnd = watch('end_date') as unknown as string;
  const watchedUsageStart = watch('usage_start_date') as unknown as string;
  const watchedUsageEnd = watch('usage_end_date') as unknown as string;

  const usageWarning = useMemo(() => {
    if (!watchedUsageStart || !watchedUsageEnd || !watchedBillingStart || !watchedBillingEnd) return null;
    const billingMs = new Date(watchedBillingEnd).getTime() - new Date(watchedBillingStart).getTime();
    const usageMs = new Date(watchedUsageEnd).getTime() - new Date(watchedUsageStart).getTime();
    if (billingMs > 0 && usageMs < billingMs) return true;
    return null;
  }, [watchedBillingStart, watchedBillingEnd, watchedUsageStart, watchedUsageEnd]);

  const clientOptions = useMemo(
    () => clients.map((client) => ({ value: client.id, label: client.name })),
    [clients]
  );

  return (
    <form ref={formRef} onSubmit={handleSubmit(doSubmit)} className="space-y-6" aria-busy={saving}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field label="Type" id="rental-type">
          <Select
            id="rental-type"
            {...register('type', { required: 'Type requis' })}
          >
            <option value="rental">Location</option>
            <option value="service">Prestation</option>
            <option value="sale">Vente</option>
          </Select>
          {errors.type && <Text as="p" className="text-xs text-red-600">{errors.type.message}</Text>}
        </Field>

        <Field label="Client" id="rental-client">
          <SearchableSelect
            id="rental-client"
            value={clientId}
            onChange={(value) => setValue('client_id', value, { shouldDirty: true, shouldValidate: true })}
            options={clientOptions}
            placeholder="Sélectionner un client"
            searchPlaceholder="Rechercher un client"
            emptyLabel="Aucun client trouvé"
          />
          <input type="hidden" {...register('client_id', { required: 'Client requis' })} />
          {errors.client_id && <Text as="p" className="text-xs text-red-600">{errors.client_id.message}</Text>}
        </Field>

        <Field label="Titre" id="rental-title" className="md:col-span-2">
          <Input
            id="rental-title"
            type="text"
            {...register('title', {
              required: 'Titre requis',
              setValueAs: (value: string) => value?.trim() || '',
            })}
            placeholder="Ex: Tournage clip vidéo - Studio Paris"
          />
          {errors.title && <Text as="p" className="text-xs text-red-600">{errors.title.message}</Text>}
        </Field>

        {/* ── Période de Facturation ── */}
        <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Période de Facturation</span>
            <div className="flex-1 h-px bg-blue-100" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Début" id="rental-start">
              <div className="relative">
                <Input
                  id="rental-start"
                  type="datetime-local"
                  min={startMin}
                  {...register('start_date', { required: 'Date requise' })}
                  className="pr-10"
                />
                <CalendarIcon className="pointer-events-none absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </Field>
            <Field label="Fin" id="rental-end">
              <div className="relative">
                <Input
                  id="rental-end"
                  type="datetime-local"
                  min={endMin}
                  {...register('end_date', { required: 'Date requise' })}
                  className="pr-10"
                />
                <CalendarIcon className="pointer-events-none absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </Field>
          </div>
        </div>

        {/* ── Période d'Utilisation ── */}
        <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{"Période d'Utilisation"}</span>
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 italic">Optionnelle</span>
          </div>
          <p className="text-xs text-slate-400 -mt-2">{"Si renseignée, le matériel est réservé sur cette période. Sinon, la période de facturation est utilisée."}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Début" id="rental-usage-start">
              <div className="relative">
                <Input
                  id="rental-usage-start"
                  type="datetime-local"
                  {...register('usage_start_date')}
                  className="pr-10"
                />
                <CalendarIcon className="pointer-events-none absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </Field>
            <Field label="Fin" id="rental-usage-end">
              <div className="relative">
                <Input
                  id="rental-usage-end"
                  type="datetime-local"
                  {...register('usage_end_date')}
                  className="pr-10"
                />
                <CalendarIcon className="pointer-events-none absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </Field>
          </div>
          {usageWarning && (
            <div className="flex items-start gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>{"La période d'utilisation est plus courte que la période de facturation."}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field label="Lieu" id="rental-location">
          <AddressSearchInput
            key={rental.id}
            id="rental-location"
            value={locationValue}
            onChange={(v) => setLocationValue(v)}
            placeholder="Rechercher une adresse…"
            emptyLabel="Aucune adresse trouvée."
            loadingLabel="Chargement…"
          />
        </Field>
        <Field label="Couleur">
          <div className="flex items-center gap-3">
            <ColorPickerButton
              value={colorValue}
              onChange={(value) => setValue('color', value, { shouldDirty: true })}
              size="md"
            />
            <input type="hidden" {...register('color')} />
          </div>
        </Field>
      </div>

      <Field label="Description" id="rental-description">
        <Textarea id="rental-description" rows={3} {...register('description')} />
      </Field>

      <Field label="Info client" id="rental-client-info">
        <Textarea
          id="rental-client-info"
          rows={3}
          {...register('notes')}
          placeholder="Informations utiles sur le client"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Field label="Type de remise" id="rental-discount-type">
          <Select id="rental-discount-type" {...register('discount_type')}>
            <option value="">Aucune</option>
            <option value="percentage">Pourcentage</option>
            <option value="fixed">Montant fixe</option>
          </Select>
        </Field>
        {discount_type && (
          <Field label="Valeur" id="rental-discount-value">
            <Input
              id="rental-discount-value"
              type="number"
              step={discount_type === 'percentage' ? 1 : 0.01}
              min={0}
              {...register('discount_value')}
            />
          </Field>
        )}
      </div>

    </form>
  );
};

export default RentalGeneralForm;
