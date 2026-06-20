import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Download, Edit, FileDown, History, KeyRound, Mail, NotebookPen, Phone, RefreshCw, Save, Send, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { AddressSearchInput } from '../components/ui-kit';
import { computeTrustScore, type TrustScoreBreakdown } from '../utils/trustScore';
import toast from 'react-hot-toast';
import { Client, ClientContact, ClientContactType, ClientRental } from '../types/client';
import { useClients } from '../hooks/useClients';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../context/TranslationContext';

type TabId = 'info' | 'rentals' | 'contacts' | 'members' | 'financial';

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clients, updateClient, addClient, setCompanyClients, loading } = useClients();
  const { t } = useTranslation();
  const [client, setClient] = useState<Client | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    company_client_id: '',
    billing_address: '',
    billing_same_as_contact: true,
    default_delivery_address: '',
    internal_notes: '',
    tags: [] as string[],
    vat_number: '',
    siret: '',
    legal_form: '',
    share_capital: '' as string,
    rcs_number: '',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams.get('tab') as TabId | null;
    const valid: TabId[] = ['info', 'rentals', 'contacts', 'members', 'financial'];
    return valid.includes(t as TabId) ? t as TabId : 'info';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);
  const [rentals, setRentals] = useState<ClientRental[]>([]);
  const [rentalsLoading, setRentalsLoading] = useState(false);
  const [relatedRentals, setRelatedRentals] = useState<Array<ClientRental & { ownerName: string }>>([]);
  const [relatedRentalsLoading, setRelatedRentalsLoading] = useState(false);
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
  const [financialForm, setFinancialForm] = useState({ equipment_discount: 0, conditions: [] as string[] });
  const [newConditionInput, setNewConditionInput] = useState('');
  const [financialSaving, setFinancialSaving] = useState(false);
  const [trustScoreBreakdown, setTrustScoreBreakdown] = useState<TrustScoreBreakdown | null>(null);
  const [trustScoreComputing, setTrustScoreComputing] = useState(false);

  type PortalAccount = {
    id: string;
    email: string;
    must_change_password: boolean;
    created_at: string;
    activated_at: string | null;
    last_login_at: string | null;
  };
  const [portalAccount, setPortalAccount] = useState<PortalAccount | null | undefined>(undefined);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalSending, setPortalSending] = useState(false);
  const [portalResetting, setPortalResetting] = useState(false);

  const loadPortalAccount = useCallback(async (clientId: string) => {
    setPortalLoading(true);
    try {
      const res = await fetch(`/api/client-portal/account/${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setPortalAccount(data.account);
      }
    } finally {
      setPortalLoading(false);
    }
  }, []);

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

  const stats = useMemo(() => {
    const all = [...rentals, ...relatedRentals];
    const activeStatuses = ['pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'return_delivery', 'in_return', 'returned'];
    const activeList = all.filter((r) => activeStatuses.includes(r.status));
    return {
      total: all.length,
      revenue: all.reduce((s, r) => s + r.total_price, 0),
      active: activeList.length,
      activeRevenue: activeList.reduce((s, r) => s + r.total_price, 0),
      completed: all.filter((r) => ['completed', 'paid'].includes(r.status)).length,
    };
  }, [rentals, relatedRentals]);

  const allRentalsForDisplay = useMemo(() => {
    const own = rentals.map((r) => ({ ...r, ownerName: null as string | null }));
    return [...own, ...relatedRentals].sort(
      (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    );
  }, [rentals, relatedRentals]);

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const revenue = allRentalsForDisplay
        .filter((r) => {
          const rd = new Date(r.start_date);
          return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
        })
        .reduce((s, r) => s + r.total_price, 0);
      return {
        label: d.toLocaleDateString('fr-FR', { month: 'short' }),
        revenue,
      };
    });
  }, [allRentalsForDisplay]);

  const revenueByYear = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const n = allRentalsForDisplay
      .filter((r) => new Date(r.start_date).getFullYear() === currentYear)
      .reduce((s, r) => s + r.total_price, 0);
    const n1 = allRentalsForDisplay
      .filter((r) => new Date(r.start_date).getFullYear() === currentYear - 1)
      .reduce((s, r) => s + r.total_price, 0);
    const delta = n1 > 0 ? ((n - n1) / n1) * 100 : null;
    return { n, n1, delta, currentYear };
  }, [allRentalsForDisplay]);

  const companyOptions = useMemo(
    () => clients.filter((entry) => entry.client_type === 'company' && entry.id !== client?.id),
    [client?.id, clients]
  );

  const tagSuggestions = useMemo(() => {
    const defaults = ['Festival', 'Corporate', 'Régulier', 'Agence', 'ONG', 'Mariage', 'Spectacle', 'Conférence', 'Association'];
    const fromClients = clients.flatMap((c) => c.tags || []);
    return Array.from(new Set([...defaults, ...fromClients])).sort();
  }, [clients]);

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
    ));
  }, [availableMemberClients, memberSearch]);

  const tabs = useMemo<Array<{ id: TabId; name: string; icon: React.ComponentType<{ className?: string }> }>>(() => {
    const base = [
      { id: 'info' as const, name: 'Informations', icon: Edit },
      { id: 'rentals' as const, name: 'Historique', icon: History },
      { id: 'contacts' as const, name: 'Contacts', icon: Phone },
      { id: 'financial' as const, name: 'Financier', icon: TrendingUp },
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
      setFinancialForm({
        equipment_discount: foundClient.default_equipment_discount ?? 0,
        conditions: foundClient.financial_conditions ?? [],
      });
    }
  }, [id, navigate, clients, loading]);

  useEffect(() => {
    if (client?.client_type !== 'company' && activeTab === 'members') {
      setActiveTab('info');
    }
  }, [activeTab, client?.client_type]);

  useEffect(() => {
    if (client && client.client_type !== 'company') {
      void loadPortalAccount(client.id);
    }
  }, [client, loadPortalAccount]);

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

  useEffect(() => {
    if (!client) { setRelatedRentals([]); return; }
    let cancelled = false;

    const loadRelated = async () => {
      try {
        setRelatedRentalsLoading(true);

        if (client.client_type === 'company' && linkedMembers.length > 0) {
          const memberIds = linkedMembers.map((m) => m.id);
          const { data, error } = await supabase
            .from('rentals')
            .select('id, reference_code, title, start_date, end_date, total_price, status, client_id')
            .in('client_id', memberIds)
            .eq('client_represents_company', true)
            .order('start_date', { ascending: false });

          if (error) throw error;
          if (cancelled) return;

          const memberMap = new Map(linkedMembers.map((m) => [m.id, m.name]));
          setRelatedRentals(
            (data || []).map((row: any) => ({
              id: row.id,
              reference_code: row.reference_code ?? null,
              title: row.title ?? null,
              start_date: row.start_date,
              end_date: row.end_date,
              total_price: Number(row.total_price || 0),
              status: row.status,
              equipment: [],
              ownerName: memberMap.get(row.client_id) ?? 'Interlocuteur',
            }))
          );
        } else if (client.client_type === 'person' && client.company_client_id) {
          const { data, error } = await supabase
            .from('rentals')
            .select('id, reference_code, title, start_date, end_date, total_price, status')
            .eq('client_id', client.company_client_id)
            .order('start_date', { ascending: false });

          if (error) throw error;
          if (cancelled) return;

          const companyName = client.company_client?.name ?? 'Entreprise';
          setRelatedRentals(
            (data || []).map((row: any) => ({
              id: row.id,
              reference_code: row.reference_code ?? null,
              title: row.title ?? null,
              start_date: row.start_date,
              end_date: row.end_date,
              total_price: Number(row.total_price || 0),
              status: row.status,
              equipment: [],
              ownerName: companyName,
            }))
          );
        } else {
          setRelatedRentals([]);
        }
      } catch (err) {
        console.error('Error loading related rentals', err);
        if (!cancelled) setRelatedRentals([]);
      } finally {
        if (!cancelled) setRelatedRentalsLoading(false);
      }
    };

    loadRelated();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, client?.client_type, client?.company_client_id, linkedMembers]);

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

  const enterEditMode = () => {
    if (!client) return;
    setEditForm({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      company_client_id: client.company_client_id || '',
      billing_address: client.billing_address || '',
      billing_same_as_contact: !client.billing_address,
      default_delivery_address: client.default_delivery_address || '',
      internal_notes: client.internal_notes || '',
      tags: client.tags || [],
      vat_number: client.vat_number || '',
      siret: client.siret || '',
      legal_form: client.legal_form || '',
      share_capital: client.share_capital != null ? String(client.share_capital) : '',
      rcs_number: client.rcs_number || '',
    });
    setIsEditing(true);
  };

  const handleInlineSave = async () => {
    if (!client || editSaving) return;
    setEditSaving(true);
    try {
      await updateClient(client.id, {
        name: editForm.name.trim() || client.name,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        company_client_id: client.client_type !== 'company'
          ? (editForm.company_client_id || null)
          : null,
        billing_address: editForm.billing_same_as_contact
          ? null
          : (editForm.billing_address.trim() || null),
        default_delivery_address: editForm.default_delivery_address.trim() || null,
        internal_notes: editForm.internal_notes.trim() || null,
        tags: editForm.tags,
        ...(client.client_type === 'company' ? {
          vat_number: editForm.vat_number.trim() || null,
          siret: editForm.siret.trim() || null,
          legal_form: editForm.legal_form.trim() || null,
          share_capital: editForm.share_capital !== '' ? parseFloat(editForm.share_capital) || null : null,
          rcs_number: editForm.rcs_number.trim() || null,
        } : {}),
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating client:', error);
    } finally {
      setEditSaving(false);
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

  const handleExportCSV = () => {
    if (!client) return;
    const headers = ['Référence', 'Titre', 'Date début', 'Date fin', 'Statut', 'Montant (€)', 'Client'];
    const rows = allRentalsForDisplay.map((r) => [
      r.reference_code || r.id.slice(0, 6),
      r.title || '',
      r.start_date,
      r.end_date,
      statusLabels[r.status] ?? r.status,
      r.total_price.toFixed(2),
      r.ownerName || client.name,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_projets.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!client) return;
    const all = allRentalsForDisplay;
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const showOwner = client.client_type === 'company' || Boolean(client.company_client_id);
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Fiche client – ${esc(client.name)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#111827;margin:0;padding:32px;max-width:820px}
  h1{font-size:22px;font-weight:700;margin:0 0 4px}
  .meta{color:#6b7280;font-size:11px;margin-bottom:24px}
  .section{margin-bottom:24px}
  .stitle{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:12px}
  .field{display:flex;gap:12px;margin-bottom:5px}
  .fl{color:#6b7280;width:150px;flex-shrink:0}
  .stats{display:flex;gap:10px}
  .stat{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center}
  .sv{font-size:20px;font-weight:700}
  .sl{font-size:9px;color:#9ca3af;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead tr{background:#f9fafb}
  th{text-align:left;font-size:10px;font-weight:600;color:#6b7280;padding:6px 8px;border-bottom:1px solid #e5e7eb}
  td{padding:6px 8px;border-bottom:1px solid #f3f4f6}
  .tr{text-align:right}
  .tag{display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:10px;padding:1px 6px;font-size:9px}
  @media print{@page{margin:16mm}body{padding:0;max-width:100%}}
</style>
</head>
<body>
<h1>${esc(client.name)}</h1>
<div class="meta">${esc(client.client_type === 'company' ? 'Entreprise' : 'Client particulier')}${client.company_client?.name ? ' · ' + esc(client.company_client.name) : ''}${client.created_at ? ' · Client depuis le ' + new Date(client.created_at).toLocaleDateString('fr-FR') : ''}</div>
<div class="section">
  <div class="stitle">Coordonnées</div>
  ${client.email ? `<div class="field"><span class="fl">Email</span><span>${esc(client.email)}</span></div>` : ''}
  ${client.phone ? `<div class="field"><span class="fl">Téléphone</span><span>${esc(client.phone)}</span></div>` : ''}
  ${client.address ? `<div class="field"><span class="fl">Adresse</span><span>${esc(client.address)}</span></div>` : ''}
  ${client.billing_address ? `<div class="field"><span class="fl">Adresse de facturation</span><span>${esc(client.billing_address)}</span></div>` : ''}
  ${!client.email && !client.phone && !client.address ? '<p style="color:#9ca3af">Aucune coordonnée renseignée.</p>' : ''}
</div>
<div class="section">
  <div class="stitle">Vue d'ensemble</div>
  <div class="stats">
    <div class="stat"><div class="sv">${stats.total}</div><div class="sl">Projets</div></div>
    <div class="stat"><div class="sv">${stats.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div><div class="sl">CA total</div></div>
    <div class="stat"><div class="sv">${stats.active}</div><div class="sl">En cours</div></div>
    <div class="stat"><div class="sv">${stats.completed}</div><div class="sl">Terminés / payés</div></div>
  </div>
</div>
${all.length > 0
  ? `<div class="section"><div class="stitle">Projets (${all.length})</div><table><thead><tr><th>Référence</th><th>Titre</th><th>Début</th><th>Fin</th><th>Statut</th>${showOwner ? '<th>Via</th>' : ''}<th class="tr">Montant</th></tr></thead><tbody>${
    all.map((r) => `<tr><td>${esc(r.reference_code || r.id.slice(0, 6))}</td><td>${esc(r.title || '—')}</td><td>${new Date(r.start_date).toLocaleDateString('fr-FR')}</td><td>${new Date(r.end_date).toLocaleDateString('fr-FR')}</td><td>${esc(statusLabels[r.status] ?? r.status)}</td>${showOwner ? `<td>${r.ownerName ? '<span class="tag">' + esc(r.ownerName) + '</span>' : '—'}</td>` : ''}<td class="tr">${r.total_price.toFixed(2)} €</td></tr>`).join('')
  }</tbody></table></div>`
  : '<p style="color:#9ca3af">Aucun projet associé.</p>'}
</body>
</html>`;
    const win = window.open('', '_blank', 'width=900,height=800');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 300);
    }
  };

  const handleComputeTrustScore = useCallback(async () => {
    if (!client || trustScoreComputing) return;
    setTrustScoreComputing(true);
    try {
      const memberIds = linkedMembers.map((m) => m.id);
      const result = await computeTrustScore(client.id, memberIds);
      if (!result.isNewClient) {
        setTrustScoreBreakdown(result.breakdown);
        await updateClient(client.id, {
          trust_score: result.score,
          trust_score_computed_at: result.computedAt,
        });
      } else {
        setTrustScoreBreakdown(null);
        toast('Nouveau client — pas encore assez de données pour calculer le score.');
      }
    } catch (err) {
      console.error('Error computing trust score:', err);
      toast.error('Erreur lors du calcul du score');
    } finally {
      setTrustScoreComputing(false);
    }
  }, [client, trustScoreComputing, linkedMembers, updateClient]);

  const handleSaveFinancial = async () => {
    if (!client || financialSaving) return;
    setFinancialSaving(true);
    try {
      await updateClient(client.id, {
        default_equipment_discount: Math.min(100, Math.max(0, financialForm.equipment_discount)),
        financial_conditions: financialForm.conditions,
      });
    } catch (err) {
      console.error('Error saving financial conditions:', err);
    } finally {
      setFinancialSaving(false);
    }
  };

  const handleSendCredentials = async () => {
    if (!client || portalSending) return;
    setPortalSending(true);
    try {
      const res = await fetch(`/api/client-portal/account/${client.id}/send-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: client.email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || data?.error || 'Erreur lors de l\'envoi');
      toast.success(`Identifiants envoyés à ${data.email}`);
      await loadPortalAccount(client.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible d\'envoyer les identifiants');
    } finally {
      setPortalSending(false);
    }
  };

  const handleResetPassword = async () => {
    if (!client || portalResetting) return;
    setPortalResetting(true);
    try {
      const res = await fetch(`/api/client-portal/account/${client.id}/reset-password`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Erreur lors de la réinitialisation');
      toast.success('Mot de passe provisoire envoyé par e-mail');
      await loadPortalAccount(client.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de réinitialiser le mot de passe');
    } finally {
      setPortalResetting(false);
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
              {client.client_number != null && (
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-gray-400 select-all">
                    #{String(client.client_number).padStart(4, '0')}
                  </span>
                  {client.client_type === 'person' && (() => {
                    const s = client.trust_score ?? null;
                    const c = 2 * Math.PI * 10;
                    const color = s === null ? '#d1d5db'
                      : s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : s >= 40 ? '#f97316' : '#ef4444';
                    return (
                      <span className="inline-flex items-center gap-1.5" title={s !== null ? `Score de confiance : ${s}/100` : 'Score non calculé'}>
                        <svg width="22" height="22" viewBox="0 0 26 26" className="-rotate-90">
                          <circle cx="13" cy="13" r="10" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                          {s !== null && (
                            <circle
                              cx="13" cy="13" r="10" fill="none"
                              stroke={color} strokeWidth="3"
                              strokeDasharray={c}
                              strokeDashoffset={c * (1 - s / 100)}
                              strokeLinecap="round"
                            />
                          )}
                        </svg>
                        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
                          {s !== null ? `${s}/100` : '--/100'}
                        </span>
                      </span>
                    );
                  })()}
                </span>
              )}
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
        <div className="flex items-center gap-2">
          {isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={isEditing ? handleInlineSave : enterEditMode}
            disabled={editSaving}
            className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white disabled:opacity-50 ${
              isEditing ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isEditing ? (
              <>
                <Save className="h-4 w-4 mr-2" />
                {editSaving ? 'Enregistrement…' : 'Enregistrer'}
              </>
            ) : (
              <>
                <Edit className="h-4 w-4 mr-2" />
                {client.client_type === 'company' ? "Modifier l'entreprise" : 'Modifier le client'}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200 px-4 sm:px-6">
        <nav className="-mb-px flex space-x-6 sm:space-x-8">
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

      <div>
        {activeTab === 'info' && (
          <>
            <div className="bg-gray-100 rounded-xl p-6 space-y-4">
              <div className="flex flex-col xl:flex-row gap-4 items-stretch">

                {/* ── Main info card ── */}
                <div className="flex-1 min-w-0 bg-white rounded-lg p-6 flex flex-col gap-6">

                  {/* Section — Identité */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {client.client_type === 'company' ? 'Entreprise' : 'Identité'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-gray-600">
                          {client.client_type === 'company' ? "Nom de l'entreprise" : 'Nom complet'}
                        </p>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 font-semibold">{client.name}</p>
                        )}
                      </div>
                      {client.client_type === 'person' && (
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-gray-600">Entreprise liée</p>
                          {isEditing ? (
                            <select
                              value={editForm.company_client_id}
                              onChange={(e) => setEditForm((f) => ({ ...f, company_client_id: e.target.value }))}
                              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">Aucune</option>
                              {companyOptions.map((co) => (
                                <option key={co.id} value={co.id}>{co.name}</option>
                              ))}
                            </select>
                          ) : client.company_client ? (
                            <Link
                              to={`/clients/${client.company_client.id}`}
                              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              <Building2 className="h-3.5 w-3.5" />
                              {client.company_client.name}
                            </Link>
                          ) : (
                            <p className="text-sm text-gray-400">—</p>
                          )}
                        </div>
                      )}
                      {client.client_type === 'company' && (
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-gray-600">Interlocuteurs</p>
                          <button
                            type="button"
                            onClick={() => setActiveTab('members')}
                            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            <Users className="h-3.5 w-3.5" />
                            {linkedMembers.length} interlocuteur{linkedMembers.length !== 1 ? 's' : ''}
                          </button>
                        </div>
                      )}
                      {client.client_number != null && (
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-gray-600">N° de compte</p>
                          <p className="font-mono text-sm font-medium text-gray-700 select-all">
                            #{String(client.client_number).padStart(4, '0')}
                          </p>
                        </div>
                      )}
                      {client.created_at && (
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-gray-600">Client depuis</p>
                          <p className="text-sm text-gray-900">
                            {new Date(client.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                        </div>
                      )}
                      <div className="md:col-span-2 space-y-1.5">
                        <p className="text-sm font-medium text-gray-600">Étiquettes</p>
                        {isEditing ? (
                          <div className="space-y-2">
                            {editForm.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {editForm.tags.map((tag) => (
                                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                                    {tag}
                                    <button
                                      type="button"
                                      onClick={() => setEditForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))}
                                      className="ml-0.5 leading-none hover:text-violet-900"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {tagSuggestions.filter((t) => !editForm.tags.includes(t)).map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => setEditForm((f) => ({ ...f, tags: [...f.tags, tag] }))}
                                  className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                                >
                                  + {tag}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              placeholder="Nouvelle étiquette… (Entrée pour ajouter)"
                              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const val = e.currentTarget.value.trim();
                                  if (val && !editForm.tags.includes(val)) {
                                    setEditForm((f) => ({ ...f, tags: [...f.tags, val] }));
                                  }
                                  e.currentTarget.value = '';
                                }
                              }}
                            />
                          </div>
                        ) : (client.tags && client.tags.length > 0) ? (
                          <div className="flex flex-wrap gap-1.5">
                            {client.tags.map((tag) => (
                              <span key={tag} className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section — Informations légales (entreprises uniquement) */}
                  {client.client_type === 'company' && (
                    <div className="border-t border-gray-100 pt-6 space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Informations légales</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Forme juridique */}
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-gray-600">Forme juridique</p>
                          {isEditing ? (
                            <select
                              value={editForm.legal_form}
                              onChange={(e) => setEditForm((f) => ({ ...f, legal_form: e.target.value }))}
                              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">— Non renseigné —</option>
                              {['SAS', 'SASU', 'SARL', 'EURL', 'SA', 'SNC', 'SCI', 'Association loi 1901', 'Auto-entrepreneur', 'EI', 'EIRL', 'GIE', 'Autre'].map((f) => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-sm text-gray-900">{client.legal_form || <span className="text-gray-400">—</span>}</p>
                          )}
                        </div>

                        {/* Capital social */}
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-gray-600">Capital social</p>
                          {isEditing ? (
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                placeholder="Ex : 10000"
                                value={editForm.share_capital}
                                onChange={(e) => setEditForm((f) => ({ ...f, share_capital: e.target.value }))}
                                className="block w-full rounded-md border border-gray-300 px-3 py-1.5 pr-8 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="pointer-events-none absolute right-3 top-1.5 text-sm text-gray-400">€</span>
                            </div>
                          ) : client.share_capital != null ? (
                            <p className="text-sm text-gray-900 tabular-nums">
                              {client.share_capital.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €
                            </p>
                          ) : (
                            <p className="text-sm text-gray-400">—</p>
                          )}
                        </div>

                        {/* SIRET / SIREN */}
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-gray-600">SIRET / SIREN</p>
                          {isEditing ? (
                            <input
                              type="text"
                              placeholder="Ex : 123 456 789 00012"
                              value={editForm.siret}
                              onChange={(e) => setEditForm((f) => ({ ...f, siret: e.target.value }))}
                              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <p className="text-sm font-mono text-gray-900 select-all">{client.siret || <span className="font-sans text-gray-400">—</span>}</p>
                          )}
                        </div>

                        {/* TVA intracommunautaire */}
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-gray-600">N° TVA intracommunautaire</p>
                          {isEditing ? (
                            <input
                              type="text"
                              placeholder="Ex : FR12345678901"
                              value={editForm.vat_number}
                              onChange={(e) => setEditForm((f) => ({ ...f, vat_number: e.target.value.toUpperCase() }))}
                              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <p className="text-sm font-mono text-gray-900 select-all">{client.vat_number || <span className="font-sans text-gray-400">—</span>}</p>
                          )}
                        </div>

                        {/* RCS */}
                        <div className="space-y-1.5 md:col-span-2">
                          <p className="text-sm font-medium text-gray-600">Numéro RCS</p>
                          {isEditing ? (
                            <input
                              type="text"
                              placeholder="Ex : Paris B 123 456 789"
                              value={editForm.rcs_number}
                              onChange={(e) => setEditForm((f) => ({ ...f, rcs_number: e.target.value }))}
                              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <p className="text-sm font-mono text-gray-900 select-all">{client.rcs_number || <span className="font-sans text-gray-400">—</span>}</p>
                          )}
                        </div>

                      </div>
                    </div>
                  )}

                  {/* Section — Coordonnées */}
                  <div className="border-t border-gray-100 pt-6 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Coordonnées</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-gray-600">Email</p>
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                            className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : client.email ? (
                          <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
                            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                            {client.email}
                          </a>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-gray-600">Téléphone</p>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editForm.phone}
                            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                            className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : client.phone ? (
                          <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
                            <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                            {client.phone}
                          </a>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section — Adresses */}
                  <div className="border-t border-gray-100 pt-6 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Adresses</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-gray-600">Adresse de contact</p>
                        {isEditing ? (
                          <AddressSearchInput
                            value={editForm.address}
                            onChange={(v) => setEditForm((f) => ({ ...f, address: v }))}
                            placeholder="Adresse de contact"
                          />
                        ) : client.address ? (
                          <p className="text-sm text-gray-900 whitespace-pre-line">{client.address}</p>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-600">Adresse de facturation</p>
                          {isEditing && (
                            <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={editForm.billing_same_as_contact}
                                onChange={(e) => setEditForm((f) => ({ ...f, billing_same_as_contact: e.target.checked, billing_address: e.target.checked ? '' : f.billing_address }))}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              Identique au contact
                            </label>
                          )}
                        </div>
                        {isEditing ? (
                          editForm.billing_same_as_contact ? (
                            <p className="text-sm text-gray-400 italic">Identique à l'adresse de contact</p>
                          ) : (
                            <AddressSearchInput
                              value={editForm.billing_address}
                              onChange={(v) => setEditForm((f) => ({ ...f, billing_address: v }))}
                              placeholder="Adresse de facturation"
                            />
                          )
                        ) : client.billing_address ? (
                          <p className="text-sm text-gray-900 whitespace-pre-line">{client.billing_address}</p>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Identique à l'adresse de contact</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-gray-600">Livraison par défaut</p>
                        {isEditing ? (
                          <AddressSearchInput
                            value={editForm.default_delivery_address}
                            onChange={(v) => setEditForm((f) => ({ ...f, default_delivery_address: v }))}
                            placeholder="Adresse de livraison par défaut"
                          />
                        ) : client.default_delivery_address ? (
                          <p className="text-sm text-gray-900 whitespace-pre-line">{client.default_delivery_address}</p>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section — Notes internes */}
                  {(isEditing || client.internal_notes) && (
                    <div className="border-t border-amber-100 pt-6 space-y-3">
                      <div className="flex items-center gap-2">
                        <NotebookPen className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <h3 className="text-lg font-semibold text-gray-900">Notes internes</h3>
                        <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          Non visible sur les documents
                        </span>
                      </div>
                      {isEditing ? (
                        <textarea
                          value={editForm.internal_notes}
                          onChange={(e) => setEditForm((f) => ({ ...f, internal_notes: e.target.value }))}
                          rows={4}
                          placeholder="Ex : client difficile, demander acompte systématiquement…"
                          className="block w-full rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none placeholder:text-gray-400"
                        />
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{client.internal_notes}</p>
                      )}
                    </div>
                  )}

                  {/* Section — Autres contacts (view only) */}
                  {!isEditing && (contactsLoading || previewContacts.length > 0) && (
                    <div className="border-t border-gray-100 pt-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Autres contacts</h3>
                      {contactsLoading ? (
                        <p className="text-sm text-gray-400">Chargement…</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                          {previewContacts.map((contact) => (
                            <div key={contact.id}>
                              <p className="text-sm font-medium text-gray-500">
                                {contact.title?.trim() || contactTypeLabels[normalizeContactType(contact.contact_type)] || contact.contact_type}
                              </p>
                              <p className="mt-0.5 text-sm text-gray-900">{contact.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {contacts.length > previewContacts.length && (
                        <p className="mt-3 text-xs text-gray-400">+{contacts.length - previewContacts.length} contact(s) supplémentaire(s)</p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Portal card (non-company) ── */}
                {client.client_type !== 'company' && (
                  <div className="xl:w-72 flex-shrink-0 bg-white rounded-lg overflow-hidden flex flex-col">

                    {/* Header */}
                    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-base font-semibold text-gray-900">Espace client</span>
                      <span className="ml-auto">
                        {portalAccount === undefined || portalLoading ? (
                          <span className="text-xs text-gray-400">…</span>
                        ) : portalAccount === null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">Inactif</span>
                        ) : !portalAccount.must_change_password ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Activé
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            En attente
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="p-5 flex flex-col gap-4 flex-1">
                      {portalAccount && (
                        <div className="space-y-2.5">
                          <div>
                            <p className="text-sm font-medium text-gray-500">Identifiant</p>
                            <p className="mt-0.5 text-sm text-gray-900 font-medium truncate">{portalAccount.email}</p>
                          </div>
                          {portalAccount.activated_at && (
                            <div>
                              <p className="text-sm font-medium text-gray-500">Activé le</p>
                              <p className="mt-0.5 text-sm text-gray-900">{new Date(portalAccount.activated_at).toLocaleDateString('fr-FR')}</p>
                            </div>
                          )}
                          {portalAccount.last_login_at && (
                            <div>
                              <p className="text-sm font-medium text-gray-500">Dernière connexion</p>
                              <p className="mt-0.5 text-sm text-gray-900">{new Date(portalAccount.last_login_at).toLocaleDateString('fr-FR')}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {!client.email && !portalAccount && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                          E-mail manquant — renseignez-en un pour activer l'espace.
                        </div>
                      )}

                      {!portalAccount && client.email && (
                        <p className="text-sm text-gray-500">
                          Envoyez les identifiants pour créer l'accès de ce client à son espace.
                        </p>
                      )}

                      <div className="flex flex-col gap-2 mt-auto pt-2">
                        <button
                          type="button"
                          onClick={handleSendCredentials}
                          disabled={portalSending || !client.email || (!!portalAccount && !portalAccount.must_change_password)}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {portalSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          {portalAccount ? 'Renvoyer les identifiants' : 'Envoyer les identifiants'}
                        </button>
                        <button
                          type="button"
                          onClick={handleResetPassword}
                          disabled={portalResetting || !portalAccount || !!portalAccount.must_change_password}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {portalResetting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                          Réinitialiser le mot de passe
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            {/* ── Card Vue d'ensemble ── */}
            <div className="bg-white rounded-lg p-6 space-y-6">

              {/* Stats */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-4">Vue d'ensemble</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Projets au total', value: String(stats.total) },
                    { label: 'CA total', value: stats.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' },
                    { label: 'En cours', value: String(stats.active) },
                    { label: 'Terminés / payés', value: String(stats.completed) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
                      <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                      <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export */}
              <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <FileDown className="h-4 w-4 text-gray-500" />
                  Exporter fiche PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Download className="h-4 w-4 text-gray-500" />
                  Exporter liste CSV
                </button>
              </div>
            </div>
          </div>
          </>
        )}

        {activeTab === 'rentals' && (
          <div className="bg-white shadow rounded-lg p-6">
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
          <div className="bg-white shadow rounded-lg p-6 space-y-6">
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
          <div className="bg-white shadow rounded-lg p-6 space-y-6">
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
                              <div className="text-xs text-gray-500">{member.email || member.phone || '—'}</div>
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
        {activeTab === 'financial' && (() => {
          const maxRevenue = Math.max(...monthlyRevenue.map((m) => m.revenue), 1);
          const bestMonth = monthlyRevenue.reduce(
            (best, m) => m.revenue > best.revenue ? m : best,
            { label: '—', revenue: 0 }
          );
          const statusBreakdown = [
            { label: 'En cours', statuses: ['pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'return_delivery', 'in_return', 'returned'], color: 'bg-blue-500' },
            { label: 'Terminés / payés', statuses: ['completed', 'paid'], color: 'bg-emerald-500' },
            { label: 'Annulés', statuses: ['cancelled'], color: 'bg-red-400' },
          ].map((g) => {
            const list = allRentalsForDisplay.filter((r) => g.statuses.includes(r.status));
            return { ...g, count: list.length, revenue: list.reduce((s, r) => s + r.total_price, 0) };
          });

          return (
            <div className="space-y-4">

              {/* ── Card statistiques ── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                <h3 className="text-base font-semibold text-gray-900">Statistiques financières</h3>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* CA total généré */}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs text-gray-400 mb-1">CA total généré</p>
                    <p className="text-lg font-bold text-gray-900 tabular-nums">
                      {stats.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </p>
                  </div>
                  {/* Nombre de projets */}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs text-gray-400 mb-1">Nombre de projets</p>
                    <p className="text-lg font-bold text-gray-900 tabular-nums">{stats.total}</p>
                    {stats.total > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{stats.active} en cours · {stats.completed} terminés</p>
                    )}
                  </div>
                  {/* Valeur moyenne */}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs text-gray-400 mb-1">Valeur moyenne</p>
                    <p className="text-lg font-bold text-gray-900 tabular-nums">
                      {stats.total > 0
                        ? (stats.revenue / stats.total).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
                        : '—'}
                    </p>
                  </div>
                  {/* Évolution N vs N-1 */}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 col-span-2 sm:col-span-3">
                    <p className="text-xs text-gray-400 mb-2">
                      Évolution — {revenueByYear.currentYear} vs {revenueByYear.currentYear - 1}
                    </p>
                    <div className="flex items-center gap-6 flex-wrap">
                      <div>
                        <p className="text-[10px] text-gray-400 mb-0.5">{revenueByYear.currentYear}</p>
                        <p className="text-base font-bold text-gray-900 tabular-nums">
                          {revenueByYear.n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 mb-0.5">{revenueByYear.currentYear - 1}</p>
                        <p className="text-base font-bold text-gray-900 tabular-nums">
                          {revenueByYear.n1.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </p>
                      </div>
                      {revenueByYear.delta !== null ? (
                        <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${
                          revenueByYear.delta >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                        }`}>
                          <span>{revenueByYear.delta >= 0 ? '▲' : '▼'}</span>
                          <span className="tabular-nums">{Math.abs(revenueByYear.delta).toFixed(1)} %</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Pas de données {revenueByYear.currentYear - 1}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bar chart CA mensuel */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">CA mensuel — 12 derniers mois</p>
                  {rentalsLoading || relatedRentalsLoading ? (
                    <p className="text-sm text-gray-400">Chargement…</p>
                  ) : (
                    <div className="flex items-end gap-1.5 h-32">
                      {monthlyRevenue.map((m) => {
                        const pct = maxRevenue > 0 ? m.revenue / maxRevenue : 0;
                        const barH = Math.max(pct * 96, m.revenue > 0 ? 4 : 2);
                        return (
                          <div key={m.label} className="flex-1 flex flex-col items-center gap-1 group">
                            <div className="relative w-full flex items-end justify-center" style={{ height: 100 }}>
                              {m.revenue > 0 && (
                                <span className="absolute -top-5 text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tabular-nums">
                                  {m.revenue.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                                </span>
                              )}
                              <div
                                className={`w-full rounded-t transition-all ${m.revenue > 0 ? 'bg-blue-500' : 'bg-gray-100'}`}
                                style={{ height: barH }}
                              />
                            </div>
                            <span className="text-[9px] text-gray-400 truncate w-full text-center">{m.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Répartition par statut */}
                {stats.total > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Répartition par statut</p>
                    <div className="space-y-2.5">
                      {statusBreakdown.filter((g) => g.count > 0).map((g) => (
                        <div key={g.label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full ${g.color}`} />
                              <span className="text-gray-600">{g.label}</span>
                              <span className="text-gray-400">({g.count})</span>
                            </div>
                            <span className="font-medium text-gray-700 tabular-nums">
                              {g.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${g.color} transition-all`}
                              style={{ width: `${stats.total > 0 ? (g.count / stats.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* ── Card conditions financières ── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Conditions financières par défaut</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Ces conditions sont pré-appliquées lors de la création d'un projet pour ce client.
                    </p>
                  </div>

                  <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {/* Réduction équipements */}
                    <div className="flex items-center justify-between px-4 py-4 gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Réduction sur équipements</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Appliquée sur chaque ligne d'équipement individuellement — pas sur la remise globale de la facture
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={financialForm.equipment_discount}
                          onChange={(e) => setFinancialForm((f) => ({
                            ...f,
                            equipment_discount: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                          }))}
                          className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-right font-mono tabular-nums shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-500 w-4">%</span>
                      </div>
                    </div>

                    {/* Conditions spéciales */}
                    <div className="px-4 py-4 space-y-3">
                      <p className="text-sm font-medium text-gray-900">Conditions spéciales</p>

                      {/* Liste existante */}
                      {financialForm.conditions.length > 0 && (
                        <ul className="space-y-1.5">
                          {financialForm.conditions.map((cond, idx) => (
                            <li key={idx} className="flex items-center gap-2 rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
                              <span className="flex-1 text-sm text-gray-700">{cond}</span>
                              <button
                                type="button"
                                onClick={() => setFinancialForm((f) => ({ ...f, conditions: f.conditions.filter((_, i) => i !== idx) }))}
                                className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                                aria-label="Supprimer"
                              >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Suggestions rapides */}
                      {(() => {
                        const suggestions = [
                          "Pas d'échéancier",
                          'Paiement comptant exigé',
                          'Acompte 30 %',
                          'Acompte 50 %',
                          'Paiement 30 j fin de mois',
                          'Paiement 60 j fin de mois',
                          'Pas de caution matériel',
                          'Tarif préférentiel négocié',
                          'Exonéré TVA (auto-liquidation)',
                        ].filter((s) => !financialForm.conditions.includes(s));
                        if (suggestions.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1.5">
                            {suggestions.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setFinancialForm((f) => ({ ...f, conditions: [...f.conditions, s] }))}
                                className="rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                + {s}
                              </button>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Saisie libre */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ajouter une condition personnalisée…"
                          value={newConditionInput}
                          onChange={(e) => setNewConditionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = newConditionInput.trim();
                              if (val && !financialForm.conditions.includes(val)) {
                                setFinancialForm((f) => ({ ...f, conditions: [...f.conditions, val] }));
                              }
                              setNewConditionInput('');
                            }
                          }}
                          className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = newConditionInput.trim();
                            if (val && !financialForm.conditions.includes(val)) {
                              setFinancialForm((f) => ({ ...f, conditions: [...f.conditions, val] }));
                            }
                            setNewConditionInput('');
                          }}
                          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>
                  </div>

                  {financialForm.equipment_discount > 0 && (
                    <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
                      À la création d'un projet, chaque ligne d'équipement sera automatiquement remisée de{' '}
                      <span className="font-semibold">{financialForm.equipment_discount} %</span>.
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveFinancial}
                      disabled={financialSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {financialSaving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>

                {/* ── Card score de confiance ── */}
                {client.client_type === 'person' && (() => {
                  const score = client.trust_score ?? null;
                  const circumference = 2 * Math.PI * 42;
                  const scoreColor = score === null ? '#d1d5db'
                    : score >= 80 ? '#10b981'
                    : score >= 60 ? '#f59e0b'
                    : score >= 40 ? '#f97316'
                    : '#ef4444';
                  const scoreLabel = score === null ? null
                    : score >= 80 ? 'Excellent'
                    : score >= 60 ? 'Bon'
                    : score >= 40 ? 'Moyen'
                    : 'Critique';
                  const scoreLabelClass = score === null ? ''
                    : score >= 80 ? 'text-emerald-600'
                    : score >= 60 ? 'text-amber-500'
                    : score >= 40 ? 'text-orange-500'
                    : 'text-red-500';
                  const strokeDashoffset = score !== null
                    ? circumference * (1 - score / 100)
                    : circumference;
                  const factors = trustScoreBreakdown ? [
                    trustScoreBreakdown.payment,
                    trustScoreBreakdown.returnCompleteness,
                    trustScoreBreakdown.returnPunctuality,
                    trustScoreBreakdown.maintenance,
                  ] : null;

                  return (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Score de confiance</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Fiabilité de paiement, retours et SAV sur locations uniquement.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleComputeTrustScore}
                          disabled={trustScoreComputing}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${trustScoreComputing ? 'animate-spin' : ''}`} />
                          {score !== null ? 'Recalculer' : 'Calculer'}
                        </button>
                      </div>

                      {/* Gauge + label */}
                      <div className="flex items-center gap-5">
                        <div className="relative h-24 w-24 flex-shrink-0">
                          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                            <circle cx="50" cy="50" r="42" fill="none" stroke="#f3f4f6" strokeWidth="9" />
                            <circle
                              cx="50" cy="50" r="42" fill="none"
                              stroke={scoreColor} strokeWidth="9"
                              strokeDasharray={circumference}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            {trustScoreComputing ? (
                              <RefreshCw className="h-5 w-5 animate-spin text-gray-300" />
                            ) : score !== null ? (
                              <>
                                <span className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{score}</span>
                                <span className="text-[10px] text-gray-400 mt-0.5">/100</span>
                              </>
                            ) : (
                              <span className="text-2xl font-bold text-gray-300">—</span>
                            )}
                          </div>
                        </div>
                        <div>
                          {scoreLabel && (
                            <p className={`text-xl font-bold ${scoreLabelClass}`}>{scoreLabel}</p>
                          )}
                          {!scoreLabel && !trustScoreComputing && (
                            <p className="text-sm text-gray-400">Score non calculé</p>
                          )}
                          {client.trust_score_computed_at && (
                            <p className="text-xs text-gray-400 mt-1">
                              Calculé le{' '}
                              {new Date(client.trust_score_computed_at).toLocaleDateString('fr-FR', {
                                day: 'numeric', month: 'long', year: 'numeric',
                              })}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Breakdown par facteur */}
                      {factors && (
                        <div className="space-y-3.5 border-t border-gray-100 pt-4">
                          {factors.map((factor) => {
                            const pct = factor.max > 0 ? factor.score / factor.max : 0;
                            const barColor = pct >= 0.8 ? '#10b981' : pct >= 0.5 ? '#f59e0b' : '#ef4444';
                            return (
                              <div key={factor.label} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-gray-700">{factor.label}</span>
                                  <span className="tabular-nums text-gray-500 font-mono">{factor.score}/{factor.max}</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${pct * 100}%`, backgroundColor: barColor }}
                                  />
                                </div>
                                <p className="text-[10px] text-gray-400">{factor.detail}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Call to action si pas encore calculé */}
                      {!trustScoreComputing && score === null && !factors && (
                        <p className="text-center text-xs text-gray-400 pb-1">
                          Cliquez sur "Calculer" pour analyser l'historique de ce client.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default ClientDetail;
