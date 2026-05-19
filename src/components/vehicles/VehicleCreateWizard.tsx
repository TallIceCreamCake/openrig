import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { Vehicle } from '../../types/vehicle';

interface Props {
  onSubmit: (data: Partial<Vehicle>) => Promise<void> | void;
  onCancel?: () => void;
}

const steps = [
  { id: 'basic', name: 'Informations' },
  { id: 'options', name: 'Options' },
  { id: 'summary', name: 'Résumé' },
] as const;

const VehicleCreateWizard: React.FC<Props> = ({ onSubmit, onCancel }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [license, setLicense] = useState('');
  const [color, setColor] = useState<string>('#111827');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canNext = () => {
    const id = steps[step].id;
    if (id === 'basic') return !!name && !!license;
    return true;
  };

  const next = () => { if (canNext()) setStep(s => Math.min(s + 1, steps.length - 1)); };
  const prev = () => setStep(s => Math.max(s - 1, 0));

  const submit = async () => {
    if (!canNext()) return;
    setSaving(true);
    try {
      const payload: Partial<Vehicle> = {
        name,
        license_plate: license,
        color,
        status: 'active',
        notes,
      } as any;
      await onSubmit(payload);
    } finally { setSaving(false); }
  };

  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 pt-5">
        <div className="h-2 bg-gray-200 rounded">
          <div className="h-2 bg-blue-600 rounded" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 text-sm text-gray-600">Étape {step + 1} sur {steps.length} — {steps[step].name}</div>
      </div>
      <div className="p-6 space-y-6">
        {steps[step].id === 'basic' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nom du véhicule</label>
              <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="Ex: Renault Trafic" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Plaque d'immatriculation</label>
              <input value={license} onChange={e => setLicense(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="AA-123-BB" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Couleur</label>
              <div className="mt-1 flex items-center gap-3">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-16 h-10 rounded border" />
                <div className="flex items-center gap-2">
                  {['#2563eb','#059669','#DC2626','#7C3AED','#F59E0B','#10B981','#111827'].map(c => (
                    <button key={c} type="button" onClick={() => setColor(c)} title={c} className={`w-6 h-6 rounded-full border ${color===c?'ring-2 ring-blue-500':''}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {steps[step].id === 'options' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
            </div>
          </div>
        )}

        {steps[step].id === 'summary' && (
          <div className="space-y-4">
            <div className="border rounded p-4">
              <div className="text-sm text-gray-700">Nom: <span className="font-medium">{name || '-'}</span></div>
              <div className="text-sm text-gray-700">Plaque: <span className="font-medium">{license || '-'}</span></div>
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
        {step < steps.length - 1 ? (
          <button type="button" onClick={next} disabled={!canNext()} className={`inline-flex items-center px-4 py-2 rounded-md text-white ${canNext() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'}`}>
            Suivant <ArrowRight className="h-4 w-4 ml-2" />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={saving || !canNext()} className={`inline-flex items-center px-4 py-2 rounded-md text-white ${saving ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
            <Save className="h-4 w-4 mr-2" /> Enregistrer
          </button>
        )}
      </div>
    </div>
  );
};

export default VehicleCreateWizard;
