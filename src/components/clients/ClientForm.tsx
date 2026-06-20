import React, { useState } from 'react';
import { Client, ClientType } from '../../types/client';
import { AddressSearchInput, Field, Input, Select } from '../ui-kit';

type ClientFormValues = Partial<Client> & {
  company_client_id?: string;
  billing_same_as_contact?: boolean;
};

interface ClientFormProps {
  onSubmit: (data: Partial<Client>) => void;
  initialData?: Partial<Client>;
  clientType?: ClientType;
  companyOptions?: Client[];
  onCancel?: () => void;
}

const ClientForm: React.FC<ClientFormProps> = ({
  onSubmit,
  initialData,
  clientType = 'person',
  companyOptions = [],
  onCancel,
}) => {
  const isCompany = clientType === 'company';

  const [name, setName] = useState(initialData?.name ?? '');
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [phone, setPhone] = useState(initialData?.phone ?? '');
  const [address, setAddress] = useState(initialData?.address ?? '');
  const [companyClientId, setCompanyClientId] = useState(initialData?.company_client_id ?? '');
  const [billingSame, setBillingSame] = useState(!initialData?.billing_address);
  const [billingAddress, setBillingAddress] = useState(initialData?.billing_address ?? '');
  const [deliveryAddress, setDeliveryAddress] = useState(initialData?.default_delivery_address ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        company_client_id: isCompany ? null : (companyClientId || null),
        billing_address: billingSame ? null : (billingAddress.trim() || null),
        default_delivery_address: deliveryAddress.trim() || null,
        client_type: clientType,
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
          <Field label={isCompany ? "Nom de l'entreprise *" : 'Nom *'} id="client-name" className="md:col-span-2">
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isCompany ? "Nom de l'entreprise" : 'Prénom Nom'}
              required
            />
          </Field>

          {!isCompany && (
            <>
              <Field label="Entreprise liée" id="client-company-id">
                <Select
                  id="client-company-id"
                  value={companyClientId}
                  onChange={(e) => setCompanyClientId(e.target.value)}
                >
                  <option value="">Aucune</option>
                  {companyOptions.map((co) => (
                    <option key={co.id} value={co.id}>{co.name}</option>
                  ))}
                </Select>
              </Field>

            </>
          )}
        </div>
      </div>

      {/* ── Coordonnées ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Coordonnées</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Email" id="client-email">
            <Input
              id="client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@exemple.fr"
            />
          </Field>
          <Field label="Téléphone" id="client-phone">
            <Input
              id="client-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="06 00 00 00 00"
            />
          </Field>
        </div>
      </div>

      {/* ── Adresses ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Adresses</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Adresse de contact" id="client-address">
            <AddressSearchInput
              id="client-address"
              value={address}
              onChange={setAddress}
              placeholder="Adresse principale"
            />
          </Field>

          <Field
            label="Adresse de facturation"
            id="client-billing"
            helper={
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none mt-1">
                <input
                  type="checkbox"
                  checked={billingSame}
                  onChange={(e) => {
                    setBillingSame(e.target.checked);
                    if (e.target.checked) setBillingAddress('');
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Identique à l'adresse de contact
              </label>
            }
          >
            {billingSame ? (
              <p className="text-sm text-slate-400 italic py-1">Identique à l'adresse de contact</p>
            ) : (
              <AddressSearchInput
                id="client-billing"
                value={billingAddress}
                onChange={setBillingAddress}
                placeholder="Adresse de facturation"
              />
            )}
          </Field>

          <Field
            label="Livraison par défaut"
            id="client-delivery"
            helper="Pré-remplit le champ livraison lors de la création d'un projet."
          >
            <AddressSearchInput
              id="client-delivery"
              value={deliveryAddress}
              onChange={setDeliveryAddress}
              placeholder="Lieu de livraison habituel"
            />
          </Field>
        </div>
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
          {saving ? 'Enregistrement…' : isCompany ? "Créer l'entreprise" : 'Créer le client'}
        </button>
      </div>
    </form>
  );
};

export default ClientForm;
