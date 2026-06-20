import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Client } from '../../types/client';
import { AddressSearchInput, Field, Input } from '../ui-kit';

type CompanyContactDraft = {
  name: string;
  email: string;
  phone: string;
  address: string;
};

export interface CompanyClientFormPayload {
  company: Partial<Client>;
  linkedClientIds: string[];
  newClients: Array<Partial<Client>>;
}

interface CompanyClientFormProps {
  clients: Client[];
  onSubmit: (payload: CompanyClientFormPayload) => Promise<void> | void;
  onCancel?: () => void;
}

const createEmptyDraft = (): CompanyContactDraft => ({ name: '', email: '', phone: '', address: '' });

const CompanyClientForm: React.FC<CompanyClientFormProps> = ({ clients, onSubmit, onCancel }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [search, setSearch] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [newContacts, setNewContacts] = useState<CompanyContactDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const availableClients = useMemo(
    () => clients.filter((c) => c.client_type !== 'company'),
    [clients]
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableClients;
    return availableClients.filter((c) => (
      (c.name || '').toLowerCase().includes(q)
      || (c.company || '').toLowerCase().includes(q)
      || (c.email || '').toLowerCase().includes(q)
    ));
  }, [availableClients, search]);

  const toggleSelection = (clientId: string) =>
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );

  const updateDraft = (index: number, field: keyof CompanyContactDraft, value: string) =>
    setNewContacts((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        company: {
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          client_type: 'company',
        },
        linkedClientIds: selectedClientIds,
        newClients: newContacts
          .map((d) => ({ name: d.name.trim(), email: d.email.trim() || null, phone: d.phone.trim() || null, address: d.address.trim() || null, client_type: 'person' as const }))
          .filter((d) => d.name),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ── Identité ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Identité</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nom de l'entreprise *" id="company-name" className="md:col-span-2">
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : ACME Corp"
              required
            />
          </Field>
          <Field label="Email" id="company-email">
            <Input
              id="company-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@entreprise.fr"
            />
          </Field>
          <Field label="Téléphone" id="company-phone">
            <Input
              id="company-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01 00 00 00 00"
            />
          </Field>
          <Field label="Adresse" id="company-address" className="md:col-span-2">
            <AddressSearchInput
              id="company-address"
              value={address}
              onChange={setAddress}
              placeholder="Adresse de l'entreprise"
            />
          </Field>
        </div>
      </div>

      {/* ── Interlocuteurs existants ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Associer des contacts existants</p>
            <p className="text-xs text-slate-500 mt-0.5">Ils deviendront les interlocuteurs de cette entreprise.</p>
          </div>
          {selectedClientIds.length > 0 && (
            <span className="text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-2.5 py-1">
              {selectedClientIds.length} sélectionné{selectedClientIds.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un client existant…"
        />
        <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50">
          {filteredClients.length === 0 ? (
            <div className="px-4 py-5 text-sm text-slate-400 text-center">Aucun client correspondant.</div>
          ) : (
            filteredClients.map((client) => (
              <label
                key={client.id}
                className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 hover:bg-white transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedClientIds.includes(client.id)}
                  onChange={() => toggleSelection(client.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{client.name}</p>
                  {(client.company || client.email) && (
                    <p className="text-xs text-slate-500 truncate">{client.company || client.email}</p>
                  )}
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {/* ── Nouveaux contacts ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Créer des contacts</p>
            <p className="text-xs text-slate-500 mt-0.5">Pratique si les interlocuteurs n'existent pas encore.</p>
          </div>
          <button
            type="button"
            onClick={() => setNewContacts((prev) => [...prev, createEmptyDraft()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </button>
        </div>

        {newContacts.length > 0 && (
          <div className="space-y-3">
            {newContacts.map((draft, index) => (
              <div key={`draft-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-700">Contact {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => setNewContacts((prev) => prev.filter((_, i) => i !== index))}
                    className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={draft.name}
                    onChange={(e) => updateDraft(index, 'name', e.target.value)}
                    placeholder="Nom *"
                  />
                  <Input
                    type="email"
                    value={draft.email}
                    onChange={(e) => updateDraft(index, 'email', e.target.value)}
                    placeholder="Email"
                  />
                  <Input
                    type="tel"
                    value={draft.phone}
                    onChange={(e) => updateDraft(index, 'phone', e.target.value)}
                    placeholder="Téléphone"
                  />
                  <Input
                    value={draft.address}
                    onChange={(e) => updateDraft(index, 'address', e.target.value)}
                    placeholder="Adresse"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
        )}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Création…' : "Créer l'entreprise"}
        </button>
      </div>
    </form>
  );
};

export default CompanyClientForm;
