import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { useTranslation } from '../../context/TranslationContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: { selectedUnitId: string | null; selectedSerial: string | null; type: 'SAV' | 'DEPOT'; description: string }) => Promise<void> | void;
  equipmentName: string;
  serialUnits: Array<{ id: string; serial_number: string | null; status: string | null }>;
}

const MaintenanceProcedureWizard: React.FC<Props> = ({ isOpen, onClose, onSubmit, equipmentName, serialUnits }) => {
  const { t } = useTranslation();
  const steps = useMemo(() => ([
    { id: 'select', name: t('equipment.maintenance.wizard.steps.select') },
    { id: 'type', name: t('equipment.maintenance.wizard.steps.type') },
    { id: 'desc', name: t('equipment.maintenance.wizard.steps.description') },
  ] as const), [t]);
  const statusLabels = useMemo(() => ({
    available: t('equipment.common.status.available'),
    in_use: t('equipment.common.status.in_use'),
    maintenance: t('equipment.common.status.maintenance'),
    broken: t('equipment.common.status.broken'),
  }), [t]);
  const [step, setStep] = useState(0);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [procType, setProcType] = useState<'SAV' | 'DEPOT'>('SAV');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const progress = useMemo(() => ((step + 1) / steps.length) * 100, [step]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setDescription('');
    setProcType('SAV');
    const preferred = serialUnits.find((unit) => (unit.status || '').toLowerCase() !== 'maintenance');
    setSelectedUnitId(preferred?.id || null);
  }, [isOpen, serialUnits]);

  if (!isOpen) return null;

  const canNext = () => {
    if (steps[step].id === 'select') return true; // optional selection
    if (steps[step].id === 'type') return !!procType;
    if (steps[step].id === 'desc') return description.trim().length > 0;
    return true;
  };

  const next = () => { if (canNext()) setStep(s => Math.min(s + 1, steps.length - 1)); };
  const prev = () => setStep(s => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!canNext()) return;
    try {
      setSubmitting(true);
      const serialValue = (() => {
        const unit = selectedUnitId ? serialUnits.find((u) => u.id === selectedUnitId) : null;
        return unit?.serial_number?.trim() || null;
      })();
      await onSubmit({ selectedUnitId, selectedSerial: serialValue, type: procType, description: description.trim() });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[12040] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="px-6 pt-5">
          <div className="h-2 bg-gray-200 rounded">
            <div className="h-2 bg-blue-600 rounded" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-sm text-gray-600">
            {t('equipment.maintenance.wizard.progress', { current: step + 1, total: steps.length, name: steps[step].name })}
          </div>
        </div>
        <div className="p-6 space-y-4">
          {steps[step].id === 'select' && (
            <div className="space-y-3">
              <h3 className="text-md font-medium text-gray-900">{t('equipment.maintenance.wizard.select.title')}</h3>
              {serialUnits.length === 0 ? (
                <div className="text-sm text-gray-600">{t('equipment.maintenance.wizard.select.empty', { name: equipmentName })}</div>
              ) : (
                <ul className="max-h-60 overflow-auto divide-y divide-gray-100 border rounded">
                  {serialUnits.map((unit) => {
                    const status = (unit.status || 'available').toLowerCase();
                    const disabled = status === 'maintenance';
                    const label = unit.serial_number
                      ? t('equipment.maintenance.wizard.select.labelWithSerial', { name: equipmentName, serial: unit.serial_number })
                      : t('equipment.maintenance.wizard.select.labelWithoutSerial', { name: equipmentName });
                    const statusLabel = statusLabels[status as keyof typeof statusLabels] ?? (unit.status ?? status);
                    return (
                      <li
                        key={unit.id}
                        className={`flex items-center justify-between px-4 py-2 ${selectedUnitId === unit.id ? 'bg-blue-50' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={() => {
                          if (disabled) return;
                          setSelectedUnitId(unit.id);
                        }}
                        >
                          <div>
                            <div className="text-sm text-gray-800">{label}</div>
                            <div className="text-xs text-gray-500">
                              {t('equipment.maintenance.wizard.select.status', { status: statusLabel })}
                            </div>
                          </div>
                          <input
                          type="radio"
                          checked={selectedUnitId === unit.id && !disabled}
                          onChange={() => {
                            if (!disabled) setSelectedUnitId(unit.id);
                          }}
                          disabled={disabled}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-gray-500">{t('equipment.maintenance.wizard.select.hint')}</p>
            </div>
          )}

          {steps[step].id === 'type' && (
            <div className="space-y-3">
              <h3 className="text-md font-medium text-gray-900">{t('equipment.maintenance.wizard.type.title')}</h3>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input type="radio" name="ptype" value="SAV" checked={procType === 'SAV'} onChange={() => setProcType('SAV')} />
                  <span className="text-sm">{t('equipment.maintenance.wizard.type.sav')}</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="radio" name="ptype" value="DEPOT" checked={procType === 'DEPOT'} onChange={() => setProcType('DEPOT')} />
                  <span className="text-sm">{t('equipment.maintenance.wizard.type.depot')}</span>
                </label>
              </div>
            </div>
          )}

          {steps[step].id === 'desc' && (
            <div className="space-y-3">
              <h3 className="text-md font-medium text-gray-900">{t('equipment.maintenance.wizard.description.title')}</h3>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('equipment.maintenance.wizard.description.placeholder')}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex justify-between">
          <button type="button" onClick={prev} disabled={step === 0} className={`inline-flex items-center px-4 py-2 rounded-md border ${step === 0 ? 'border-gray-200 text-gray-300' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            <ArrowLeft className="h-4 w-4 mr-2" /> {t('equipment.maintenance.wizard.controls.previous')}
          </button>
          {step < steps.length - 1 ? (
            <button type="button" onClick={next} disabled={!canNext()} className={`inline-flex items-center px-4 py-2 rounded-md text-white ${canNext() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'}`}>
              {t('equipment.maintenance.wizard.controls.next')} <ArrowRight className="h-4 w-4 ml-2" />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={!canNext() || submitting} className={`inline-flex items-center px-4 py-2 rounded-md text-white ${(!canNext() || submitting) ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
              <Save className="h-4 w-4 mr-2" /> {t('equipment.maintenance.wizard.controls.submit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaintenanceProcedureWizard;
