import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Edit, History, Phone, Users } from 'lucide-react';
import { Client, ClientContact, ClientContactType, ClientRental } from '../types/client';
import ClientForm from '../components/clients/ClientForm';
import { useClients } from '../hooks/useClients';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../context/TranslationContext';

type TabId = 'info' | 'rentals' | 'contacts' | 'members';

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clients, updateClient, addClient, setCompanyClients, loading } = useClients();
  const { t } = useTranslation();
  const [client, setClient] = useState<Client | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams.get('tab') as TabId | null;
    const valid: TabId[] = ['info', 'rentals', 'contacts', 'members'];
    return valid.includes(t as TabId) ? t as TabId : 'info';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);
  const [rentals, setRentals] = useState<ClientRental[]>([]);
  const [rentalsLoading, setRentalsLoading] = useState(false);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactDeletingId, setContactDeletingId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState<{
    contact_type: ClientContactType;
    title: string;
    value: string;
  } | null>(null);
  const [contactForm, setContactForm] = useState<{
    contact_type: ClientContactType;
    title: string;
    value: string;
  }>({
    contact_type: 'email',
    title: '',
    value: '',
  });
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [membersSaving, setMembersSaving] = useState(false);
  const [newMemberForm, setNewMemberForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });
  const [newMemberSaving, setNewMemberSaving] = useState(false);

  const statusLabels = useMemo<Record<string, string>>(() => ({
    pending: t('rentals.status.pending'),
    confirmed: t('rentals.status.confirmed'),
    preparing: t('rentals.status.preparing'),
    in_progress: t('rentals.status.in_progress'),
    delivered: t('rentals.status.delivered'),
    return_delivery: t('rentals.status.return_delivery'),
    in_return: t('rentals.status.in_return'),
    returned: t('rentals.status.returned'),
    completed: t('rentals.status.completed'),
    paid: t('rentals.status.paid'),
    cancelled: t('rentals.status.cancelled'),
    archived: t('rentals.status.archived'),
  }), [t]);

  const contactTypeLabels = useMemo<Record<ClientContactType, string>>(() => ({
    email: 'Email',
    phone: 'Téléphone',
    social: 'Réseaux sociaux',
    website: 'Site web',
    other: 'Autre',
  }), []);

  const normalizeContactType = React.useCallback(
    (value: string): ClientContactType => (
      Object.prototype.hasOwnProperty.call(contactTypeLabels, value)
        ? (value as ClientContactType)
        : 'other'
    ),
    [contactTypeLabels]
  );

  const contactTypeOptions = useMemo(
    () => Object.entries(contactTypeLabels).map(([value, label]) => ({ value: value as ClientContactType, label })),
    [contactTypeLabels]
  );

  const previewContacts = contacts.slice(0, 3);

  const companyOptions = useMemo(
    () => clients.filter((entry) => entry.client_type === 'company' && entry.id !== client?.id),
    [client?.id, clients]
  );

  const linkedMembers = useMemo(
    () => client?.client_type === 'company'
      ? clients.filter((entry) => entry.client_type !== 'company' && entry.company_client_id === client.id)
      : [],
    [client, clients]
  );

  const availableMemberClients = useMemo(
    () => clients.filter((entry) => entry.client_type !== 'company' && entry.id !== client?.id),
    [client?.id, clients]
  );

  const filteredAvailableMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return availableMemberClients;
    return availableMemberClients.filter((entry) => (
      (entry.name || '').toLowerCase().includes(q)
      || (entry.email || '').toLowerCase().includes(q)
      || (entry.company || '').toLowerCase().includes(q)
    ));
  }, [availableMemberClients, memberSearch]);

  const tabs = useMemo<Array<{ id: TabId; name: string; icon: React.ComponentType<{ className?: string }> }>>(() => {
    const base = [
      { id: 'info' as const, name: 'Informations', icon: Edit },
      { id: 'rentals' as const, name: 'Historique', icon: History },
      { id: 'contacts' as const, name: 'Contacts', icon: Phone },
    ];

    if (client?.client_type === 'company') {
      base.push({ id: 'members' as const, name: 'Interlocuteurs', icon: Users });
    }

    return base;
  }, [client?.client_type]);

  useEffect(() => {
    if (!loading) {
      const foundClient = clients.find((entry) => entry.id === id);
      if (!foundClient) {
        navigate('/clients');
        return;
      }
      setClient(foundClient);
    }
  }, [id, navigate, clients, loading]);

  useEffect(() => {
    if (client?.client_type !== 'company' && activeTab === 'members') {
      setActiveTab('info');
    }
  }, [activeTab, client?.client_type]);

  useEffect(() => {
    if (client?.client_type === 'company') {
      setSelectedMemberIds(linkedMembers.map((entry) => entry.id));
    }
  }, [client?.client_type, client?.id, linkedMembers]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const loadRentals = async () => {
      try {
        setRentalsLoading(true);
        const { data, error } = await supabase
          .from('rentals')
          .select(`
            id,
            reference_code,
            title,
            start_date,
            end_date,
            total_price,
            status,
            rental_items (
              quantity,
              external_name,
              equipment:equipment_id (
                name
              )
            )
          `)
          .eq('client_id', id)
          .order('start_date', { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        const rows: ClientRental[] = (data || []).map((row: any) => {
          const items = (row.rental_items || []) as Array<any>;
          const equipment = items
            .map((item) => {
              const name = (item.external_name || item?.equipment?.name || '').trim();
              if (!name) return null;
              return {
                name,
                quantity: Number(item.quantity || 0),
              };
            })
            .filter((item): item is { name: string; quantity: number } => !!item);

          return {
            id: row.id,
            reference_code: row.reference_code ?? null,
            title: row.title ?? null,
            start_date: row.start_date,
            end_date: row.end_date,
            total_price: Number(row.total_price || 0),
            status: row.status,
            equipment,
          };
        });

        setRentals(rows);
      } catch (error) {
        console.error('Error loading client rentals', error);
        setRentals([]);
      } finally {
        if (!cancelled) setRentalsLoading(false);
      }
    };

    loadRentals();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const loadContacts = async () => {
      try {
        setContactsLoading(true);
        const { data, error } = await supabase
          .from('client_contacts')
          .select('*')
          .eq('client_id', id)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (cancelled) return;
        setContacts((data || []) as ClientContact[]);
      } catch (error) {
        console.error('Error loading client contacts', error);
        if (!cancelled) setContacts([]);
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    };

    loadContacts();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAddContact = async () => {
    if (!id || contactSaving) return;
    const trimmedValue = contactForm.value.trim();
    if (!trimmedValue) return;
    const trimmedTitle = contactForm.title.trim();
    const nextPosition = contacts.reduce((max, entry) => Math.max(max, entry.position ?? 0), -1) + 1;

    try {
      setContactSaving(true);
      const { data, error } = await supabase
        .from('client_contacts')
        .insert([{
          client_id: id,
          contact_type: contactForm.contact_type,
          title: trimmedTitle || null,
          value: trimmedValue,
          position: nextPosition,
        }])
        .select()
        .single();

      if (error) throw error;

      setContacts((prev) => [...prev, data as ClientContact]);
      setContactForm((prev) => ({ ...prev, title: '', value: '' }));
    } catch (error) {
      console.error('Error adding contact', error);
    } finally {
      setContactSaving(false);
    }
  };

  const startEditingContact = (contact: ClientContact) => {
    const safeType = normalizeContactType(contact.contact_type);
    setEditingContactId(contact.id);
    setContactDraft({
      contact_type: safeType,
      title: contact.title ?? '',
      value: contact.value ?? '',
    });
  };

  const cancelEditingContact = () => {
    setEditingContactId(null);
    setContactDraft(null);
  };

  const handleUpdateContact = async () => {
    if (!editingContactId || !contactDraft || contactSaving) return;
    const trimmedValue = contactDraft.value.trim();
    if (!trimmedValue) return;
    const trimmedTitle = contactDraft.title.trim();

    try {
      setContactSaving(true);
      const { data, error } = await supabase
        .from('client_contacts')
        .update({
          contact_type: contactDraft.contact_type,
          title: trimmedTitle || null,
          value: trimmedValue,
        })
        .eq('id', editingContactId)
        .select()
        .single();

      if (error) throw error;

      setContacts((prev) => prev.map((entry) => (
        entry.id === editingContactId ? { ...entry, ...data } as ClientContact : entry
      )));
      cancelEditingContact();
    } catch (error) {
      console.error('Error updating contact', error);
    } finally {
      setContactSaving(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!contactId || contactDeletingId) return;

    try {
      setContactDeletingId(contactId);
      const { error } = await supabase
        .from('client_contacts')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      setContacts((prev) => prev.filter((entry) => entry.id !== contactId));
      if (editingContactId === contactId) {
        cancelEditingContact();
      }
    } catch (error) {
      console.error('Error deleting contact', error);
    } finally {
      setContactDeletingId(null);
    }
  };

  const handleEditSubmit = async (data: Partial<Client>) => {
    if (!client) return;
    try {
      await updateClient(client.id, data);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating client:', error);
    }
  };

  const handleSaveMembers = async () => {
    if (!client || client.client_type !== 'company' || membersSaving) return;
    try {
      setMembersSaving(true);
      await setCompanyClients(client.id, selectedMemberIds);
    } catch (error) {
      console.error('Error updating company members:', error);
    } finally {
      setMembersSaving(false);
    }
  };

  const handleCreateMember = async () => {
    if (!client || client.client_type !== 'company' || newMemberSaving || !newMemberForm.name.trim()) return;

    try {
      setNewMemberSaving(true);
      await addClient({
        name: newMemberForm.name.trim(),
        email: newMemberForm.email.trim() || null,
        phone: newMemberForm.phone.trim() || null,
        address: newMemberForm.address.trim() || null,
        client_type: 'person',
        company_client_id: client.id,
      });
      setNewMemberForm({
        name: '',
        email: '',
        phone: '',
        address: '',
      });
    } catch (error) {
      console.error('Error creating company member:', error);
    } finally {
      setNewMemberSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Client non trouvé</h3>
        <p className="mt-2 text-sm text-gray-500">Le client demandé n'existe pas ou a été supprimé.</p>
        <button
          onClick={() => navigate('/clients')}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          Retour aux clients
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link
            to="/clients"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{client.name}</h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                client.client_type === 'company'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {client.client_type === 'company' ? 'Entreprise' : 'Client'}
              </span>
            </div>
            {client.client_type === 'person' && client.company_client && (
              <Link to={`/clients/${client.company_client.id}`} className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
                <Building2 className="h-4 w-4" />
                {client.company_client.name}
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={() => setIsEditing((prev) => !prev)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Edit className="h-4 w-4 mr-2" />
          {client.client_type === 'company' ? "Modifier l'entreprise" : 'Modifier le client'}
        </button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="bg-white shadow rounded-lg">
        {activeTab === 'info' && (
          <div className="p-6">
            {isEditing ? (
              <ClientForm
                initialData={client}
                onSubmit={handleEditSubmit}
                clientType={client.client_type}
                companyOptions={companyOptions}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">
                      {client.client_type === 'company' ? "Nom de l'entreprise" : 'Nom du client'}
                    </h3>
                    <p className="mt-1 text-base font-semibold text-gray-900">{client.name}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Type</h3>
                    <p className="mt-1 text-sm text-gray-900">{client.client_type === 'company' ? 'Entreprise' : 'Client'}</p>
                  </div>
                  {client.client_type === 'person' && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Entreprise liée</h3>
                      {client.company_client ? (
                        <Link to={`/clients/${client.company_client.id}`} className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
                          <Building2 className="h-4 w-4" />
                          {client.company_client.name}
                        </Link>
                      ) : (
                        <p className="mt-1 text-sm text-gray-900">{client.company || '-'}</p>
                      )}
                    </div>
                  )}
                  {client.client_type === 'company' && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Interlocuteurs liés</h3>
                      <p className="mt-1 text-sm text-gray-900">{linkedMembers.length}</p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Adresse</h3>
                    <p className="mt-1 text-sm text-gray-900">{client.address || '-'}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Email</h3>
                    <p className="mt-1 text-sm text-gray-900">{client.email || '-'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Téléphone</h3>
                    <p className="mt-1 text-sm text-gray-900">{client.phone || '-'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Autres contacts</h3>
                    {contactsLoading ? (
                      <p className="mt-1 text-sm text-gray-500">Chargement...</p>
                    ) : previewContacts.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {previewContacts.map((contact) => (
                          <div key={contact.id} className="text-sm text-gray-900">
                            <span className="text-gray-500">
                              {(contact.title?.trim() || contactTypeLabels[normalizeContactType(contact.contact_type)] || contact.contact_type)} :
                            </span>{' '}
                            {contact.value}
                          </div>
                        ))}
                        {contacts.length > previewContacts.length && (
                          <div className="text-xs text-gray-400">+{contacts.length - previewContacts.length} contact(s)</div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-gray-500">Aucun contact supplémentaire.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'rentals' && (
          <div className="p-6">
            {rentalsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : rentals.length === 0 ? (
              <div className="text-sm text-gray-500">Aucun projet associé.</div>
            ) : (
              <div className="space-y-3">
                {rentals.map((rental) => (
                  <Link
                    key={rental.id}
                    to={`/rentals/${rental.id}`}
                    className="block border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        {(() => {
                          const referenceLabel = rental.reference_code || `Projet #${rental.id.slice(0, 6)}`;
                          const titleSuffix = rental.title?.trim();
                          const heading = titleSuffix ? `${referenceLabel} · ${titleSuffix}` : referenceLabel;
                          return (
                            <h3 className="text-base font-semibold text-gray-900">
                              {heading}
                            </h3>
                          );
                        })()}
                        <p className="text-sm text-gray-500">
                          {new Date(rental.start_date).toLocaleDateString()} → {new Date(rental.end_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          ['completed', 'paid'].includes(rental.status) ? 'bg-green-100 text-green-800' :
                          ['confirmed', 'preparing', 'in_progress', 'delivered', 'returned'].includes(rental.status) ? 'bg-blue-100 text-blue-800' :
                          rental.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {statusLabels[rental.status] ?? rental.status}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {rental.total_price.toFixed(2)}€
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="p-6 space-y-6">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Ajouter un contact</h3>
                <p className="text-xs text-gray-500">Ajoutez autant de contacts que nécessaire.</p>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Type</label>
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    value={contactForm.contact_type}
                    onChange={(e) => setContactForm((prev) => ({
                      ...prev,
                      contact_type: e.target.value as ClientContactType,
                    }))}
                  >
                    {contactTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Titre</label>
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Ex: Pro, Instagram, WhatsApp"
                    value={contactForm.title}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Contact</label>
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Adresse mail, numéro, lien..."
                    value={contactForm.value}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, value: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleAddContact}
                  disabled={contactSaving || !contactForm.value.trim()}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    contactSaving || !contactForm.value.trim()
                      ? 'bg-blue-200 text-blue-700 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {contactSaving ? 'Ajout en cours...' : 'Ajouter'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {contactsLoading ? (
                <div className="flex items-center justify-center h-24">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-sm text-gray-500">Aucun contact ajouté.</div>
              ) : (
                contacts.map((contact) => {
                  const isEditingContact = editingContactId === contact.id;
                  const draft = isEditingContact ? contactDraft : null;
                  return (
                    <div key={contact.id} className="border rounded-lg p-4">
                      {isEditingContact && draft ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs font-medium text-gray-500">Type</label>
                              <select
                                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                                value={draft.contact_type}
                                onChange={(e) => setContactDraft((prev) => prev ? {
                                  ...prev,
                                  contact_type: e.target.value as ClientContactType,
                                } : prev)}
                              >
                                {contactTypeOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Titre</label>
                              <input
                                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                                value={draft.title}
                                onChange={(e) => setContactDraft((prev) => prev ? {
                                  ...prev,
                                  title: e.target.value,
                                } : prev)}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Contact</label>
                              <input
                                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                                value={draft.value}
                                onChange={(e) => setContactDraft((prev) => prev ? {
                                  ...prev,
                                  value: e.target.value,
                                } : prev)}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEditingContact}
                              className="px-3 py-1.5 rounded-md text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={handleUpdateContact}
                              disabled={contactSaving || !draft.value.trim()}
                              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                                contactSaving || !draft.value.trim()
                                  ? 'bg-blue-200 text-blue-700 cursor-not-allowed'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              Enregistrer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {contact.title?.trim() || contactTypeLabels[normalizeContactType(contact.contact_type)] || contact.contact_type}
                            </div>
                            <div className="text-sm text-gray-600">{contact.value}</div>
                            <div className="text-xs text-gray-400 mt-1">
                              {contactTypeLabels[normalizeContactType(contact.contact_type)] || contact.contact_type}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEditingContact(contact)}
                              className="px-3 py-1.5 rounded-md text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteContact(contact.id)}
                              disabled={contactDeletingId === contact.id}
                              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                                contactDeletingId === contact.id
                                  ? 'bg-red-100 text-red-500 cursor-not-allowed'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                              }`}
                            >
                              {contactDeletingId === contact.id ? 'Suppression...' : 'Supprimer'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'members' && client.client_type === 'company' && (
          <div className="p-6 space-y-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Interlocuteurs de l'entreprise</h3>
                  <p className="text-xs text-gray-500">Associez des clients existants ou créez-en de nouveaux pour cette entreprise.</p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveMembers}
                  disabled={membersSaving}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                    membersSaving ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {membersSaving ? 'Enregistrement...' : 'Enregistrer les liaisons'}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-gray-500">Contacts actuellement liés</div>
                  <div className="space-y-2">
                    {linkedMembers.length === 0 ? (
                      <div className="rounded-md border border-dashed border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">
                        Aucun interlocuteur lié pour le moment.
                      </div>
                    ) : (
                      linkedMembers.map((member) => (
                        <div key={member.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-3">
                          <div className="min-w-0">
                            <Link to={`/clients/${member.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                              {member.name}
                            </Link>
                            <div className="text-xs text-gray-500">{member.email || member.phone || '—'}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedMemberIds((prev) => prev.filter((entryId) => entryId !== member.id))}
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Retirer
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium text-gray-500">Associer des clients existants</div>
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Rechercher un client..."
                    className="mb-3 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white">
                    {filteredAvailableMembers.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-500">Aucun client disponible.</div>
                    ) : (
                      filteredAvailableMembers.map((member) => {
                        const checked = selectedMemberIds.includes(member.id);
                        return (
                          <label key={member.id} className="flex cursor-pointer items-start gap-3 border-b border-gray-100 px-3 py-3 last:border-b-0 hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setSelectedMemberIds((prev) => (
                                checked
                                  ? prev.filter((entryId) => entryId !== member.id)
                                  : [...prev, member.id]
                              ))}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900">{member.name}</div>
                              <div className="text-xs text-gray-500">{member.email || member.phone || member.company || '—'}</div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Créer un nouveau contact pour cette entreprise</h3>
              <p className="mt-1 text-xs text-gray-500">Le client sera créé et lié automatiquement.</p>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={newMemberForm.name}
                  onChange={(event) => setNewMemberForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Nom du contact"
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <input
                  type="email"
                  value={newMemberForm.email}
                  onChange={(event) => setNewMemberForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Email"
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <input
                  type="tel"
                  value={newMemberForm.phone}
                  onChange={(event) => setNewMemberForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Téléphone"
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={newMemberForm.address}
                  onChange={(event) => setNewMemberForm((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder="Adresse"
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateMember}
                  disabled={newMemberSaving || !newMemberForm.name.trim()}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                    newMemberSaving || !newMemberForm.name.trim()
                      ? 'bg-blue-300 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {newMemberSaving ? 'Création...' : 'Créer et lier'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientDetail;
