import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Search, Filter, Archive, BarChart3, Inbox, ChevronRight, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import RentalsTable from '../components/rentals/RentalsTable';
// import RentalCreateTabs from '../components/rentals/RentalCreateTabs';
import { useRentals } from '../hooks/useRentals';
import { useClients } from '../hooks/useClients';
import { useCompanySettings } from '../hooks/useCompanySettings';
import ConfirmDialog from '../components/common/ConfirmDialog';
// import RentalCreateModeModal from '../components/rentals/RentalCreateModeModal';
import RentalCreateWizard from '../components/rentals/RentalCreateWizard';
import { useAuth } from '../context/AuthContext';
import { hasPerm } from '../utils/perm';
import { Rental, RentalCreatePayload } from '../types/rental';
import { useTranslation } from '../context/TranslationContext';
import { CalendarMonth } from '../components/ui-kit';
import { computeRentalTotals } from '../utils/rentalTotals';
import { format, differenceInCalendarDays } from 'date-fns';
import { fr as dateFnsFr, enUS as dateFnsEn } from 'date-fns/locale';
import { Users, Package, FileText, MapPin, CheckCircle, Clock, Banknote, FileCheck2, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import RentalAvailabilityWhatIfModal from '../components/rentals/RentalAvailabilityWhatIfModal';

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

type PortalRequest = {
  id: string;
  client_id: string;
  status: 'pending' | 'converted' | 'rejected';
  start_date: string;
  end_date: string;
  message: string | null;
  equipment_items: { equipment_id: string; name: string; quantity: number }[];
  created_at: string;
  clients?: { id: string; name: string; email: string } | null;
};

const colorToRgb = (value?: string | null) => {
  if (!value) return { r: 37, g: 99, b: 235 };
  const hex = value.replace('#', '').trim();
  const normalized = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  if (normalized.length !== 6) return { r: 37, g: 99, b: 235 };
  const int = Number.parseInt(normalized, 16);
  if (Number.isNaN(int)) return { r: 37, g: 99, b: 235 };
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

const toRgba = (rgb: { r: number; g: number; b: number }, alpha: number) =>
  `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

const DEFAULT_STATUS_FILTER: Array<'pending' | 'confirmed' | 'preparing' | 'in_progress' | 'delivered' | 'returned' | 'completed' | 'paid' | 'cancelled'> = [
  'pending',
  'confirmed',
  'preparing',
  'in_progress',
  'delivered',
  'returned',
  'completed',
  'paid',
  'cancelled',
];

const RentalsPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<'wizard'>('wizard');
  const [showCancel, setShowCancel] = useState(false);
  const {
    rentals,
    loading: rentalsLoading,
    addRental,
    deleteRentalsBulk,
    archiveRentalsBulk,
    purgeRentalsBulk,
    getRentalsWithPayments,
    getRentalsPaymentTotals,
    restoreRentalStatus,
  } = useRentals();
  const { clients, loading: clientsLoading } = useClients();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  // Applied filters (used for filtering the list)
  const [filterTypes, setFilterTypes] = useState<Set<'rental' | 'service' | 'sale'>>(new Set(['rental', 'service', 'sale']));
  const [filterStatuses, setFilterStatuses] = useState<
    Set<'pending' | 'confirmed' | 'preparing' | 'in_progress' | 'delivered' | 'returned' | 'completed' | 'paid' | 'cancelled' | 'archived'>
  >(new Set(DEFAULT_STATUS_FILTER));
  const [amountMin, setAmountMin] = useState<string>('');
  const [amountMax, setAmountMax] = useState<string>('');
  const [filterClientId, setFilterClientId] = useState<string>('');
  // UI (pending) filters inside the popover
  const [uiTypes, setUiTypes] = useState<Set<'rental' | 'service' | 'sale'>>(new Set(['rental', 'service', 'sale']));
  const [uiStatuses, setUiStatuses] = useState<
    Set<'pending' | 'confirmed' | 'preparing' | 'in_progress' | 'delivered' | 'returned' | 'completed' | 'paid' | 'cancelled' | 'archived'>
  >(new Set(DEFAULT_STATUS_FILTER));
  const [uiAmountMin, setUiAmountMin] = useState<string>('');
  const [uiAmountMax, setUiAmountMax] = useState<string>('');
  const [uiClientId, setUiClientId] = useState<string>('');
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [showWhatIfModal, setShowWhatIfModal] = useState(false);
  const [archivedTotalsLoading, setArchivedTotalsLoading] = useState(false);
  const [archivedPaymentTotals, setArchivedPaymentTotals] = useState<Record<string, number>>({});
  const [restoringArchivedId, setRestoringArchivedId] = useState<string | null>(null);
  const [previewMonth, setPreviewMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [hoveredRental, setHoveredRental] = useState<import('../types/rental').Rental | null>(null);
  const [showPortalRequests, setShowPortalRequests] = useState(false);
  const [portalRequests, setPortalRequests] = useState<PortalRequest[]>([]);
  const [portalRequestsLoading, setPortalRequestsLoading] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const { settings } = useCompanySettings();
  const navigate = useNavigate();

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
        style: 'currency',
        currency: 'EUR',
      }),
    [language]
  );
  const totalsById = useMemo(() => {
    const map = new Map<string, number>();
    rentals.forEach((rental) => {
      const total = computeRentalTotals(rental, settings).total;
      map.set(rental.id, total);
    });
    return map;
  }, [rentals, settings]);
  const getRentalTotal = (rental: Rental) => totalsById.get(rental.id) ?? Number(rental.total_price || 0);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = amountMin !== '' ? Number(amountMin) : null;
    const max = amountMax !== '' ? Number(amountMax) : null;
    return rentals
      .filter((r) => !q || (r.client_name || '').toLowerCase().includes(q))
      .filter((r) => filterTypes.has(r.type))
      .filter((r) => filterStatuses.size === 0 || filterStatuses.has(r.status as any))
      .filter((r) => !filterClientId || r.client_id === filterClientId)
      .filter((r) => min === null || getRentalTotal(r) >= min)
      .filter((r) => max === null || getRentalTotal(r) <= max);
  }, [rentals, query, filterTypes, filterStatuses, amountMin, amountMax, filterClientId, totalsById]);

  const archivedRentals = useMemo(() => rentals.filter((r) => r.status === 'archived'), [rentals]);

  const canViewList = hasPerm(user, 'rn_view_list');
  const canCreate = hasPerm(user, 'rn_create');

  const featureClientPortal = Boolean(settings?.features?.client_portal);

  const loadPortalRequests = useCallback(async () => {
    setPortalRequestsLoading(true);
    try {
      const res = await fetch('/api/portal-requests');
      if (res.ok) setPortalRequests(await res.json());
    } catch { /* ignore */ }
    finally { setPortalRequestsLoading(false); }
  }, []);

  useEffect(() => {
    if (featureClientPortal) loadPortalRequests();
  }, [featureClientPortal, loadPortalRequests]);

  const pendingRequests = portalRequests.filter((r) => r.status === 'pending');

  const handleConvertRequest = async (id: string) => {
    setConvertingId(id);
    try {
      const res = await fetch(`/api/portal-requests/${id}/convert`, { method: 'POST' });
      if (res.ok) {
        const { rental_id } = await res.json();
        await loadPortalRequests();
        navigate(`/rentals/${rental_id}`);
      }
    } catch { /* ignore */ }
    finally { setConvertingId(null); }
  };

  const handleRejectRequest = async (id: string) => {
    setRejectingId(id);
    try {
      const res = await fetch(`/api/portal-requests/${id}/reject`, { method: 'POST' });
      if (res.ok) await loadPortalRequests();
    } catch { /* ignore */ }
    finally { setRejectingId(null); }
  };

  const checkPaidSelection = async (ids: string[]) => {
    if (!ids.length) return false;
    const hasPaidStatus = rentals.some((r) => ids.includes(r.id) && r.status === 'paid');
    if (hasPaidStatus) return true;
    try {
      const withPayments = await getRentalsWithPayments(ids);
      return withPayments.size > 0;
    } catch (error) {
      console.error('check paid rentals', error);
      return true;
    }
  };

  const openArchivedModal = async () => {
    setShowArchivedModal(true);
    if (archivedRentals.length === 0) return;
    setArchivedTotalsLoading(true);
    try {
      const totals = await getRentalsPaymentTotals(archivedRentals.map((r) => r.id));
      setArchivedPaymentTotals(totals);
    } catch (error) {
      console.error('load archived payments', error);
      setArchivedPaymentTotals({});
    } finally {
      setArchivedTotalsLoading(false);
    }
  };

  const restoreArchivedRental = async (rental: Rental) => {
    if (restoringArchivedId) return;
    setRestoringArchivedId(rental.id);
    try {
      let paidTotal = archivedPaymentTotals[rental.id];
      if (paidTotal == null) {
        const totals = await getRentalsPaymentTotals([rental.id]);
        paidTotal = totals[rental.id] || 0;
        setArchivedPaymentTotals((prev) => ({ ...prev, ...totals }));
      }
      const totalDue = Math.max(0, getRentalTotal(rental));
      const nextStatus = totalDue > 0 && paidTotal + 0.009 >= totalDue ? 'paid' : 'confirmed';
      await restoreRentalStatus(rental.id, nextStatus);
      setArchivedPaymentTotals((prev) => {
        const next = { ...prev };
        delete next[rental.id];
        return next;
      });
    } catch (error) {
      console.error('restore archived rental', error);
    } finally {
      setRestoringArchivedId(null);
    }
  };

  const handleSubmit = async (data: RentalCreatePayload) => {
    await addRental(data, {
      id: user?.id || null,
      name: user?.full_name,
      email: user?.email,
    });
    setShowForm(false);
  };

  const typeOptions = useMemo(
    () => [
      { lbl: t('rentals.filters.type.rental'), key: 'rental' as const },
      { lbl: t('rentals.filters.type.service'), key: 'service' as const },
      { lbl: t('rentals.filters.type.sale'), key: 'sale' as const },
    ],
    [t]
  );

  const statusOptions = useMemo(
    () => [
      { lbl: t('rentals.filters.status.pending'), key: 'pending' as const },
      { lbl: t('rentals.filters.status.confirmed'), key: 'confirmed' as const },
      { lbl: t('rentals.filters.status.preparing'), key: 'preparing' as const },
      { lbl: t('rentals.filters.status.in_progress'), key: 'in_progress' as const },
      { lbl: t('rentals.filters.status.delivered'), key: 'delivered' as const },
      { lbl: t('rentals.filters.status.return_delivery'), key: 'return_delivery' as const },
      { lbl: t('rentals.filters.status.in_return'), key: 'in_return' as const },
      { lbl: t('rentals.filters.status.returned'), key: 'returned' as const },
      { lbl: t('rentals.filters.status.paid'), key: 'paid' as const },
      { lbl: t('rentals.filters.status.completed'), key: 'completed' as const },
      { lbl: t('rentals.filters.status.cancelled'), key: 'cancelled' as const },
      { lbl: t('rentals.filters.status.archived'), key: 'archived' as const },
    ],
    [t]
  );

  const rentalStats = useMemo(() => {
    const active = filtered.filter((r) =>
      ['confirmed', 'preparing', 'in_progress', 'delivered', 'return_delivery', 'in_return', 'returned'].includes(r.status)
    ).length;
    const pending = filtered.filter((r) => r.status === 'pending').length;
    const done = filtered.filter((r) => ['completed', 'paid'].includes(r.status)).length;
    const revenue = filtered.reduce((sum, r) => sum + (totalsById.get(r.id) ?? Number(r.total_price || 0)), 0);
    return { total: filtered.length, active, pending, done, revenue };
  }, [filtered, totalsById]);

  const previewRanges = useMemo(() => {
    return filtered
      .filter((rental) => rental.type !== 'sale')
      .map((rental) => {
        const accent = rental.color || '#2563eb';
        const rgb = colorToRgb(accent);
        return {
          start: new Date(rental.start_date),
          end: new Date(rental.end_date || rental.start_date),
          backgroundColor: toRgba(rgb, 0.18),
          edgeColor: accent,
          textColor: '#ffffff',
          inRangeTextColor: accent,
        };
      });
  }, [filtered]);

  useEffect(() => {
    if (!previewRanges.length) return;
    const earliest = previewRanges.reduce((min, range) => (range.start < min ? range.start : min), previewRanges[0].start);
    const nextMonth = startOfMonth(earliest);
    setPreviewMonth((prev) => {
      if (prev.getFullYear() === nextMonth.getFullYear() && prev.getMonth() === nextMonth.getMonth()) {
        return prev;
      }
      return nextMonth;
    });
  }, [previewRanges]);

  if (rentalsLoading || clientsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!canViewList) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">{t('rentals.list.title')}</h1>
        <div className="bg-white rounded-lg shadow p-6 text-gray-700">{t('rentals.list.accessDenied')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">{t('rentals.list.title')}</h1>
          {!showForm && (
            <>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('rentals.list.searchPlaceholder')}
                  className="pl-9 pr-8 py-2 w-full rounded-md border border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    aria-label={t('rentals.list.searchClear')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilters((s) => !s)}
                  aria-haspopup="dialog"
                  aria-expanded={showFilters}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50"
                  title={t('rentals.filters.tooltip')}
                >
                  <Filter className="h-4 w-4" />
                  {t('rentals.filters.button')}
                </button>

                {showFilters && (
                  <div className="absolute z-20 mt-2 w-80 right-0 bg-white border border-gray-200 rounded-md shadow-lg">
                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-900">{t('rentals.filters.title')}</div>
                        <button
                          type="button"
                          className="p-1 text-gray-400 hover:text-gray-600"
                          aria-label={t('common.close')}
                          onClick={() => setShowFilters(false)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">{t('rentals.filters.typeLabel')}</div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {typeOptions.map(({ lbl, key }) => (
                            <label key={key} className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300"
                                checked={uiTypes.has(key)}
                                onChange={(e) => {
                                  setUiTypes((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(key);
                                    else next.delete(key);
                                    if (next.size === 0) return new Set(['rental', 'service', 'sale']);
                                    return next;
                                  });
                                }}
                              />
                              <span className="text-gray-700">{lbl}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">{t('rentals.filters.statusLabel')}</div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {statusOptions.map(({ lbl, key }) => (
                            <label key={key} className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300"
                                checked={uiStatuses.has(key)}
                                onChange={(e) => {
                                  setUiStatuses((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(key);
                                    else next.delete(key);
                                    return next;
                                  });
                                }}
                              />
                              <span className="text-gray-700">{lbl}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">{t('rentals.filters.clientLabel')}</div>
                        <select
                          value={uiClientId}
                          onChange={(e) => setUiClientId(e.target.value)}
                          className="w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                          <option value="">{t('rentals.filters.clientAll')}</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">{t('rentals.filters.amountLabel')}</div>
                        <div className="flex items-center gap-2">
                          <input
                            value={uiAmountMin}
                            onChange={(e) => setUiAmountMin(e.target.value)}
                            placeholder={t('rentals.filters.amountMin')}
                            className="w-full rounded-md border-gray-300 text-sm"
                          />
                          <span className="text-gray-400">—</span>
                          <input
                            value={uiAmountMax}
                            onChange={(e) => setUiAmountMax(e.target.value)}
                            placeholder={t('rentals.filters.amountMax')}
                            className="w-full rounded-md border-gray-300 text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-700"
                          onClick={() => {
                            setUiTypes(new Set(['rental', 'service', 'sale']));
                            setUiStatuses(new Set(DEFAULT_STATUS_FILTER));
                            setUiAmountMin('');
                            setUiAmountMax('');
                            setUiClientId('');
                          }}
                        >
                          {t('rentals.filters.reset')}
                        </button>
                        <button
                          className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white"
                          onClick={() => {
                            setFilterTypes(new Set(uiTypes));
                            setFilterStatuses(new Set(uiStatuses));
                            setAmountMin(uiAmountMin);
                            setAmountMax(uiAmountMax);
                            setFilterClientId(uiClientId);
                            setShowFilters(false);
                          }}
                        >
                          {t('rentals.filters.apply')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={openArchivedModal}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                <Archive className="h-4 w-4" />
                Archives
                {archivedRentals.length > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {archivedRentals.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowWhatIfModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-blue-200 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100"
              >
                <BarChart3 className="h-4 w-4" />
                Simulation what-if
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {featureClientPortal && !showForm && (
            <button
              onClick={() => navigate('/portal-requests')}
              className="relative inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition"
            >
              <Inbox className="h-4 w-4" />
              Demandes
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingRequests.length > 9 ? '9+' : pendingRequests.length}
                </span>
              )}
            </button>
          )}
          {!showForm && canCreate && (
            <button
              onClick={() => {
                setShowForm(true);
                setMode('wizard');
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 mr-2" />
              {t('rentals.list.addButton')}
            </button>
          )}
          {showForm && (
            <button
              aria-label={t('rentals.list.cancelAria')}
              title={t('rentals.list.cancelAria')}
              onClick={() => setShowCancel(true)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {featureClientPortal && showPortalRequests && !showForm && (
        <div className="rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-100 bg-emerald-50/60">
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-emerald-600" />
              <span className="font-semibold text-slate-800">Demandes clients</span>
              {pendingRequests.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
                  {pendingRequests.length} en attente
                </span>
              )}
            </div>
            <button onClick={() => setShowPortalRequests(false)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          {portalRequestsLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">Chargement…</div>
          ) : portalRequests.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Aucune demande pour le moment.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {portalRequests.map((req) => (
                <div key={req.id} className={`flex items-start gap-4 px-5 py-4 ${req.status !== 'pending' ? 'opacity-60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-800 truncate">{req.clients?.name || 'Client inconnu'}</p>
                      {req.status === 'pending' && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">En attente</span>
                      )}
                      {req.status === 'converted' && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Converti</span>
                      )}
                      {req.status === 'rejected' && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Refusé</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mb-1">
                      {new Date(req.start_date).toLocaleDateString('fr-FR')} → {new Date(req.end_date).toLocaleDateString('fr-FR')}
                    </p>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {req.equipment_items.slice(0, 4).map((item, i) => (
                        <span key={i} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                      {req.equipment_items.length > 4 && (
                        <span className="text-xs text-slate-400">+{req.equipment_items.length - 4} autres</span>
                      )}
                    </div>
                    {req.message && (
                      <p className="text-xs text-slate-400 italic line-clamp-1">"{req.message}"</p>
                    )}
                  </div>
                  {req.status === 'pending' && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleConvertRequest(req.id)}
                        disabled={convertingId === req.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {convertingId === req.id ? '…' : 'Créer le projet'}
                      </button>
                      <button
                        onClick={() => handleRejectRequest(req.id)}
                        disabled={rejectingId === req.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {rejectingId === req.id ? '…' : 'Refuser'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm ? (
        <div className="space-y-4">
          {mode === 'wizard' && (
            <>
              <h2 className="text-lg font-medium">{t('rentals.create.title')}</h2>
              {canCreate ? (
                <RentalCreateWizard onSubmit={handleSubmit} clients={clients.map((c) => ({ id: c.id, name: c.name, client_type: c.client_type, company_client_id: c.company_client_id, default_delivery_address: c.default_delivery_address }))} />
              ) : (
                <div className="bg-white rounded-lg shadow p-6">{t('rentals.create.noPermission')}</div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <div className="xl:basis-[78%] xl:max-w-[78%] flex flex-col min-h-[calc(100vh-200px)] gap-4">
            <RentalsTable
              rentals={filtered}
              onBulkDelete={deleteRentalsBulk}
              onBulkArchive={archiveRentalsBulk}
              onBulkPurge={purgeRentalsBulk}
              onCheckPaidSelection={checkPaidSelection}
              onHover={setHoveredRental}
            />
          </div>
          <aside className="hidden xl:flex xl:flex-col xl:basis-[22%] xl:max-w-[22%] xl:min-w-0 xl:self-start">
            <div className="sticky top-28 flex flex-col gap-2 min-w-0 w-full">
              <CalendarMonth
                month={previewMonth}
                onMonthChange={setPreviewMonth}
                ranges={previewRanges}
                locale={language === 'fr' ? 'fr-FR' : 'en-US'}
              />
              {hoveredRental ? (() => {
                const r = hoveredRental;
                const dateLocale = language === 'fr' ? dateFnsFr : dateFnsEn;
                const datePat = language === 'fr' ? 'dd/MM/yyyy' : 'MM/dd/yyyy';
                const startFmt = format(new Date(r.start_date), datePat, { locale: dateLocale });
                const endFmt = format(new Date(r.end_date), datePat, { locale: dateLocale });
                const days = differenceInCalendarDays(new Date(r.end_date), new Date(r.start_date)) + 1;
                const total = totalsById.get(r.id) ?? Number(r.total_price || 0);
                const typeMap: Record<string, string> = { rental: 'Location', service: 'Prestation', sale: 'Vente' };
                const statusMap: Record<string, string> = {
                  pending: 'En attente', confirmed: 'Confirmé', preparing: 'Préparation',
                  in_progress: 'En cours', delivered: 'Livré', return_delivery: 'Retour livraison',
                  in_return: 'En retour', returned: 'Retourné', completed: 'Terminé',
                  paid: 'Payé', cancelled: 'Annulé', archived: 'Archivé',
                };
                const statusColors: Record<string, string> = {
                  pending: 'bg-amber-100 text-amber-800',
                  confirmed: 'bg-blue-100 text-blue-800',
                  preparing: 'bg-amber-100 text-amber-800',
                  in_progress: 'bg-indigo-100 text-indigo-800',
                  delivered: 'bg-sky-100 text-sky-800',
                  return_delivery: 'bg-sky-100 text-sky-800',
                  in_return: 'bg-purple-100 text-purple-800',
                  returned: 'bg-emerald-100 text-emerald-800',
                  completed: 'bg-emerald-100 text-emerald-800',
                  paid: 'bg-emerald-100 text-emerald-800',
                  cancelled: 'bg-red-100 text-red-800',
                  archived: 'bg-slate-100 text-slate-600',
                };
                return (
                  <div className="rounded-b-lg border border-slate-200 bg-white shadow-sm overflow-hidden w-full max-w-[320px]">
                    <div
                      className="h-1.5 w-full rounded-full"
                      style={{ backgroundColor: r.color || '#2563eb' }}
                    />
                    <div className="p-3 space-y-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">{r.reference_code || '—'}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {typeMap[r.type] ?? r.type}
                          </span>
                        </div>
                        {r.title && (
                          <p className="text-sm font-semibold text-slate-900 line-clamp-1">{r.title}</p>
                        )}
                        <p className="text-xs text-slate-700 truncate">{r.client_name}</p>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusColors[r.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {statusMap[r.status] ?? r.status}
                        </span>
                        <div className="flex items-center gap-1 flex-1 justify-center">
                          {[
                            { icon: FileCheck2,  s: (['pending','confirmed','preparing','in_progress','delivered','return_delivery','in_return','returned','completed','paid'].includes(r.status) ? 'done' : r.status === 'cancelled' ? 'cancelled' : 'upcoming') },
                            { icon: ShieldCheck, s: (['confirmed','preparing','in_progress','delivered','return_delivery','in_return','returned','completed','paid'].includes(r.status) ? 'done' : r.status === 'cancelled' ? 'cancelled' : 'upcoming') },
                            { icon: Package,     s: (r.status === 'preparing' ? 'active' : ['in_progress','delivered','return_delivery','in_return','returned','completed','paid'].includes(r.status) ? 'done' : r.status === 'cancelled' ? 'cancelled' : 'upcoming') },
                            { icon: Truck,       s: (r.status === 'in_progress' ? 'active' : ['delivered','return_delivery','in_return','returned','completed','paid'].includes(r.status) ? 'done' : r.status === 'cancelled' ? 'cancelled' : 'upcoming') },
                            { icon: RotateCcw,   s: (['return_delivery','in_return'].includes(r.status) ? 'active' : ['returned','completed','paid'].includes(r.status) ? 'done' : r.status === 'cancelled' ? 'cancelled' : 'upcoming') },
                            { icon: Banknote,    s: (r.status === 'paid' ? 'done' : r.status === 'cancelled' ? 'cancelled' : 'upcoming') },
                          ].map(({ icon: Icon, s }, i) => (
                            <Icon key={i} className={`h-5 w-5 ${s === 'done' ? 'text-emerald-500' : s === 'active' ? 'text-blue-500' : s === 'cancelled' ? 'text-red-400' : 'text-gray-200'}`} />
                          ))}
                        </div>
                        <span className="text-xs text-slate-500 shrink-0">{days} j</span>
                      </div>

                      <div className="space-y-1 text-xs text-slate-500 border-t border-slate-100 pt-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span>{startFmt} → {endFmt}</span>
                        </div>
                        {r.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{r.location}</span>
                          </div>
                        )}
                        {r.items.length > 0 && (
                          <div className="flex items-center gap-2">
                            <Package className="h-3 w-3 shrink-0" />
                            <span>{r.items.length} équipement{r.items.length > 1 ? 's' : ''}</span>
                          </div>
                        )}
                        {(r.assigned_personnel?.length ?? 0) > 0 && (
                          <div className="flex items-center gap-2">
                            <Users className="h-3 w-3 shrink-0" />
                            <span>{r.assigned_personnel!.length} technicien{r.assigned_personnel!.length > 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                        <span className="text-xs text-slate-500">Total</span>
                        <span className="text-sm font-semibold text-slate-900">{currencyFormatter.format(total)}</span>
                      </div>

                      {r.notes && (
                        <p className="text-xs text-slate-500 italic line-clamp-1 border-t border-slate-100 pt-1.5">{r.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="rounded-b-lg border border-slate-200 bg-white shadow-sm overflow-hidden w-full max-w-[320px]">
                  <div className="h-1.5 w-full bg-slate-200" />
                  <div className="p-3 space-y-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-300">OR-0000-000</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-300">—</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-300">Nom du projet</p>
                      <p className="text-xs text-slate-300">Client</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-300">Statut</span>
                      <span className="text-xs text-slate-300">— j</span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-300 border-t border-slate-100 pt-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span>jj/mm/aaaa → jj/mm/aaaa</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>Lieu</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Package className="h-3 w-3 shrink-0" />
                        <span>— équipements</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                      <span className="text-xs text-slate-300">Total</span>
                      <span className="text-sm font-semibold text-slate-300">—,— €</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats widget */}
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden w-full max-w-[320px]">
                <div className="p-2 flex flex-col gap-1.5">
                  {/* Header */}
                  <div className="flex items-center justify-between px-1.5 py-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projets totaux</p>
                    <span className="text-sm font-bold text-slate-900">{rentalStats.total}</span>
                  </div>

                  {/* Rows */}
                  {[
                    { label: 'Actifs', count: rentalStats.active, icon: Clock, color: 'text-indigo-700', iconBg: 'bg-indigo-100', cardBg: 'bg-indigo-50/70', border: 'border-indigo-200', track: 'bg-indigo-100', fill: 'bg-indigo-500' },
                    { label: 'En attente', count: rentalStats.pending, icon: CheckCircle, color: 'text-amber-700', iconBg: 'bg-amber-100', cardBg: 'bg-amber-50/70', border: 'border-amber-200', track: 'bg-amber-100', fill: 'bg-amber-500' },
                    { label: 'Soldés', count: rentalStats.done, icon: Banknote, color: 'text-emerald-700', iconBg: 'bg-emerald-100', cardBg: 'bg-emerald-50/70', border: 'border-emerald-200', track: 'bg-emerald-100', fill: 'bg-emerald-500' },
                  ].map((item) => {
                    const Icon = item.icon;
                    const pct = rentalStats.total > 0 ? Math.round((item.count / rentalStats.total) * 100) : 0;
                    return (
                      <div key={item.label} className={`flex flex-col rounded-lg border px-3 py-2.5 ${item.cardBg} ${item.border}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`rounded-lg p-1.5 ${item.iconBg}`}>
                              <Icon className={`h-4 w-4 ${item.color}`} />
                            </div>
                            <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold leading-none text-slate-900">{item.count}</span>
                            <span className="text-sm text-slate-400">{pct}%</span>
                          </div>
                        </div>
                        <div className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${item.track}`}>
                          <div className={`h-full rounded-full ${item.fill} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {showArchivedModal && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={restoringArchivedId ? undefined : () => setShowArchivedModal(false)} />
          <div className="relative w-full max-w-2xl mx-4 rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Projets archivés</h3>
                <p className="text-sm text-gray-500">{archivedRentals.length} élément(s)</p>
              </div>
              <button
                type="button"
                onClick={() => setShowArchivedModal(false)}
                disabled={!!restoringArchivedId}
                className={`p-2 rounded-full hover:bg-gray-100 text-gray-500 ${restoringArchivedId ? 'opacity-60 cursor-not-allowed' : ''}`}
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {archivedRentals.length === 0 ? (
              <div className="mt-6 text-sm text-gray-500">Aucun projet archivé.</div>
            ) : (
              <div className="mt-4 max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
                {archivedRentals.map((rental) => {
                  const paidTotal = archivedPaymentTotals[rental.id] || 0;
                  const totalDue = Math.max(0, getRentalTotal(rental));
                  const paidLabel = totalDue > 0 ? `${currencyFormatter.format(paidTotal)} encaissés` : null;
                  return (
                    <div key={rental.id} className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-gray-900">
                          {(rental.type === 'service' ? 'Prestation' : rental.type === 'sale' ? 'Vente' : 'Location')} • {rental.client_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(rental.start_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')} —{' '}
                          {new Date(rental.end_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}
                        </div>
                        <div className="text-xs text-gray-500">
                          Total: {currencyFormatter.format(Math.max(0, getRentalTotal(rental)))}
                          {paidLabel ? ` • ${paidLabel}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => restoreArchivedRental(rental)}
                        disabled={restoringArchivedId === rental.id || archivedTotalsLoading}
                        className={`inline-flex items-center justify-center px-3 py-2 rounded-md text-sm text-white bg-blue-600 hover:bg-blue-700 ${restoringArchivedId === rental.id || archivedTotalsLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        {restoringArchivedId === rental.id ? 'Restauration…' : 'Remettre'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {archivedTotalsLoading && archivedRentals.length > 0 && (
              <div className="mt-3 text-xs text-gray-500">Chargement des paiements…</div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showCancel}
        title={t('rentals.create.cancelDialog.title')}
        message={t('rentals.create.cancelDialog.message')}
        confirmLabel={t('rentals.create.cancelDialog.confirm')}
        cancelLabel={t('rentals.create.cancelDialog.keep')}
        onConfirm={() => {
          setShowCancel(false);
          setShowForm(false);
          setMode('wizard');
        }}
        onCancel={() => setShowCancel(false)}
      />

      <RentalAvailabilityWhatIfModal
        isOpen={showWhatIfModal}
        onClose={() => setShowWhatIfModal(false)}
      />
    </div>
  );
};

export default RentalsPage;
