import React from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange, CalendarCheck, Plus, Pencil, Trash2, Users, Truck, Package, Search } from 'lucide-react';
import { Rental, RentalItem } from '../../types/rental';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { usePersonnel } from '../../hooks/usePersonnel';
import { useVehicles } from '../../hooks/useVehicles';
import { Button, CalendarMonth, DateField, DateRangeField, Field, Input, Text, Textarea } from '../ui-kit';

type MilestoneRow = {
  id: string;
  rental_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  created_at: string;
  rental_milestone_personnel?: Array<{ personnel_id: string }>;
  rental_milestone_vehicles?: Array<{ vehicle_id: string }>;
  rental_milestone_items?: Array<{ rental_item_id: string }>;
};

type Milestone = {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  personnel_ids: string[];
  vehicle_ids: string[];
  item_ids: string[];
};

type Props = {
  rental: Rental;
  onLog?: (action: string, details?: string, metadata?: Record<string, any> | null) => void;
};

const isSameDay = (a?: string | null, b?: string | null) => {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const toDisplayDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
};

const isBefore = (a: Date, b: Date) => a.getTime() < b.getTime();

const formatDate = (value?: string | null, locale = 'fr-FR') => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsed);
};

const joinLabels = (ids: string[], map: Map<string, string>, fallback: string) =>
  ids.map((id) => map.get(id) || fallback).join(', ');

const colorToRgb = (value?: string | null) => {
  if (!value) return { r: 37, g: 99, b: 235 };
  const hex = value.replace('#', '').trim();
  const normalized = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  if (normalized.length !== 6) return { r: 37, g: 99, b: 235 };
  const int = Number.parseInt(normalized, 16);
  if (Number.isNaN(int)) return { r: 37, g: 99, b: 235 };
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

const toRgba = (rgb: { r: number; g: number; b: number }, alpha: number) =>
  `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

const RentalMilestonesPanel: React.FC<Props> = ({ rental, onLog }) => {
  const { personnel } = usePersonnel();
  const { vehicles } = useVehicles();
  const [milestones, setMilestones] = React.useState<Milestone[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [dateMode, setDateMode] = React.useState<'single' | 'range'>('single');
  const [singleDate, setSingleDate] = React.useState('');
  const [rangeStart, setRangeStart] = React.useState('');
  const [rangeEnd, setRangeEnd] = React.useState('');
  const [selectedPersonnel, setSelectedPersonnel] = React.useState<string[]>([]);
  const [selectedVehicles, setSelectedVehicles] = React.useState<string[]>([]);
  const [selectedItems, setSelectedItems] = React.useState<string[]>([]);
  const [pickerType, setPickerType] = React.useState<'personnel' | 'vehicles' | 'items' | null>(null);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [detailMilestone, setDetailMilestone] = React.useState<Milestone | null>(null);
  const [calendarMonth, setCalendarMonth] = React.useState<Date>(() => startOfMonth(toDisplayDate(rental.start_date) || new Date()));

  const locale = 'fr-FR';

  const personnelLabel = React.useMemo(() => {
    const map = new Map<string, string>();
    personnel.forEach((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Personnel';
      map.set(p.id, name);
    });
    return map;
  }, [personnel]);

  const vehicleLabel = React.useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach((v) => {
      const label = v.license_plate ? `${v.name} · ${v.license_plate}` : v.name;
      map.set(v.id, label);
    });
    return map;
  }, [vehicles]);

  const itemLabel = React.useMemo(() => {
    const map = new Map<string, string>();
    rental.items.forEach((item) => {
      const label = item.is_external
        ? (item.external_name || 'Sous-location')
        : item.equipment_name || 'Matériel';
      map.set(item.id, label);
    });
    return map;
  }, [rental.items]);

  const resetForm = React.useCallback(() => {
    setTitle('');
    setDescription('');
    setDateMode('single');
    setSingleDate('');
    setRangeStart('');
    setRangeEnd('');
    setSelectedPersonnel([]);
    setSelectedVehicles([]);
    setSelectedItems([]);
    setEditingId(null);
    setPickerType(null);
    setPickerSearch('');
  }, []);

  const fetchMilestones = React.useCallback(async () => {
    if (!rental?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rental_milestones')
        .select(`
          id,
          rental_id,
          title,
          description,
          start_at,
          end_at,
          created_at,
          rental_milestone_personnel(personnel_id),
          rental_milestone_vehicles(vehicle_id),
          rental_milestone_items(rental_item_id)
        `)
        .eq('rental_id', rental.id)
        .order('start_at', { ascending: true });
      if (error) throw error;
      const mapped = (data as MilestoneRow[] | null || []).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        start_at: row.start_at,
        end_at: row.end_at,
        personnel_ids: (row.rental_milestone_personnel || []).map((p) => p.personnel_id),
        vehicle_ids: (row.rental_milestone_vehicles || []).map((v) => v.vehicle_id),
        item_ids: (row.rental_milestone_items || []).map((i) => i.rental_item_id),
      }));
      setMilestones(mapped);
    } catch (err) {
      console.error('load milestones', err);
      toast.error('Impossible de charger les dates clés');
    } finally {
      setLoading(false);
    }
  }, [rental?.id]);

  React.useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  React.useEffect(() => {
    setCalendarMonth(startOfMonth(toDisplayDate(rental.start_date) || new Date()));
  }, [rental.id, rental.start_date]);

  React.useEffect(() => {
    if (!showModal) {
      setPickerType(null);
    }
  }, [showModal]);

  const periodStart = React.useMemo(() => toDisplayDate(rental.start_date), [rental.start_date]);
  const periodEnd = React.useMemo(() => toDisplayDate(rental.end_date), [rental.end_date]);

  const normalizedPeriod = React.useMemo(() => {
    if (!periodStart || !periodEnd) return { start: periodStart, end: periodEnd };
    if (isBefore(periodEnd, periodStart)) {
      return { start: periodEnd, end: periodStart };
    }
    return { start: periodStart, end: periodEnd };
  }, [periodEnd, periodStart]);

  const milestoneRanges = React.useMemo(() => {
    return milestones
      .map((milestone) => {
        const start = toDisplayDate(milestone.start_at);
        const end = toDisplayDate(milestone.end_at || milestone.start_at);
        if (!start || !end) return null;
        return { start, end };
      })
      .filter(Boolean) as Array<{ start: Date; end: Date }>;
  }, [milestones]);

  const accentHex = rental.color || '#2563eb';
  const accentRgb = React.useMemo(() => colorToRgb(accentHex), [accentHex]);
  const rangeColor = React.useMemo(() => toRgba(accentRgb, 0.18), [accentRgb]);
  const rangeEdgeColor = accentHex;
  const milestoneColor = React.useMemo(() => toRgba(accentRgb, 0.08), [accentRgb]);

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (milestone: Milestone) => {
    setEditingId(milestone.id);
    setTitle(milestone.title);
    setDescription(milestone.description || '');
    const hasRange = !!milestone.end_at && !isSameDay(milestone.start_at, milestone.end_at);
    setDateMode(hasRange ? 'range' : 'single');
    setSingleDate(milestone.start_at);
    setRangeStart(milestone.start_at);
    setRangeEnd(milestone.end_at || '');
    setSelectedPersonnel(milestone.personnel_ids);
    setSelectedVehicles(milestone.vehicle_ids);
    setSelectedItems(milestone.item_ids);
    setShowModal(true);
  };

  const openDetails = (milestone: Milestone) => {
    setDetailMilestone(milestone);
  };

  const closeDetails = () => {
    setDetailMilestone(null);
  };

  const openPicker = (type: 'personnel' | 'vehicles' | 'items') => {
    setPickerType(type);
    setPickerSearch('');
  };

  const closePicker = () => setPickerType(null);

  const toggleSelection = (value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => (prev.includes(value) ? prev.filter((id) => id !== value) : [...prev, value]));
  };

  const buildDateLabel = (startAt?: string | null, endAt?: string | null) => {
    if (!endAt || isSameDay(startAt, endAt)) {
      return formatDate(startAt, locale);
    }
    return `${formatDate(startAt, locale)} → ${formatDate(endAt, locale)}`;
  };

  const saveMilestone = async () => {
    if (!title.trim()) {
      toast.error('Le titre est requis.');
      return;
    }
    const startAt = dateMode === 'single' ? singleDate : rangeStart;
    const endAt = dateMode === 'single' ? null : rangeEnd;
    if (!startAt || (dateMode === 'range' && !endAt)) {
      toast.error('La date est requise.');
      return;
    }
    setSaving(true);
    try {
      let milestoneId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from('rental_milestones')
          .update({
            title: title.trim(),
            description: description.trim() || null,
            start_at: startAt,
            end_at: endAt,
          })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('rental_milestones')
          .insert([{
            rental_id: rental.id,
            title: title.trim(),
            description: description.trim() || null,
            start_at: startAt,
            end_at: endAt,
          }])
          .select('id')
          .single();
        if (error) throw error;
        milestoneId = data?.id;
      }

      if (!milestoneId) throw new Error('milestone_id_missing');

      const clearTables = ['rental_milestone_personnel', 'rental_milestone_vehicles', 'rental_milestone_items'];
      await Promise.all(clearTables.map((table) => supabase.from(table).delete().eq('milestone_id', milestoneId)));

      if (selectedPersonnel.length > 0) {
        const rows = selectedPersonnel.map((personnel_id) => ({ milestone_id: milestoneId, personnel_id }));
        await supabase.from('rental_milestone_personnel').insert(rows);
      }
      if (selectedVehicles.length > 0) {
        const rows = selectedVehicles.map((vehicle_id) => ({ milestone_id: milestoneId, vehicle_id }));
        await supabase.from('rental_milestone_vehicles').insert(rows);
      }
      if (selectedItems.length > 0) {
        const rows = selectedItems.map((rental_item_id) => ({ milestone_id: milestoneId, rental_item_id }));
        await supabase.from('rental_milestone_items').insert(rows);
      }

      const dateLabel = buildDateLabel(startAt, endAt);
      const action = editingId ? 'milestone_updated' : 'milestone_created';
      onLog?.(action, `${title.trim()} — ${dateLabel}`, {
        milestone_id: milestoneId,
        personnel_ids: selectedPersonnel,
        vehicle_ids: selectedVehicles,
        item_ids: selectedItems,
      });

      toast.success(editingId ? 'Date clé mise à jour' : 'Date clé ajoutée');
      resetForm();
      setShowModal(false);
      await fetchMilestones();
    } catch (err) {
      console.error('save milestone', err);
      toast.error("Impossible d'enregistrer la date clé");
    } finally {
      setSaving(false);
    }
  };

  const deleteMilestone = async (milestone: Milestone) => {
    if (!window.confirm('Supprimer cette date clé ?')) return;
    try {
      const { error } = await supabase.from('rental_milestones').delete().eq('id', milestone.id);
      if (error) throw error;
      setMilestones((prev) => prev.filter((entry) => entry.id !== milestone.id));
      onLog?.('milestone_deleted', milestone.title, { milestone_id: milestone.id });
      toast.success('Date clé supprimée');
    } catch (err) {
      console.error('delete milestone', err);
      toast.error('Impossible de supprimer la date clé');
    }
  };

  if (rental.type === 'sale') {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
        Les dates clés sont disponibles uniquement pour les prestations et locations.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Dates clés &amp; tâches</h3>
          <p className="text-sm text-slate-500">Planifiez les étapes importantes et assignez les ressources.</p>
        </div>
        <Button type="button" onClick={openCreate} className="bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-300">
          <Plus className="h-4 w-4" /> Ajouter une date clé
        </Button>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch">
        <div className="flex-1 min-w-0 rounded-lg bg-white p-6 shadow-sm space-y-4">
          <Text as="h4" variant="subtitle">Liste des dates clés</Text>
          {loading ? (
            <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : milestones.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Aucune date clé pour le moment.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-200">
                {milestones.map((milestone) => {
                  const dateLabel = buildDateLabel(milestone.start_at, milestone.end_at || null);
                  return (
                    <li key={milestone.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() => openDetails(milestone)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          {milestone.end_at ? <CalendarRange className="h-5 w-5" /> : <CalendarCheck className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-base font-semibold text-slate-900">{milestone.title}</h4>
                          <p className="text-sm text-slate-500">{dateLabel}</p>
                          {milestone.description && (
                            <p className="mt-1 truncate text-xs text-slate-500">{milestone.description}</p>
                          )}
                        </div>
                      </button>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                          <Users className="h-3.5 w-3.5" /> {milestone.personnel_ids.length}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                          <Truck className="h-3.5 w-3.5" /> {milestone.vehicle_ids.length}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                          <Package className="h-3.5 w-3.5" /> {milestone.item_ids.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => openDetails(milestone)}
                          className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          Détails
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => openEdit(milestone)}
                          className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          <Pencil className="h-4 w-4" /> Modifier
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => deleteMilestone(milestone)}
                          className="bg-rose-50 text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-4 w-4" /> Supprimer
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <div className="xl:w-[320px] xl:flex-none">
          <CalendarMonth
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            range={{
              start: normalizedPeriod.start || undefined,
              end: normalizedPeriod.end || normalizedPeriod.start || undefined,
              backgroundColor: rangeColor,
              edgeColor: rangeEdgeColor,
              textColor: '#ffffff',
              inRangeTextColor: rangeEdgeColor,
            }}
            markers={milestoneRanges.map((range) => ({
              start: range.start,
              end: range.end,
              backgroundColor: milestoneColor,
              textColor: '#475569',
            }))}
            locale={locale}
          />
        </div>
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setShowModal(false)} />
          <div className="relative w-full max-w-3xl mx-4 rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Modifier la date clé' : 'Nouvelle date clé'}</h3>
                <p className="text-sm text-slate-500">Définissez la période et assignez les ressources.</p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setShowModal(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Titre" id="milestone-title">
                  <Input
                    id="milestone-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ex: Montage, livraison, installation..."
                  />
                </Field>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Type de date</label>
                  <div className="mt-2 inline-flex rounded-lg border border-slate-200 p-1">
                    <button
                      type="button"
                      onClick={() => setDateMode('single')}
                      className={`px-3 py-1 text-sm font-medium rounded-md ${dateMode === 'single' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      Date unique
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateMode('range')}
                      className={`px-3 py-1 text-sm font-medium rounded-md ${dateMode === 'range' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      Période
                    </button>
                  </div>
                </div>
              </div>
              <Field label="Tâches à faire" id="milestone-description">
                <Textarea
                  id="milestone-description"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Liste des actions ou instructions..."
                />
              </Field>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                {dateMode === 'single' ? (
                  <DateField
                    label="Date"
                    value={singleDate}
                    onChange={(value) => setSingleDate(value || '')}
                  />
                ) : (
                  <DateRangeField
                    label="Période"
                    start={rangeStart}
                    end={rangeEnd}
                    onChange={({ start, end }) => {
                      setRangeStart(start || '');
                      setRangeEnd(end || '');
                    }}
                  />
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Personnel</span>
                    <span>{selectedPersonnel.length}</span>
                  </div>
                  <div className="mt-3 min-h-[48px] text-sm text-slate-700">
                    {selectedPersonnel.length === 0
                      ? 'Aucun personnel sélectionné.'
                      : joinLabels(selectedPersonnel, personnelLabel, 'Personnel')}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3 w-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                    onClick={() => openPicker('personnel')}
                  >
                    Gérer le personnel
                  </Button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span className="flex items-center gap-2"><Truck className="h-4 w-4" /> Transport</span>
                    <span>{selectedVehicles.length}</span>
                  </div>
                  <div className="mt-3 min-h-[48px] text-sm text-slate-700">
                    {selectedVehicles.length === 0
                      ? 'Aucun véhicule sélectionné.'
                      : joinLabels(selectedVehicles, vehicleLabel, 'Véhicule')}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3 w-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                    onClick={() => openPicker('vehicles')}
                  >
                    Gérer le transport
                  </Button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span className="flex items-center gap-2"><Package className="h-4 w-4" /> Matériels</span>
                    <span>{selectedItems.length}</span>
                  </div>
                  <div className="mt-3 min-h-[48px] text-sm text-slate-700">
                    {selectedItems.length === 0
                      ? 'Aucun matériel sélectionné.'
                      : joinLabels(selectedItems, itemLabel, 'Matériel')}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3 w-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                    onClick={() => openPicker('items')}
                  >
                    Gérer le matériel
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <Button type="button" variant="secondary" onClick={() => !saving && setShowModal(false)}>
                Annuler
              </Button>
              <Button
                type="button"
                onClick={saveMilestone}
                disabled={saving}
                className="bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-300"
              >
                {editingId ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {pickerType && createPortal((() => {
        const options = pickerType === 'personnel'
          ? personnel.map((person) => ({
              id: person.id,
              label: `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Personnel',
              meta: person.email || '',
            }))
          : pickerType === 'vehicles'
            ? vehicles.map((vehicle) => ({
                id: vehicle.id,
                label: vehicleLabel.get(vehicle.id) || vehicle.name,
                meta: vehicle.license_plate || '',
              }))
            : rental.items.map((item: RentalItem) => ({
                id: item.id,
                label: itemLabel.get(item.id) || item.equipment_name || 'Matériel',
                meta: item.is_external ? 'Sous-location' : item.equipment_type || '',
              }));

        const selectedIds = pickerType === 'personnel'
          ? selectedPersonnel
          : pickerType === 'vehicles'
            ? selectedVehicles
            : selectedItems;

        const handleToggle = (id: string) => {
          if (pickerType === 'personnel') {
            toggleSelection(id, setSelectedPersonnel);
          } else if (pickerType === 'vehicles') {
            toggleSelection(id, setSelectedVehicles);
          } else {
            toggleSelection(id, setSelectedItems);
          }
        };

        const handleClear = () => {
          if (pickerType === 'personnel') {
            setSelectedPersonnel([]);
          } else if (pickerType === 'vehicles') {
            setSelectedVehicles([]);
          } else {
            setSelectedItems([]);
          }
        };

        const search = pickerSearch.trim().toLowerCase();
        const filtered = search.length === 0
          ? options
          : options.filter((option) => {
              const haystack = `${option.label} ${option.meta}`.toLowerCase();
              return haystack.includes(search);
            });

        const title = pickerType === 'personnel'
          ? 'Personnel'
          : pickerType === 'vehicles'
            ? 'Transport'
            : 'Matériel';

        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={closePicker} />
            <div className="relative w-full max-w-xl mx-4 rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm text-slate-500">Sélectionnez les éléments associés à cette date clé.</p>
                </div>
                <button
                  type="button"
                  onClick={closePicker}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={pickerSearch}
                      onChange={(event) => setPickerSearch(event.target.value)}
                      placeholder="Rechercher..."
                      className="pl-9"
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={handleClear}>
                    Tout désélectionner
                  </Button>
                </div>
                <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
                  {filtered.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-500">Aucun résultat.</div>
                  ) : (
                    <ul className="divide-y divide-slate-200">
                      {filtered.map((option) => (
                        <li key={option.id} className="px-4 py-3">
                          <label className="flex items-start gap-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(option.id)}
                              onChange={() => handleToggle(option.id)}
                              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>
                              <span className="block font-medium text-slate-900">{option.label}</span>
                              {option.meta && <span className="text-xs text-slate-500">{option.meta}</span>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <Button type="button" variant="secondary" onClick={closePicker}>
                  Fermer
                </Button>
                <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-300" onClick={closePicker}>
                  Terminer
                </Button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {detailMilestone && createPortal((
        <div className="fixed inset-0 z-[105] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetails} />
          <div className="relative w-full max-w-2xl mx-4 rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{detailMilestone.title}</h3>
                <p className="text-sm text-slate-500">{buildDateLabel(detailMilestone.start_at, detailMilestone.end_at || null)}</p>
              </div>
              <button
                type="button"
                onClick={closeDetails}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</div>
                <div className="mt-2 text-sm text-slate-700 whitespace-pre-line">
                  {detailMilestone.description?.trim() || 'Aucune description.'}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Users className="h-4 w-4" /> Personnel
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    {detailMilestone.personnel_ids.length === 0
                      ? 'Aucun'
                      : joinLabels(detailMilestone.personnel_ids, personnelLabel, 'Personnel')}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Truck className="h-4 w-4" /> Transport
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    {detailMilestone.vehicle_ids.length === 0
                      ? 'Aucun'
                      : joinLabels(detailMilestone.vehicle_ids, vehicleLabel, 'Véhicule')}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Package className="h-4 w-4" /> Matériels
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    {detailMilestone.item_ids.length === 0
                      ? 'Aucun'
                      : joinLabels(detailMilestone.item_ids, itemLabel, 'Matériel')}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <Button type="button" variant="secondary" onClick={closeDetails}>
                Fermer
              </Button>
              <Button
                type="button"
                className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                onClick={() => {
                  closeDetails();
                  openEdit(detailMilestone);
                }}
              >
                <Pencil className="h-4 w-4" /> Modifier
              </Button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export default RentalMilestonesPanel;
