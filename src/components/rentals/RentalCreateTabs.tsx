import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Calendar as CalendarIcon, Package, Euro, Save, ArrowLeft } from 'lucide-react';
import { Rental, RentalItem, RentalType } from '../../types/rental';
import RentalEquipmentList from './RentalEquipmentList';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { computeRentalCoefficient, normalizeRentalCoefficientMode } from '../../utils/rentalCoefficient';

interface Props {
  onSubmit: (data: Partial<Rental>) => Promise<void> | void;
  clients: Array<{ id: string; name: string }>;
  onCancel?: () => void;
}

const tabs = [
  { id: 'basic', name: 'Infos', icon: Info },
  { id: 'schedule', name: 'Dates', icon: CalendarIcon },
  { id: 'items', name: 'Matériels', icon: Package },
  { id: 'pricing', name: 'Tarifs', icon: Euro },
  { id: 'summary', name: 'Résumé', icon: Info },
] as const;

const RentalCreateTabs: React.FC<Props> = ({ onSubmit, clients, onCancel }) => {
  const [activeTab, setActiveTab] = useState<'basic'|'schedule'|'items'|'pricing'|'summary'>('basic');
  const [type, setType] = useState<RentalType>('rental');
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [singleDay, setSingleDay] = useState(false);
  const [singleDayMenuOpen, setSingleDayMenuOpen] = useState(false);
  const singleDayMenuRef = useRef<HTMLDivElement | null>(null);
  const minDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);
  const minDate = useMemo(() => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    return day;
  }, []);
  const [items, setItems] = useState<RentalItem[]>([]);
  const [discountType, setDiscountType] = useState<'' | 'percentage' | 'fixed'>('');
  const [discountValue, setDiscountValue] = useState<number | undefined>(undefined);
  
  const [saving, setSaving] = useState(false);
  const { settings } = useCompanySettings();

  useEffect(() => {
    if (type === 'sale') {
      setSingleDay(false);
      setSingleDayMenuOpen(false);
    }
  }, [type]);

  useEffect(() => {
    if (!singleDayMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (singleDayMenuRef.current && !singleDayMenuRef.current.contains(event.target as Node)) {
        setSingleDayMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [singleDayMenuOpen]);

  const toInputDateTime = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const toStartOfDayInput = (value?: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setHours(0, 0, 0, 0);
    return toInputDateTime(parsed);
  };

  const toEndOfDayInput = (value?: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setHours(23, 59, 0, 0);
    return toInputDateTime(parsed);
  };

  const days = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    const d = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
    return Math.max(0, d);
  }, [startDate, endDate]);
  const companyCoefficientMode = normalizeRentalCoefficientMode(settings?.rental_coefficient_mode);
  const companyCoefficient = useMemo(() => {
    if (!settings) return null;
    return computeRentalCoefficient(companyCoefficientMode, days || 1, settings.rental_coefficient_formula);
  }, [companyCoefficientMode, days, settings]);
  const baseEquipmentMultiplier = days > 0 ? days : 1;
  const equipmentCoefficient = type === 'sale'
    ? baseEquipmentMultiplier
    : (companyCoefficient ?? baseEquipmentMultiplier);

  const baseTotal = useMemo(() => {
    return items.reduce((sum, it) => sum + it.price_per_day * it.quantity * equipmentCoefficient, 0);
  }, [equipmentCoefficient, items]);

  const totalPrice = useMemo(() => {
    if (!discountType || !discountValue) return baseTotal;
    if (discountType === 'percentage') return Math.max(0, baseTotal * (1 - discountValue / 100));
    return Math.max(0, baseTotal - discountValue);
  }, [baseTotal, discountType, discountValue]);

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, quantity: newQuantity } : it));
  };
  const handleRemoveItem = (itemId: string) => setItems(prev => prev.filter(it => it.id !== itemId));
  const handleAddItem = (equipment: any, quantity: number) => {
    const newItem: RentalItem = {
      id: Date.now().toString(),
      equipment_id: equipment.id,
      equipment_name: equipment.name,
      equipment_type: equipment.type,
      quantity,
      price_per_day: equipment.rental_price_ttc,
      is_external: false,
    };
    setItems(prev => [...prev, newItem]);
  };

  const handleAddExternalItem = (
    payload: { name: string; description?: string; type: string; subtype?: string; supplier?: string; price_per_day: number },
    quantity: number,
  ) => {
    const baseType = [payload.type, payload.subtype].filter(Boolean).join(' / ');
    const externalLabel = type === 'sale' ? 'Achat matériel' : 'Sous-location';
    const displayType = baseType ? `${baseType} (${externalLabel})` : externalLabel;
    const newItem: RentalItem = {
      id: `ext-${Date.now()}`,
      equipment_id: null,
      equipment_name: payload.name,
      equipment_type: displayType,
      quantity,
      price_per_day: payload.price_per_day,
      is_external: true,
      external_name: payload.name,
      external_type: payload.type,
      external_subtype: payload.subtype || null,
      external_supplier: payload.supplier || null,
      external_description: payload.description || null,
    };
    setItems(prev => [...prev, newItem]);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const payload: Partial<Rental> = {
        type,
        client_id: clientId,
        title: title.trim() || undefined,
        start_date: startDate,
        end_date: endDate,
        location,
        description,
        color: type === 'service' ? (color || undefined) : undefined,
        status: 'pending',
        total_price: Number(totalPrice.toFixed(2)),
        discount_type: (discountType || undefined) as any,
        discount_value: discountValue,
        items: items.map(item => ({
          ...item,
          is_external: !!item.is_external,
          external_name: item.is_external ? (item.external_name || item.equipment_name) : null,
          external_type: item.is_external ? (item.external_type || item.equipment_type) : null,
          external_subtype: item.is_external ? item.external_subtype || null : null,
          external_description: item.is_external ? item.external_description || null : null,
          external_supplier: item.is_external ? item.external_supplier || null : null,
        })),
      } as Partial<Rental>;
      await onSubmit(payload);
    } finally { setSaving(false); }
  };

  const canSave = type && clientId && title.trim() && startDate && endDate && items.length > 0;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 pt-5 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon as any;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`${active ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}>
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-6 space-y-6">
        {activeTab === 'basic' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select value={type} onChange={e => setType(e.target.value as RentalType)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="rental">Location</option>
                <option value="service">Prestation</option>
                <option value="sale">Vente</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Client</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="">Sélectionner un client</option>
                {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Titre</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Ex: Tournage clip vidéo – Studio Paris"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Lieu</label>
              <input value={location} onChange={e => setLocation(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            {type === 'service' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Couleur de la prestation</label>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="mt-1 block w-24 h-10 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            )}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Début</label>
              <input
                type="datetime-local"
                min={minDateTime}
                value={startDate}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  if (singleDay && type !== 'sale') {
                    const startValue = toStartOfDayInput(nextValue);
                    setStartDate(startValue);
                    setEndDate(startValue ? toEndOfDayInput(startValue) : '');
                    return;
                  }
                  setStartDate(nextValue);
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fin</label>
              <div className="relative flex items-stretch gap-2" ref={singleDayMenuRef}>
                <input
                  type="datetime-local"
                  min={minDateTime}
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  disabled={singleDay && type !== 'sale'}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-50"
                />
                {type !== 'sale' && (
                  <button
                    type="button"
                    onClick={() => setSingleDayMenuOpen((prev) => !prev)}
                    className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50"
                    aria-label="Options"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                {type !== 'sale' && singleDayMenuOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-[220px] rounded-xl border border-gray-200 bg-white shadow-lg">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">1 jour</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={singleDay}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSingleDay(checked);
                            if (!checked) return;
                            const base = startDate || endDate;
                            if (!base) return;
                            const startValue = toStartOfDayInput(base);
                            setStartDate(startValue);
                            setEndDate(startValue ? toEndOfDayInput(startValue) : '');
                          }}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="md:col-span-2 text-sm text-gray-500">Durée: {days} jour(s)</div>
          </div>
        )}

        {activeTab === 'items' && (
            <RentalEquipmentList
              items={items}
              onQuantityChange={handleQuantityChange}
              onRemoveItem={handleRemoveItem}
              onAddItem={handleAddItem}
              onAddExternalItem={handleAddExternalItem}
              startDate={startDate}
              endDate={endDate}
              externalTabLabel={type === 'sale' ? 'Achat matériel' : undefined}
              skipAvailability={type === 'sale'}
              coefficient={equipmentCoefficient}
            />
        )}

        {activeTab === 'pricing' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-3">
              <div className="text-sm text-gray-600 mb-2">Montant de base: {baseTotal.toFixed(2)}€</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Type de remise</label>
              <select value={discountType} onChange={e => setDiscountType(e.target.value as any)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="">Aucune</option>
                <option value="percentage">Pourcentage (%)</option>
                <option value="fixed">Montant fixe (€)</option>
              </select>
            </div>
            {discountType && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Valeur</label>
                <input type="number" min={0} step={discountType === 'percentage' ? 1 : 0.01} value={discountValue ?? ''} onChange={e => setDiscountValue(e.target.value === '' ? undefined : Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            )}
            
            <div className="md:col-span-3 text-sm text-gray-900 font-medium">Total estimé: {totalPrice.toFixed(2)}€</div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-900">Synthèse</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded p-4">
                <div className="text-sm text-gray-700">Titre: <span className="font-medium">{title || '-'}</span></div>
                <div className="text-sm text-gray-700">Type: <span className="font-medium">{type === 'rental' ? 'Location' : 'Prestation'}</span></div>
                <div className="text-sm text-gray-700">Client: <span className="font-medium">{clients.find(c => c.id === clientId)?.name || '-'}</span></div>
                <div className="text-sm text-gray-700">Période: <span className="font-medium">{startDate || '-'} → {endDate || '-'}</span></div>
                <div className="text-sm text-gray-700">Lieu: <span className="font-medium">{location || '-'}</span></div>
              </div>
              <div className="border rounded p-4">
                <div className="text-sm text-gray-700">Articles: <span className="font-medium">{items.length}</span></div>
                <div className="text-sm text-gray-700">Base: <span className="font-medium">{baseTotal.toFixed(2)}€</span></div>
                <div className="text-sm text-gray-700">Remise: <span className="font-medium">{discountType ? (discountType === 'percentage' ? `${discountValue || 0}%` : `${discountValue || 0}€`) : '-'}</span></div>
                <div className="text-sm text-gray-700">Total: <span className="font-medium">{totalPrice.toFixed(2)}€</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="px-6 pb-5 flex justify-between">
        {onCancel && (
          <button type="button" onClick={onCancel} className="inline-flex items-center px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            <ArrowLeft className="h-4 w-4 mr-2" /> Annuler
          </button>
        )}
        <button type="button" onClick={submit} disabled={saving || !canSave} className={`inline-flex items-center px-4 py-2 rounded-md text-white ${saving || !canSave ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
          <Save className="h-4 w-4 mr-2" /> Enregistrer
        </button>
      </div>
    </div>
  );
};

export default RentalCreateTabs;
