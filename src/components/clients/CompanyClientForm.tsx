import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Client } from '../../types/client';

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

const createEmptyDraft = (): CompanyContactDraft => ({
  name: '',
  email: '',
  phone: '',
  address: '',
});

const CompanyClientForm: React.FC<CompanyClientFormProps> = ({ clients, onSubmit, onCancel }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [search, setSearch] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [newContacts, setNewContacts] = useState<CompanyContactDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const availableClients = useMemo(
    () => clients.filter((client) => client.client_type !== 'company'),
    [clients]
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableClients;
    return availableClients.filter((client) => (
      (client.name || '').toLowerCase().includes(q)
      || (client.company || '').toLowerCase().includes(q)
      || (client.email || '').toLowerCase().includes(q)
    ));
  }, [availableClients, search]);

  const toggleSelection = (clientId: string) => {
    setSelectedClientIds((prev) => (
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    ));
  };

  const updateDraft = (index: number, field: keyof CompanyContactDraft, value: string) => {
    setNewContacts((prev) => prev.map((draft, draftIndex) => (
      draftIndex === index ? { ...draft, [field]: value } : draft
    )));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || saving) return;

    const normalizedContacts = newContacts
      .map((draft) => ({
        name: draft.name.trim(),
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        address: draft.address.trim() || null,
      }))
      .filter((draft) => draft.name);

    try {
      setSaving(true);
      await onSubmit({
        company: {
          name: trimmedName,
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          image_url: imageUrl.trim() || null,
          client_type: 'company',
        },
        linkedClientIds: selectedClientIds,
        newClients: normalizedContacts.map((draft) => ({
          name: draft.name,
          email: draft.email,
          phone: draft.phone,
          address: draft.address,
          client_type: 'person',
        })),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="company-name" className="block text-sm font-medium text-gray-700">
              Nom de l'entreprise *
            </label>
            <input
              id="company-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="company-email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="company-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="company-phone" className="block text-sm font-medium text-gray-700">
              Téléphone
            </label>
            <input
              id="company-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="company-address" className="block text-sm font-medium text-gray-700">
              Adresse
            </label>
            <textarea
              id="company-address"
              rows={3}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="company-image-url" className="block text-sm font-medium text-gray-700">
              Image
            </label>
            <input
              id="company-image-url"
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Associer des clients existants</h3>
                <p className="text-xs text-gray-500">Ils deviendront les contacts de cette entreprise.</p>
              </div>
              <div className="text-xs font-medium text-gray-500">{selectedClientIds.length} sélectionné(s)</div>
            </div>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un client existant..."
              className="mt-3 block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white">
              {filteredClients.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500">Aucun client correspondant.</div>
              ) : (
                filteredClients.map((client) => (
                  <label
                    key={client.id}
                    className="flex cursor-pointer items-start gap-3 border-b border-gray-100 px-3 py-3 last:border-b-0 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedClientIds.includes(client.id)}
                      onChange={() => toggleSelection(client.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{client.name}</div>
                      <div className="text-xs text-gray-500">
                        {client.company || client.email || client.phone || 'Aucune information complémentaire'}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Créer des contacts sur le formulaire</h3>
            <p className="text-xs text-gray-500">Pratique si les interlocuteurs n'existent pas encore.</p>
          </div>
          <button
            type="button"
            onClick={() => setNewContacts((prev) => [...prev, createEmptyDraft()])}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Ajouter un contact
          </button>
        </div>

        {newContacts.length > 0 && (
          <div className="mt-4 space-y-4">
            {newContacts.map((draft, index) => (
              <div key={`draft-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-gray-900">Contact {index + 1}</div>
                  <button
                    type="button"
                    onClick={() => setNewContacts((prev) => prev.filter((_, draftIndex) => draftIndex !== index))}
                    className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-600"
                    aria-label="Supprimer ce contact"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) => updateDraft(index, 'name', event.target.value)}
                    placeholder="Nom du contact"
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(event) => updateDraft(index, 'email', event.target.value)}
                    placeholder="Email"
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <input
                    type="tel"
                    value={draft.phone}
                    onChange={(event) => updateDraft(index, 'phone', event.target.value)}
                    placeholder="Téléphone"
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={draft.address}
                    onChange={(event) => updateDraft(index, 'address', event.target.value)}
                    placeholder="Adresse"
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
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
          className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white ${
            saving || !name.trim() ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {saving ? 'Création...' : "Créer l'entreprise"}
        </button>
      </div>
    </form>
  );
};

export default CompanyClientForm;
