import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useVehicles } from '../hooks/useVehicles';
import { Vehicle } from '../types/vehicle';
import { ArrowLeft, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

const VehicleDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { singleVehicle: vehicle, loading, error, updateVehicle, refetch } = useVehicles(id);
  const [form, setForm] = useState<Partial<Vehicle>>({});
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; event: string; event_time: string; location?: string | null; notes?: string | null }>>([]);

  useEffect(() => {
    if (vehicle) {
      setForm({
        name: vehicle.name,
        license_plate: vehicle.license_plate,
        color: vehicle.color || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        model_year: vehicle.model_year || undefined,
        capacity_weight_kg: vehicle.capacity_weight_kg || undefined,
        capacity_volume_m3: vehicle.capacity_volume_m3 || undefined,
        odometer_km: vehicle.odometer_km || undefined,
        acquisition_date: vehicle.acquisition_date || undefined,
        status: vehicle.status,
        notes: vehicle.notes || '',
      });
    }
  }, [vehicle]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!id) return;
      const { data, error } = await supabase
        .from('vehicle_delivery_history')
        .select('id,event,event_time,location,notes')
        .eq('vehicle_id', id)
        .order('event_time', { ascending: false })
        .limit(50);
      if (!error) setHistory(data || []);
    };
    loadHistory();
  }, [id]);

  const canSave = useMemo(() => {
    return !!form.name && !!form.license_plate;
  }, [form.name, form.license_plate]);

  const onChange = (key: keyof Vehicle, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const onSubmit = async () => {
    if (!id || !canSave) return;
    setSaving(true);
    try {
      await updateVehicle(id, form);
      await refetch();
    } finally { setSaving(false); }
  };

  if (loading && !vehicle) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }
  if (error || !vehicle) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/vehicles')} className="inline-flex items-center px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
          </button>
          <h1 className="text-xl font-semibold">Véhicule introuvable</h1>
        </div>
        <div className="bg-white rounded-lg shadow p-6">Aucune donnée à afficher.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/vehicles" className="inline-flex items-center px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">
            <ArrowLeft className="h-4 w-4 mr-2" /> Véhicules
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{vehicle.name}</h1>
          <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
            vehicle.status==='active'?'bg-green-100 text-green-800':vehicle.status==='maintenance'?'bg-orange-100 text-orange-800':'bg-gray-100 text-gray-800'
          }`}>{vehicle.status}</span>
        </div>
        <button onClick={onSubmit} disabled={!canSave || saving} className={`inline-flex items-center px-4 py-2 rounded-md text-white ${!canSave||saving?'bg-gray-400':'bg-green-600 hover:bg-green-700'}`}>
          <Save className="h-4 w-4 mr-2" /> Enregistrer
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-medium">Général</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom</label>
                <input value={form.name || ''} onChange={e=>onChange('name', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Plaque</label>
                <input value={form.license_plate || ''} onChange={e=>onChange('license_plate', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Couleur</label>
                <input type="color" value={(form.color as string) || '#111827'} onChange={e=>onChange('color', e.target.value)} className="mt-1 h-10 w-16 rounded border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Statut</label>
                <select value={form.status || 'active'} onChange={e=>onChange('status', e.target.value as Vehicle['status'])} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500">
                  <option value="active">active</option>
                  <option value="maintenance">maintenance</option>
                  <option value="retired">retired</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Marque</label>
                <input value={(form.make as string) || ''} onChange={e=>onChange('make', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Modèle</label>
                <input value={(form.model as string) || ''} onChange={e=>onChange('model', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Année</label>
                <input type="number" value={form.model_year ?? ''} onChange={e=>onChange('model_year', e.target.value === '' ? null : Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Comp. poids (kg)</label>
                <input type="number" step="0.01" value={form.capacity_weight_kg ?? ''} onChange={e=>onChange('capacity_weight_kg', e.target.value === '' ? null : Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Comp. volume (m³)</label>
                <input type="number" step="0.01" value={form.capacity_volume_m3 ?? ''} onChange={e=>onChange('capacity_volume_m3', e.target.value === '' ? null : Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Kilométrage (km)</label>
                <input type="number" step="1" value={form.odometer_km ?? ''} onChange={e=>onChange('odometer_km', e.target.value === '' ? null : Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Date d'acquisition</label>
                <input type="date" value={(form.acquisition_date as string) || ''} onChange={e=>onChange('acquisition_date', e.target.value || null)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea rows={4} value={(form.notes as string) || ''} onChange={e=>onChange('notes', e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-3">Infos</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <div><span className="text-gray-500">Créé le: </span>{new Date(vehicle.created_at).toLocaleString()}</div>
              <div><span className="text-gray-500">ID: </span>{vehicle.id}</div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-3">Historique de livraison</h2>
            <div className="divide-y divide-gray-200">
              {history.length === 0 && (
                <div className="text-sm text-gray-500">Aucune entrée</div>
              )}
              {history.map((h) => (
                <div key={h.id} className="py-2 text-sm">
                  <div className="text-gray-900 capitalize">{h.event}</div>
                  <div className="text-gray-600">{new Date(h.event_time).toLocaleString()}</div>
                  {h.location && <div className="text-gray-500">{h.location}</div>}
                  {h.notes && <div className="text-gray-500 italic">{h.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleDetail;
