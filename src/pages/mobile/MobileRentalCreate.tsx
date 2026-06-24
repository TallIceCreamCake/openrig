import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';

type RentalType = 'rental' | 'service' | 'sale';

type Client = { id: string; name: string };

const STEPS = 3;

const MobileRentalCreate: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [rentalType, setRentalType] = useState<RentalType>('rental');
  const [title, setTitle] = useState('');

  const [clientSearch, setClientSearch] = useState('');
  const [clientSuggestions, setClientSuggestions] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchingClients, setSearchingClients] = useState(false);
  const clientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current);
    if (!clientSearch.trim()) {
      setClientSuggestions([]);
      return;
    }
    clientDebounceRef.current = setTimeout(async () => {
      setSearchingClients(true);
      try {
        const { data } = await supabase
          .from('clients')
          .select('id, name')
          .ilike('name', `%${clientSearch}%`)
          .limit(8);
        setClientSuggestions((data as Client[]) || []);
      } catch {
        setClientSuggestions([]);
      } finally {
        setSearchingClients(false);
      }
    }, 250);
  }, [clientSearch]);

  const canNext = () => {
    if (step === 1) return true;
    if (step === 2) return true;
    if (step === 3) return Boolean(startDate && endDate && endDate >= startDate);
    return false;
  };

  const handleNext = () => {
    if (step < STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else navigate(-1);
  };

  const handleSubmit = async () => {
    if (!startDate || !endDate) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('rentals')
        .insert({
          title: title.trim() || null,
          type: rentalType,
          status: 'pending',
          client_id: selectedClient?.id || null,
          start_date: startDate,
          end_date: endDate,
        })
        .select('id')
        .single();

      if (error) throw error;
      toast.success('Projet créé');
      navigate(`/m/projets/${(data as { id: string }).id}`);
    } catch (err) {
      console.error('Create rental error', err);
      toast.error('Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  const typeOptions: { value: RentalType; label: string }[] = [
    { value: 'rental', label: 'Location' },
    { value: 'service', label: 'Service' },
    { value: 'sale', label: 'Vente' },
  ];

  return (
    <MobileLayout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={handleBack}
          className="h-10 w-10 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Nouveau projet</h1>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5 mb-6">
        {Array.from({ length: STEPS }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < step ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Type & Title */}
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Type de projet</p>
            <div className="flex gap-3">
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRentalType(opt.value)}
                  className={`flex-1 py-3 rounded-xl border font-medium text-sm transition-colors ${
                    rentalType === opt.value
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Titre (optionnel)</p>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Festival de la musique"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      )}

      {/* Step 2: Client */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Client</p>

          {selectedClient ? (
            <div className="flex items-center justify-between border border-blue-300 bg-blue-50 rounded-xl px-4 py-3">
              <span className="font-medium text-blue-900">{selectedClient.name}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedClient(null);
                  setClientSearch('');
                }}
                className="text-blue-600 text-sm underline"
              >
                Changer
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Rechercher un client..."
                className="w-full rounded-xl border border-gray-300 px-4 py-3 pl-9 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              {clientSuggestions.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                  {clientSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedClient(c);
                        setClientSuggestions([]);
                        setClientSearch('');
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-gray-800 border-b border-gray-100 last:border-0 active:bg-gray-50"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {searchingClients && (
                <p className="text-xs text-gray-400 mt-1 ml-1">Recherche...</p>
              )}
            </div>
          )}

          {!selectedClient && (
            <button
              type="button"
              onClick={() => setSelectedClient(null)}
              className="text-sm text-gray-500 underline text-left"
            >
              Continuer sans client
            </button>
          )}
        </div>
      )}

      {/* Step 3: Dates */}
      {step === 3 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Dates</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate && e.target.value > endDate) setEndDate(e.target.value);
              }}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          {startDate && endDate && endDate < startDate && (
            <p className="text-sm text-red-500">La date de fin doit être après la date de début.</p>
          )}
        </div>
      )}

      {/* Nav buttons */}
      <div className="mt-8 flex flex-col gap-3">
        {step < STEPS ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canNext()}
            className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold text-base disabled:opacity-40 flex items-center justify-center gap-2"
          >
            Suivant
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canNext() || submitting}
            className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold text-base disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Check className="h-5 w-5" />
            {submitting ? 'Création...' : 'Créer le projet'}
          </button>
        )}
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="w-full py-3 text-gray-500 font-medium text-base"
          >
            Retour
          </button>
        )}
      </div>
    </MobileLayout>
  );
};

export default MobileRentalCreate;
