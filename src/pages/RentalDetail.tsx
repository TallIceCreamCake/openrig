import React from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';

// Fix Leaflet default marker icons
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { FileText, Package, Info, Euro, Users, Calendar, Trash2, FilePlus2, ShieldCheck, ShieldX, Wrench, Truck, Undo2, CreditCard, ArrowLeft, Edit, Save, Check, History, Flag, UserCheck, FileSignature, Folder, ChevronRight, ChevronLeft, ChevronDown, FolderPlus, Upload, Home, Briefcase, Camera, Image, Music, Video, Star, Share2, Copy, ExternalLink, QrCode, MessageSquarePlus, AlertTriangle, Navigation, Clock, MapPin, Globe, BadgeCheck, HardHat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DocumentGeneratorModal from '../components/rentals/DocumentGeneratorModal';
import { Equipment } from '../types/equipment';
import { Rental, RentalActivityLog, RentalItem, RentalItemGroup } from '../types/rental';
import type { DocumentClientInfo, DocumentPackItem } from '../utils/rentalDocumentPdf';
import RentalGeneralForm from '../components/rentals/RentalGeneralForm';
import RentalEquipmentList from '../components/rentals/RentalEquipmentList';
import EquipmentCatalogPanel from '../components/rentals/EquipmentCatalogPanel';
import RentalHeader from '../components/rentals/RentalHeader';
import RentalMilestonesPanel from '../components/rentals/RentalMilestonesPanel';
import RentalTasksPanel from '../components/rentals/RentalTasksPanel';
import RentalCrewPanel from '../components/rentals/RentalCrewPanel';
import RentalFileExplorerModal from '../components/rentals/RentalFileExplorerModal';
import { useRental } from '../hooks/useRental';
import { useVehicles } from '../hooks/useVehicles';
import { usePersonnel } from '../hooks/usePersonnel';
import { useServices } from '../hooks/useServices';
import { useUIPreferences } from '../hooks/useUIPreferences';
import { useClients } from '../hooks/useClients';
import { useDeliveryOffers } from '../hooks/useDeliveryOffers';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTranslation } from '../context/TranslationContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import PreparationModal from '../components/rentals/PreparationModal';
import ReturnModal from '../components/rentals/ReturnModal';
import DeliveryConfirmModal from '../components/rentals/DeliveryConfirmModal';
import ReturnDeliveryConfirmModal from '../components/rentals/ReturnDeliveryConfirmModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Textarea from '../components/ui/Textarea';
import { AddressSearchInput, Button, ColorPickerButton, ProgressStepsCard, StatusBadge, StepTransition, type BadgeTone } from '../components/ui-kit';
import type { ProgressStepTone } from '../components/ui-kit/ProgressStepsCard';
import { DocumentTableDesign, DEFAULT_DOCUMENT_DESIGN as DEFAULT_DOC_DESIGN, extractDocumentDesign } from '../utils/documentDesign';
import { LegalCompanyInfo } from '../utils/documentLegalFooter';
import { isAutoEntrepreneurMode } from '../utils/accountingMode';
import { computeRentalCoefficient, normalizeRentalCoefficientMode } from '../utils/rentalCoefficient';
import { ensureRentalDraftInvoice } from '../utils/rentalInvoice';
import { resolveTemplateStudioSnapshotForDoc } from '../utils/templateStudioDocument';
import { getRentalStatusLabel, getRentalStatusTone } from '../utils/rentalStatus';
import InvoiceFinancialPanel from '../components/billing/InvoiceFinancialPanel';

// ── Carte satellite livraison ────────────────────────────────────────────────
const DeliveryMapFlyTo: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const map = useMap();
  React.useEffect(() => { map.flyTo([lat, lon], 15, { duration: 0.8 }); }, [map, lat, lon]);
  return null;
};

const DeliveryMapView: React.FC<{ address: string }> = ({ address }) => {
  const [state, setState] = React.useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [coords, setCoords] = React.useState<{ lat: number; lon: number } | null>(null);

  React.useEffect(() => {
    if (!address.trim()) { setState('idle'); setCoords(null); return; }
    setState('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=fr`,
          { headers: { 'Accept': 'application/json' } }
        );
        const json = await res.json();
        const f = json?.features?.[0];
        if (f) { const [lon, lat] = f.geometry.coordinates as [number, number]; setCoords({ lat, lon }); setState('ok'); }
        else setState('error');
      } catch { setState('error'); }
    }, 600);
    return () => clearTimeout(timer);
  }, [address]);

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 h-full min-h-[220px]">
      {state === 'idle' && <div className="h-full flex items-center justify-center text-xs text-slate-400">Aucune adresse renseignée</div>}
      {state === 'loading' && <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-400"><span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />Chargement…</div>}
      {state === 'error' && <div className="h-full flex items-center justify-center text-xs text-red-400">Adresse introuvable</div>}
      {state === 'ok' && coords && (
        <MapContainer center={[coords.lat, coords.lon]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl attributionControl={false}>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          <Marker position={[coords.lat, coords.lon]} />
          <DeliveryMapFlyTo lat={coords.lat} lon={coords.lon} />
        </MapContainer>
      )}
    </div>
  );
};

const _geocode = async (address: string) => {
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=fr`, { headers: { 'Accept': 'application/json' } });
  const data = await res.json();
  const f = data?.features?.[0];
  if (!f) throw new Error('not found');
  const [lon, lat] = f.geometry.coordinates as [number, number];
  return { lat, lon };
};

const _formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
  return h === 0 ? `${m} min` : `${h}h ${m < 10 ? '0' : ''}${m}`;
};

const DeliveryDistanceCard: React.FC<{ companyAddress: string; deliveryAddress: string }> = ({ companyAddress, deliveryAddress }) => {
  const [state, setState] = React.useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [info, setInfo] = React.useState<{ distance: number; duration: number } | null>(null);

  React.useEffect(() => {
    if (!companyAddress.trim() || !deliveryAddress.trim()) { setState('idle'); setInfo(null); return; }
    setState('loading');
    const timer = setTimeout(async () => {
      try {
        const [a, b] = await Promise.all([_geocode(companyAddress), _geocode(deliveryAddress)]);
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
        const data = await res.json() as { routes?: Array<{ distance: number; duration: number }> };
        if (data.routes?.[0]) { setInfo({ distance: data.routes[0].distance, duration: data.routes[0].duration }); setState('ok'); }
        else setState('error');
      } catch { setState('error'); }
    }, 900);
    return () => clearTimeout(timer);
  }, [companyAddress, deliveryAddress]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-3 flex items-center justify-center min-h-[52px]">
      {state === 'idle' && <p className="text-xs text-slate-400">Distance depuis le dépôt</p>}
      {state === 'loading' && <div className="flex items-center gap-2 text-xs text-slate-400"><span className="h-3 w-3 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />Calcul en cours…</div>}
      {state === 'error' && <p className="text-xs text-red-400">Impossible de calculer la distance</p>}
      {state === 'ok' && info && (
        <div className="flex items-center gap-5 w-full">
          <div className="flex items-center gap-1.5"><Navigation className="h-4 w-4 text-blue-500 flex-shrink-0" /><span className="text-sm font-semibold text-slate-800">{(info.distance / 1000).toFixed(1)} km</span><span className="text-xs text-slate-400">route</span></div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-amber-500 flex-shrink-0" /><span className="text-sm font-semibold text-slate-800">{_formatDuration(info.duration)}</span><span className="text-xs text-slate-400">estimé</span></div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5 min-w-0 flex-1"><MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" /><span className="text-xs text-slate-500 truncate">{companyAddress}</span></div>
        </div>
      )}
    </div>
  );
};

type ProgressStepId = 'created' | 'validated' | 'prepared' | 'delivered' | 'return_delivery' | 'returned' | 'paid';
type StepState = 'completed' | 'current' | 'upcoming' | 'cancelled';
type ActivityEntry = {
  action: string;
  details?: string | null;
  metadata?: Record<string, any> | null;
};

const STEP_ORDER: Record<ProgressStepId, number> = {
  created: 1,
  validated: 2,
  prepared: 3,
  delivered: 4,
  return_delivery: 5,
  returned: 6,
  paid: 7,
};

const STATE_LABEL: Record<StepState, string> = {
  completed: 'Terminé',
  current: 'En cours',
  upcoming: 'À venir',
  cancelled: 'Refusé',
};

const ACTIVITY_LABEL: Record<string, string> = {
  created: 'Création',
  updated: 'Mise à jour',
  rental_updated: 'Mise à jour',
  item_added: 'Matériel ajouté',
  item_removed: 'Matériel retiré',
  item_quantity_updated: 'Quantité modifiée',
  item_discount_updated: 'Remise modifiée',
  group_removed: 'Groupe retiré',
  maintenance_added: 'Maintenance ajoutée',
  maintenance_removed: 'Maintenance retirée',
  insurance_services_updated: 'Assurances',
  other_services_updated: 'Autres services',
  document_generated: 'Document généré',
  document_deleted: 'Document supprimé',
  document_sent: 'Document envoyé',
  document_approval_requested: 'Demande de validation',
  quote_expired: 'Devis expiré',
  quote_invalidated: 'Devis annulé',
  status_confirmed: 'Acceptée',
  status_rejected: 'Refusée',
  status_cancelled: 'Annulée',
  status_restored: 'Réactivée',
  status_archived: 'Archivée',
  payment_recorded: 'Paiement',
  preparation_started: 'Préparation',
  preparation_completed: 'Préparation',
  delivery_confirmed: 'Livraison',
  return_delivery_confirmed: 'Livraison retour',
  return_confirmed: 'Retour',
  delivery_offer_updated: 'Forfait livraison',
  delivery_offer_cleared: 'Forfait livraison',
  delivery_schedule_updated: 'Logistique',
  milestone_created: 'Date clé ajoutée',
  milestone_updated: 'Date clé modifiée',
  milestone_deleted: 'Date clé supprimée',
  task_created: 'Tâche créée',
  task_updated: 'Tâche modifiée',
  task_deleted: 'Tâche supprimée',
};

const ACTIVITY_TONE: Record<string, BadgeTone> = {
  created: 'blue',
  updated: 'slate',
  rental_updated: 'slate',
  item_added: 'green',
  item_removed: 'red',
  item_quantity_updated: 'orange',
  item_discount_updated: 'orange',
  group_removed: 'slate',
  maintenance_added: 'blue',
  maintenance_removed: 'blue',
  insurance_services_updated: 'blue',
  other_services_updated: 'blue',
  document_generated: 'blue',
  document_deleted: 'slate',
  document_sent: 'blue',
  document_approval_requested: 'orange',
  quote_expired: 'orange',
  quote_invalidated: 'orange',
  status_confirmed: 'green',
  status_rejected: 'red',
  status_cancelled: 'red',
  status_restored: 'blue',
  status_archived: 'slate',
  payment_recorded: 'orange',
  preparation_started: 'blue',
  preparation_completed: 'blue',
  delivery_confirmed: 'blue',
  return_delivery_confirmed: 'blue',
  return_confirmed: 'green',
  delivery_offer_updated: 'blue',
  delivery_offer_cleared: 'blue',
  delivery_schedule_updated: 'slate',
  milestone_created: 'blue',
  milestone_updated: 'orange',
  milestone_deleted: 'red',
  task_created: 'blue',
  task_updated: 'orange',
  task_deleted: 'red',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOSSIER_SHARE_STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  revoked: 'Révoqué',
  expired: 'Expiré',
};
const DOSSIER_SHARE_STATUS_TONES: Record<string, BadgeTone> = {
  active: 'green',
  revoked: 'red',
  expired: 'orange',
};

type ClientHistoryRow = {
  id: string;
  date: string;
  type: string;
  equipment: string;
  amount: number;
  status: string;
  reference?: string | null;
};

type PaymentStatus = 'completed' | 'pending' | 'failed';
type PaymentType = 'deposit' | 'payment' | 'refund';

type PaymentHistoryEntry = {
  id: string;
  amount: number;
  method: string | null;
  date: string | null;
  status: PaymentStatus;
  reference: string | null;
  invoiceId: string | null;
  paymentType: PaymentType;
};

type ServiceFormState = {
  title: string;
  client_id: string;
  start_date: string;
  end_date: string;
  location: string;
  description: string;
  notes: string;
  color: string;
  discount_type: string;
  discount_value: string;
};

type DossierShareListItem = {
  id: string;
  rootEntryId: string | null;
  shareUrl: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  accessMode: 'viewer' | 'editor';
  hasPassword: boolean;
  whitelistEnabled: boolean;
};

const toDatetimeLocal = (value?: string | null) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    const tzOffset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - tzOffset);
    return local.toISOString().slice(0, 16);
  } catch {
    return '';
  }
};

const fromDatetimeLocal = (value: string | null) => {
  if (!value || value.trim().length === 0) return null;
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  } catch {
    return null;
  }
};

const toStartOfDayLocal = (value?: string | null) => {
  if (!value) return '';
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setHours(0, 0, 0, 0);
    return toDatetimeLocal(parsed.toISOString());
  } catch {
    return '';
  }
};

const toEndOfDayLocal = (value?: string | null) => {
  if (!value) return '';
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setHours(23, 59, 0, 0);
    return toDatetimeLocal(parsed.toISOString());
  } catch {
    return '';
  }
};

const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  completed: { label: 'Payé', tone: 'green' },
  pending: { label: 'En attente', tone: 'orange' },
  failed: { label: 'Échoué', tone: 'red' },
};

const PAYMENT_TYPE_TONE: Record<PaymentType, BadgeTone> = {
  deposit: 'blue',
  payment: 'slate',
  refund: 'red',
};

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  deposit: 'Acompte',
  payment: 'Paiement',
  refund: 'Remboursement',
};

const parseLocalizedNumber = (value: string): number => {
  if (!value) return Number.NaN;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const mapPaymentRow = (row: any): PaymentHistoryEntry => ({
  id: row.id,
  amount: Number(row.amount || 0),
  method: row.payment_method,
  date: row.payment_date,
  status: (row.status || 'completed') as PaymentStatus,
  reference: row.reference,
  invoiceId: row.invoice_id,
  paymentType: (row.payment_type || 'payment') as PaymentType,
});

const formatMoney = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);

const clampPercent = (value: string | number, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
};

const parsePositiveInt = (value: string, fallback = 1, max?: number) => {
  if (!value.trim()) return fallback;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.max(1, parsed);
  return typeof max === 'number' ? Math.min(max, clamped) : clamped;
};

const getDeliveryUnitLabel = (pricingType?: string | null) => {
  switch (pricingType) {
    case 'per_km':
      return 'km';
    case 'per_hour':
      return 'h';
    case 'per_day':
      return 'jour(s)';
    case 'per_trip':
      return 'trajet(s)';
    default:
      return '';
  }
};

const formatDateTimeDisplay = (value?: string | null) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
};

const truncateText = (value?: string | null, max = 80) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '—';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 3)}...`;
};

const sortItemGroups = (groups: RentalItemGroup[] = []) => [...groups].sort((a, b) => (a.position || 0) - (b.position || 0));

const resequenceItemGroups = (groups: RentalItemGroup[] = []) => sortItemGroups(groups).map((group, index) => ({
  ...group,
  position: index,
}));

const resequenceRentalItems = (list: RentalItem[] = [], groups: RentalItemGroup[] = []) => {
  const bucket = new Map<string | null, RentalItem[]>();
  list.forEach(item => {
    const key = item.group_id || null;
    const arr = bucket.get(key) || [];
    arr.push(item);
    bucket.set(key, arr);
  });

  const ordered: RentalItem[] = [];
  const ungrouped = bucket.get(null);
  if (ungrouped) {
    ungrouped
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .forEach((item, index) => ordered.push({ ...item, group_id: null, position: index }));
  }

  sortItemGroups(groups).forEach(group => {
    const arr = bucket.get(group.id);
    if (!arr || arr.length === 0) return;
    arr
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .forEach((item, index) => ordered.push({ ...item, group_id: group.id, position: index }));
  });

  return ordered;
};

const DOC_TITLE_PREFIX: Record<string, string> = {
  devis: 'DEVIS',
  facture: 'FACTURE',
  bon_prepa: 'BONPREPA',
};

const getDocumentPrefix = (docType: string) => DOC_TITLE_PREFIX[docType] || 'DOC';

const buildRentalDocTitle = (docType: string, reference: string, sequence: number) => {
  const prefix = getDocumentPrefix(docType);
  const safeRef = reference.trim() || 'DOC';
  const safeSequence = String(Math.max(1, sequence)).padStart(3, '0');
  return `${prefix}-${safeRef}-${safeSequence}`;
};

const sanitizeFilename = (value: string) => {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'document';
};

const dataUrlToBlob = (dataUrl: string) => {
  if (!dataUrl.startsWith('data:')) return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  const header = parts[0];
  const payload = parts.slice(1).join(',');
  const mimeMatch = header.match(/data:(.*?);base64/i);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const parseCsvBytes = (raw: string) => {
    const compact = raw.replace(/\s+/g, '');
    if (!/^[0-9,]+$/.test(compact)) return null;
    const values = compact.split(',').filter(Boolean);
    if (!values.length) return null;
    const bytes = new Uint8Array(values.length);
    for (let i = 0; i < values.length; i += 1) {
      const value = Number(values[i]);
      if (!Number.isFinite(value) || value < 0 || value > 255) {
        return null;
      }
      bytes[i] = value;
    }
    return new Blob([bytes], { type: mimeType });
  };
  const normalizedPayload = payload.replace(/\s+/g, '');
  try {
    const binary = atob(normalizedPayload);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } catch {
    return parseCsvBytes(payload) || null;
  }
};

const getDossierEntryBlob = async (entry: { file_url: string | null }) => {
  if (!entry.file_url) throw new Error('missing_file_url');
  if (entry.file_url.startsWith('data:')) {
    const blob = dataUrlToBlob(entry.file_url);
    if (!blob) throw new Error('invalid_data_url');
    return blob;
  }
  const response = await fetch(entry.file_url);
  if (!response.ok) throw new Error('fetch_failed');
  return response.blob();
};

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(new Error('file_read_failed'));
  reader.readAsDataURL(file);
});

const formatFileSize = (size?: number | null) => {
  if (!size || size <= 0) return '—';
  const units = ['octets', 'Ko', 'Mo', 'Go'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = index === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
};

const splitEntryName = (value: string) => {
  const lastDot = value.lastIndexOf('.');
  if (lastDot <= 0) return { base: value, ext: '' };
  return { base: value.slice(0, lastDot), ext: value.slice(lastDot) };
};

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const previewableExtensions = new Set([...imageExtensions, 'pdf']);

const isPreviewableEntry = (entry: { entry_type: 'folder' | 'file'; name: string; file_type: string | null }) => {
  if (entry.entry_type !== 'file') return false;
  const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() ?? '' : '';
  if (previewableExtensions.has(ext)) return true;
  if (entry.file_type?.startsWith('image/')) return true;
  return entry.file_type === 'application/pdf';
};

const isImageEntry = (entry: { entry_type: 'folder' | 'file'; name: string; file_type: string | null }) => {
  if (entry.entry_type !== 'file') return false;
  if (entry.file_type?.startsWith('image/')) return true;
  const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() ?? '' : '';
  return imageExtensions.has(ext);
};

const DEFAULT_FOLDER_COLOR = '#f59e0b';
const DEFAULT_FILE_COLOR = '#3b82f6';

const normalizeHexColor = (value: string) => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
};

const withHexAlpha = (value: string, alpha: string) => {
  const normalized = normalizeHexColor(value);
  if (!normalized || !/^[0-9a-fA-F]{2}$/.test(alpha)) return null;
  return `${normalized}${alpha.toLowerCase()}`;
};

const DOSSIER_ICON_OPTIONS: Array<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'folder', label: 'Dossier', Icon: Folder },
  { id: 'briefcase', label: 'Projet', Icon: Briefcase },
  { id: 'users', label: 'Equipe', Icon: Users },
  { id: 'calendar', label: 'Planning', Icon: Calendar },
  { id: 'camera', label: 'Photo', Icon: Camera },
  { id: 'image', label: 'Images', Icon: Image },
  { id: 'music', label: 'Audio', Icon: Music },
  { id: 'video', label: 'Video', Icon: Video },
  { id: 'shield', label: 'Assurance', Icon: ShieldCheck },
  { id: 'wrench', label: 'Technique', Icon: Wrench },
  { id: 'truck', label: 'Logistique', Icon: Truck },
  { id: 'star', label: 'Important', Icon: Star },
];

const DOSSIER_ICON_MAP = new Map(DOSSIER_ICON_OPTIONS.map((item) => [item.id, item.Icon]));
const DOSSIER_ICON_LABELS = new Map(DOSSIER_ICON_OPTIONS.map((item) => [item.id, item.label]));

const withFilenameFragment = (url: string, filename: string) => {
  if (!filename) return url;
  const base = url.split('#')[0];
  return `${base}#filename=${encodeURIComponent(filename)}`;
};

type PortalValidationTabProps = {
  rental: import('../types/rental').Rental;
  onValidated: () => void;
  userId?: string | null;
};

const PortalValidationTab: React.FC<PortalValidationTabProps> = ({ rental, onValidated, userId }) => {
  const [notes, setNotes] = React.useState(rental.portal_validation_notes || '');
  const [saving, setSaving] = React.useState(false);

  const handleValidate = async () => {
    setSaving(true);
    try {
      await fetch(`/api/portal-requests/rental/${rental.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validated_by_id: userId || null, notes: notes.trim() || null }),
      });
      onValidated();
    } finally {
      setSaving(false);
    }
  };

  const req = rental as import('../types/rental').Rental & {
    portal_validated?: boolean;
    portal_validated_at?: string | null;
    portal_validation_notes?: string | null;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header banner */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
        <Globe className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Projet issu d'une demande client</p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Ce projet a été créé automatiquement depuis l'espace client. Une validation administrative est requise avant que le client ne puisse voir le tarif final.
          </p>
        </div>
      </div>

      {req.portal_validated ? (
        <div className="rounded-xl border border-emerald-200 bg-white p-5 flex items-center gap-3 shadow-sm">
          <BadgeCheck className="h-8 w-8 text-emerald-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-slate-800">Projet validé</p>
            <p className="text-sm text-slate-500 mt-0.5">
              Validé le {req.portal_validated_at ? new Date(req.portal_validated_at).toLocaleString('fr-FR') : '—'}
            </p>
            {req.portal_validation_notes && (
              <p className="text-sm text-slate-600 mt-1 italic">"{req.portal_validation_notes}"</p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-slate-800">Valider le tarif et les conditions</h3>
          <p className="text-sm text-slate-500">
            Vérifiez le prix total, la réduction éventuelle et les dates dans les onglets correspondants avant de valider.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes de validation (optionnel)</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex : Prix ajusté -10%, devis verbal accepté..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 resize-none"
            />
          </div>
          <button
            onClick={handleValidate}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            <BadgeCheck className="h-4 w-4" />
            {saving ? 'Validation…' : 'Valider le projet'}
          </button>
        </div>
      )}
    </div>
  );
};

const RentalDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rental, loading, error, setRental } = useRental(id!);
  const { vehicles } = useVehicles();
  const { personnel: personnelList = [], loading: personnelLoading } = usePersonnel();
  const { services = [], loading: servicesLoading } = useServices();
  const { language } = useTranslation();
  const { user } = useAuth();
  const { settings } = useCompanySettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useUIPreferences('rental_detail_tab', (() => {
    const t = searchParams.get('tab');
    const valid = ['general', 'equipment', 'delivery', 'personnel', 'insurance', 'other'];
    return valid.includes(t as string) ? (t as string) : 'general';
  })());
  React.useEffect(() => { setSearchParams({ tab: activeTab as string }, { replace: true }); }, [activeTab]);
  const tabsContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [tabsOverflow, setTabsOverflow] = React.useState(false);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const [isEditing, setIsEditing] = useUIPreferences('rental_detail_editing', false);
  const [coefficientInput, setCoefficientInput] = React.useState('');
  const [coefficientDirty, setCoefficientDirty] = React.useState(false);
  const [coefficientSaving, setCoefficientSaving] = React.useState(false);
  const [showDocModal, setShowDocModal] = React.useState(false);
  const [showPrep, setShowPrep] = React.useState(false);
  const [showDeliveryConfirm, setShowDeliveryConfirm] = React.useState(false);
  const [showReturnDeliveryConfirm, setShowReturnDeliveryConfirm] = React.useState(false);
  const [showReturn, setShowReturn] = React.useState(false);
  const [returnMode, setReturnMode] = React.useState<'new' | 'reopen'>('new');
  const [docs, setDocs] = React.useState<Array<{ id: string; title: string; doc_type: string; file_url: string; created_at: string }>>([]);
  const [activeDocId, setActiveDocId] = React.useState<string | null>(null);
  const [sendingDocId, setSendingDocId] = React.useState<string | null>(null);
  const [showSendDocModal, setShowSendDocModal] = React.useState(false);
  const [sendDocTarget, setSendDocTarget] = React.useState<{ id: string; title: string; doc_type: string } | null>(null);
  const [sendDocEmail, setSendDocEmail] = React.useState('');
  const [sendDocError, setSendDocError] = React.useState<string | null>(null);
  const [showApprovalRequestModal, setShowApprovalRequestModal] = React.useState(false);
  const [approvalRequestEmail, setApprovalRequestEmail] = React.useState('');
  const [approvalRequestError, setApprovalRequestError] = React.useState<string | null>(null);
  const [sendingApprovalRequest, setSendingApprovalRequest] = React.useState(false);
  const [approvalPasswordEnabled, setApprovalPasswordEnabled] = React.useState(false);
  const [approvalPassword, setApprovalPassword] = React.useState('');
  const [pendingModificationRequests, setPendingModificationRequests] = React.useState<Array<{ id: string; modification_comment: string | null; signer_name: string | null; recipient_name: string | null; created_at: string }>>([]);
  const [allModificationRequests, setAllModificationRequests] = React.useState<Array<{ id: string; modification_comment: string | null; signer_name: string | null; recipient_name: string | null; created_at: string; modification_seen_at: string | null }>>([]);
  const [showModificationPopup, setShowModificationPopup] = React.useState(false);
  const [showSendModificationModal, setShowSendModificationModal] = React.useState(false);
  const [modificationCommentInput, setModificationCommentInput] = React.useState('');
  const [sendingModification, setSendingModification] = React.useState(false);
  const [showDocShareModal, setShowDocShareModal] = React.useState(false);
  const [docShareTarget, setDocShareTarget] = React.useState<{ id: string; title: string; doc_type: string } | null>(null);
  const [docShareRecord, setDocShareRecord] = React.useState<{ id: string; token: string; expires_at: string | null } | null>(null);
  const [docShareLink, setDocShareLink] = React.useState('');
  const [docShareLoading, setDocShareLoading] = React.useState(false);
  const [docShareError, setDocShareError] = React.useState<string | null>(null);
  const [showQuoteExpiredModal, setShowQuoteExpiredModal] = React.useState(false);
  const quoteExpiryProcessingRef = React.useRef(false);
  const [showQuoteInvalidatedModal, setShowQuoteInvalidatedModal] = React.useState(false);
  const [dossierEntries, setDossierEntries] = React.useState<Array<{
    id: string;
    rental_id: string;
    parent_id: string | null;
    entry_type: 'folder' | 'file';
    name: string;
    file_url: string | null;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    color: string | null;
    icon: string | null;
    created_at: string;
  }>>([]);
  const [dossierLoading, setDossierLoading] = React.useState(false);
  const [dossierError, setDossierError] = React.useState<string | null>(null);
  const [dossierFolderId, setDossierFolderId] = React.useState<string | null>(null);
  const [dossierUploading, setDossierUploading] = React.useState(false);
  const [dossierCreating, setDossierCreating] = React.useState(false);
  const [dossierSelectedEntryIds, setDossierSelectedEntryIds] = React.useState<string[]>([]);
  const [dossierSelectionAnchorId, setDossierSelectionAnchorId] = React.useState<string | null>(null);
  const [dossierContextMenu, setDossierContextMenu] = React.useState<{
    x: number;
    y: number;
    entryId: string | null;
  } | null>(null);
  const [dossierClipboard, setDossierClipboard] = React.useState<{
    entryId: string;
    mode: 'copy' | 'cut';
  } | null>(null);
  const [dossierInfoEntryId, setDossierInfoEntryId] = React.useState<string | null>(null);
  const [dossierPreviewEntryId, setDossierPreviewEntryId] = React.useState<string | null>(null);
  const [dossierZippingId, setDossierZippingId] = React.useState<string | null>(null);
  const [dossierNameModalOpen, setDossierNameModalOpen] = React.useState(false);
  const [dossierNameModalMode, setDossierNameModalMode] = React.useState<'create' | 'edit'>('create');
  const [dossierNameModalValue, setDossierNameModalValue] = React.useState('');
  const [dossierNameModalEntryId, setDossierNameModalEntryId] = React.useState<string | null>(null);
  const [dossierNameModalSaving, setDossierNameModalSaving] = React.useState(false);
  const [dossierExpandedFolderIds, setDossierExpandedFolderIds] = React.useState<string[]>([]);
  const [dossierNameModalColor, setDossierNameModalColor] = React.useState<string>(DEFAULT_FOLDER_COLOR);
  const [dossierNameModalIcon, setDossierNameModalIcon] = React.useState<string>('folder');
  const [dossierNameModalColorDirty, setDossierNameModalColorDirty] = React.useState(false);
  const [dossierShareModalOpen, setDossierShareModalOpen] = React.useState(false);
  const [dossierShareLoading, setDossierShareLoading] = React.useState(false);
  const [dossierShareError, setDossierShareError] = React.useState<string | null>(null);
  const [dossierShareLink, setDossierShareLink] = React.useState<string | null>(null);
  const [dossierSharePasswordEnabled, setDossierSharePasswordEnabled] = React.useState(false);
  const [dossierSharePassword, setDossierSharePassword] = React.useState('');
  const [dossierShareAccessMode, setDossierShareAccessMode] = React.useState<'viewer' | 'editor'>('viewer');
  const [dossierShareExpiryEnabled, setDossierShareExpiryEnabled] = React.useState(false);
  const [dossierShareExpiryValue, setDossierShareExpiryValue] = React.useState('7');
  const [dossierShareExpiryUnit, setDossierShareExpiryUnit] = React.useState<'minutes' | 'hours' | 'days' | 'months'>('days');
  const [dossierShareWhitelistEnabled, setDossierShareWhitelistEnabled] = React.useState(false);
  const [dossierWhitelistModalOpen, setDossierWhitelistModalOpen] = React.useState(false);
  const [dossierWhitelistEntries, setDossierWhitelistEntries] = React.useState<Array<{ id: string; email: string; created_at: string }>>([]);
  const [dossierWhitelistLoading, setDossierWhitelistLoading] = React.useState(false);
  const [dossierWhitelistError, setDossierWhitelistError] = React.useState<string | null>(null);
  const [dossierWhitelistEmail, setDossierWhitelistEmail] = React.useState('');
  const [dossierWhitelistSaving, setDossierWhitelistSaving] = React.useState(false);
  const [dossierShareListOpen, setDossierShareListOpen] = React.useState(false);
  const [dossierShareListLoading, setDossierShareListLoading] = React.useState(false);
  const [dossierShareListError, setDossierShareListError] = React.useState<string | null>(null);
  const [dossierShareList, setDossierShareList] = React.useState<DossierShareListItem[]>([]);
  const dossierFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const dossierContainerRef = React.useRef<HTMLDivElement | null>(null);
  const dossierNameInputRef = React.useRef<HTMLInputElement | null>(null);
  const dossierShareInputRef = React.useRef<HTMLInputElement | null>(null);
  const { clients, loading: clientsLoading } = useClients();
  const [maintenanceOptions, setMaintenanceOptions] = React.useState<Array<{ id: string; title: string; status: string; cost: number | null; equipment_name?: string }>>([]);
  const [loadingMaintenanceOptions, setLoadingMaintenanceOptions] = React.useState(false);
  const [showAddMaintenance, setShowAddMaintenance] = React.useState(false);
  const [selectedMaintenanceId, setSelectedMaintenanceId] = React.useState('');
  const [maintenanceLabel, setMaintenanceLabel] = React.useState('');
  const [maintenanceAmount, setMaintenanceAmount] = React.useState('');
  const [addingMaintenance, setAddingMaintenance] = React.useState(false);
  const [linkedInvoiceId, setLinkedInvoiceId] = React.useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [paymentAmount, setPaymentAmount] = React.useState('');
  const [savingPayment, setSavingPayment] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [serviceForm, setServiceForm] = React.useState<ServiceFormState | null>(null);
  const [serviceSingleDay, setServiceSingleDay] = React.useState(false);
  const [serviceSingleDayMenuOpen, setServiceSingleDayMenuOpen] = React.useState(false);
  const serviceSingleDayMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [serviceSaving, setServiceSaving] = React.useState(false);
  const [isSavingOverlayVisible, setIsSavingOverlayVisible] = React.useState(false);
  const [paymentHistory, setPaymentHistory] = React.useState<PaymentHistoryEntry[]>([]);
  const [loadingPayments, setLoadingPayments] = React.useState(false);
  const [showDeleteOptions, setShowDeleteOptions] = React.useState(false);
  const [deleteAction, setDeleteAction] = React.useState<'archive' | 'purge' | null>(null);
  const [clientHistory, setClientHistory] = React.useState<ClientHistoryRow[]>([]);
  const [loadingClientHistory, setLoadingClientHistory] = React.useState(false);
  const [activeDocPreviewUrl, setActiveDocPreviewUrl] = React.useState<string | null>(null);
  const [showEarlyReturnConfirm, setShowEarlyReturnConfirm] = React.useState(false);
  const [activityLogs, setActivityLogs] = React.useState<RentalActivityLog[]>([]);
  const [loadingActivityLogs, setLoadingActivityLogs] = React.useState(false);
  const [activityLogsError, setActivityLogsError] = React.useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelPaymentMode, setCancelPaymentMode] = React.useState<'no_payment' | 'keep' | 'refund_partial' | 'refund_full'>('no_payment');
  const [cancelRefundAmount, setCancelRefundAmount] = React.useState('');
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = React.useState(false);
  const [showFileExplorer, setShowFileExplorer] = React.useState(false);
  const generalFormRef = React.useRef<HTMLFormElement | null>(null);
  const [colorName, setColorName] = React.useState<string | null>(null);
  const colorNameCache = React.useRef(new Map<string, string>());
  const [tabDirection, setTabDirection] = React.useState<'forward' | 'backward'>('forward');
  const prevTabRef = React.useRef(activeTab);

  const workflowStatus = React.useMemo(() => {
    if (!rental) return 'pending';
    if (rental.status === 'paid' || rental.status === 'archived') {
      if (rental.returned_at || rental.return_info?.status === 'completed') return 'returned';
      if (rental.delivered_at) return 'delivered';
      return 'confirmed';
    }
    return rental.status;
  }, [rental]);

  const normalizedWorkflowStatus = React.useMemo(() => {
    const map: Record<string, string> = {
      in_progress: 'delivered',
      completed: 'returned',
    };
    return map[workflowStatus] || workflowStatus;
  }, [workflowStatus]);

  const documentReference = React.useMemo(() => {
    const ref = rental?.reference_code?.trim();
    if (ref) return ref;
    if (rental?.id) return rental.id.slice(0, 6).toUpperCase();
    return 'DOC';
  }, [rental?.id, rental?.reference_code]);

  const docTitleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    if (docs.length === 0) return map;
    const counters: Record<string, number> = {};
    const sorted = [...docs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    sorted.forEach((doc) => {
      const docType = doc.doc_type || 'doc';
      counters[docType] = (counters[docType] || 0) + 1;
      map.set(doc.id, buildRentalDocTitle(docType, documentReference, counters[docType]));
    });
    return map;
  }, [docs, documentReference]);

  const getNextDocumentTitle = React.useCallback((docType: string) => {
    const nextIndex = docs.filter(d => d.doc_type === docType).length + 1;
    return buildRentalDocTitle(docType, documentReference, nextIndex);
  }, [docs, documentReference]);

  React.useEffect(() => {
    if (!activeDocId) {
      setActiveDocPreviewUrl(null);
      return;
    }
    const doc = docs.find(d => d.id === activeDocId);
    if (!doc) {
      setActiveDocPreviewUrl(null);
      return;
    }
    const docTitle = docTitleMap.get(doc.id) || doc.title;
    const blob = dataUrlToBlob(doc.file_url);
    if (!blob) {
      setActiveDocPreviewUrl(doc.file_url);
      return;
    }
    const file = new File([blob], `${sanitizeFilename(docTitle)}.pdf`, { type: blob.type || 'application/pdf' });
    const url = URL.createObjectURL(file);
    setActiveDocPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activeDocId, docs, docTitleMap]);

  const fetchActivityLogs = React.useCallback(async () => {
    if (!rental?.id) return;
    setLoadingActivityLogs(true);
    setActivityLogsError(null);
    try {
      const { data, error } = await supabase
        .from('rental_activity_logs')
        .select('id, rental_id, actor_id, actor_name, action, details, metadata, created_at')
        .eq('rental_id', rental.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setActivityLogs((data || []) as RentalActivityLog[]);
    } catch (err) {
      console.error('load activity logs', err);
      setActivityLogsError("Impossible de charger l'historique.");
    } finally {
      setLoadingActivityLogs(false);
    }
  }, [rental?.id]);

  const recordActivities = React.useCallback(
    async (entries: ActivityEntry[]) => {
      if (!rental?.id || entries.length === 0) return;
      try {
        const actorName = user?.full_name || user?.email || 'Système';
        const payload = entries.map((entry) => ({
          rental_id: rental.id,
          actor_id: user?.id || null,
          actor_name: actorName,
          action: entry.action,
          details: entry.details || null,
          metadata: entry.metadata || null,
        }));
        const { data, error } = await supabase
          .from('rental_activity_logs')
          .insert(payload)
          .select('id, rental_id, actor_id, actor_name, action, details, metadata, created_at');
        if (error) throw error;
        if (Array.isArray(data) && data.length > 0) {
          const ordered = data.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setActivityLogs((prev) => [...(ordered as RentalActivityLog[]), ...prev]);
        }
      } catch (err) {
        console.error('record activities', err);
      }
    },
    [rental?.id, user?.email, user?.full_name, user?.id]
  );

  const recordActivity = React.useCallback(
    async (action: string, details?: string, metadata?: Record<string, any> | null) => {
      await recordActivities([{ action, details, metadata }]);
    },
    [recordActivities]
  );

  const formatRentalType = React.useCallback((value?: string | null) => {
    if (value === 'service') return 'Prestation';
    if (value === 'sale') return 'Vente';
    return 'Location';
  }, []);
  const formatRentalTypeLower = React.useCallback((value?: string | null) => {
    if (value === 'service') return 'prestation';
    if (value === 'sale') return 'vente';
    return 'location';
  }, []);

  const formatClientName = React.useCallback((clientId?: string | null) => {
    if (!clientId) return '—';
    return clients.find((c) => c.id === clientId)?.name || '—';
  }, [clients]);

  const formatDiscountLabel = React.useCallback((discountType?: string | null, discountValue?: number | null) => {
    if (!discountType) return 'Aucune';
    if (discountType === 'percentage') return `${Number(discountValue || 0)}%`;
    return formatMoney(Number(discountValue || 0));
  }, []);

  const buildRentalUpdateEntries = React.useCallback((prev: Rental, updates: Partial<Rental>): ActivityEntry[] => {
    const merged = { ...prev, ...updates } as Rental;
    const entries: ActivityEntry[] = [];
    const fields: Array<{ key: keyof Rental; label: string; format?: (value: any) => string }> = [
      { key: 'title', label: 'Titre' },
      { key: 'client_id', label: 'Client', format: formatClientName },
      { key: 'type', label: 'Type', format: formatRentalType },
      { key: 'start_date', label: 'Début de facturation', format: formatDateTimeDisplay },
      { key: 'end_date', label: 'Fin de facturation', format: formatDateTimeDisplay },
      { key: 'usage_start_date', label: "Début d'utilisation", format: (v) => v ? formatDateTimeDisplay(v) : 'Non renseigné' },
      { key: 'usage_end_date', label: "Fin d'utilisation", format: (v) => v ? formatDateTimeDisplay(v) : 'Non renseigné' },
      { key: 'location', label: 'Lieu' },
      { key: 'color', label: 'Couleur' },
      { key: 'description', label: 'Description', format: (value) => truncateText(value) },
      { key: 'notes', label: 'Info client', format: (value) => truncateText(value) },
      {
        key: 'client_represents_company',
        label: 'Profil client',
        format: (value) => (value ? 'Entreprise' : 'Particulier'),
      },
    ];

    const formatField = (field: { key: keyof Rental; format?: (value: any) => string }, value: any) => {
      if (field.format) return field.format(value);
      const normalized = (value ?? '').toString().trim();
      return normalized || '—';
    };

    fields.forEach((field) => {
      const prevValue = formatField(field, prev[field.key]);
      const nextValue = formatField(field, merged[field.key]);
      if (prevValue !== nextValue) {
        entries.push({
          action: 'rental_updated',
          details: `${field.label}: ${prevValue} -> ${nextValue}`,
          metadata: { field: field.key },
        });
      }
    });

    const prevDiscount = formatDiscountLabel(prev.discount_type, prev.discount_value);
    const nextDiscount = formatDiscountLabel(merged.discount_type, merged.discount_value);
    if (prevDiscount !== nextDiscount) {
      entries.push({
        action: 'rental_updated',
        details: `Remise: ${prevDiscount} -> ${nextDiscount}`,
        metadata: { field: 'discount' },
      });
    }
    return entries;
  }, [formatClientName, formatDiscountLabel, formatRentalType]);

  React.useEffect(() => {
    if (!rental?.id) return;
    fetchActivityLogs();
  }, [fetchActivityLogs, rental?.id]);

  React.useEffect(() => {
    let cancelled = false;
    const loadPayments = async () => {
      if (!rental?.id) {
        setPaymentHistory([]);
        setLoadingPayments(false);
        return;
      }
      setLoadingPayments(true);
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('id, amount, payment_method, payment_date, reference, status, invoice_id, payment_type')
          .eq('rental_id', rental.id)
          .order('payment_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (!cancelled) {
          const entries: PaymentHistoryEntry[] = (data || []).map(mapPaymentRow);
          setPaymentHistory(entries);
        }
      } catch (err) {
        console.error('load payments', err);
        if (!cancelled) setPaymentHistory([]);
      } finally {
        if (!cancelled) setLoadingPayments(false);
      }
    };

    loadPayments();
    return () => {
      cancelled = true;
    };
  }, [rental?.id]);

  React.useEffect(() => {
    if (!rental?.id) { setLinkedInvoiceId(null); return; }
    (supabase as any)
      .from('invoices')
      .select('id')
      .eq('rental_id', rental.id)
      .not('document_type', 'eq', 'quote')
      .not('document_type', 'eq', 'credit_note')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => {
        setLinkedInvoiceId(data?.id ?? null);
      });
  }, [rental?.id]);

  const isCancelled = rental?.status === 'cancelled';
  const hasReturnDelivery = Boolean(rental?.delivery_round_trip);
  const deliveryStepPending = Boolean(
    rental && !rental.delivered_at && normalizedWorkflowStatus === 'delivered'
  );
  const canConfirmDelivery = Boolean(
    rental && !rental.delivered_at && ['in_progress', 'delivered', 'paid'].includes(rental.status)
  );
  const canConfirmReturnDelivery = Boolean(
    rental
      && rental.delivery_round_trip
      && rental.delivered_at
      && !rental.return_delivery_at
      && ['return_delivery', 'delivered', 'paid'].includes(rental.status)
  );

  const shouldWarnEarlyReturn = React.useMemo(() => {
    if (!rental) return false;
    try {
      const end = new Date(rental.end_date);
      const now = new Date();
      return now < end;
    } catch {
      return false;
    }
  }, [rental]);

  const maintenanceCharges = rental?.maintenance_charges || [];
  const personnelAssignments = rental?.assigned_personnel || [];
  const personnelServices = rental?.personnel_services || [];
  const personnelServicesTotal = personnelServices.reduce((sum, service) => {
    const unit = Number(service.cost_per_person || 0);
    const safeUnit = Number.isFinite(unit) ? unit : 0;
    const qty = Number(service.quantity || 0);
    const days = Number(service.days || 0);
    const discount = clampPercent(service.discount_percent || 0);
    return sum + safeUnit * qty * days * (1 - discount / 100);
  }, 0);
  const insuranceServices = rental?.insurance_services || [];
  const insuranceServicesTotal = insuranceServices.reduce((sum, service) => {
    const unit = Number(service.amount_per_day || 0);
    const safeUnit = Number.isFinite(unit) ? unit : 0;
    const days = Number(service.days || 0);
    return sum + safeUnit * days;
  }, 0);
  const otherServices = rental?.other_services || [];
  const otherServicesTotal = otherServices.reduce((sum, service) => {
    const unit = Number(service.price || 0);
    const safeUnit = Number.isFinite(unit) ? unit : 0;
    const qty = Number(service.quantity || 0);
    const days = Number(service.days || 0);
    return sum + safeUnit * qty * days;
  }, 0);
  const rentalDays = rental
    ? Math.max(1, Math.ceil((new Date(rental.end_date).getTime() - new Date(rental.start_date).getTime()) / (1000 * 60 * 60 * 24)))
    : 1;
  const companyCoefficientMode = normalizeRentalCoefficientMode(settings?.rental_coefficient_mode);
  const companyCoefficient = React.useMemo(() => {
    if (!settings) return null;
    return computeRentalCoefficient(companyCoefficientMode, rentalDays, settings.rental_coefficient_formula);
  }, [companyCoefficientMode, rentalDays, settings]);
  const defaultCoefficient = companyCoefficient ?? rentalDays;
  const overrideCoefficient = rental?.rental_coefficient_override;
  const normalizedOverrideCoefficient = Number.isFinite(Number(overrideCoefficient))
    ? Number(overrideCoefficient)
    : null;
  const hasCoefficientOverride = normalizedOverrideCoefficient != null && normalizedOverrideCoefficient > 0;
  const effectiveCoefficient = hasCoefficientOverride
    ? (normalizedOverrideCoefficient ?? defaultCoefficient)
    : defaultCoefficient;
  const defaultCoefficientLabel = defaultCoefficient.toFixed(2);
  const effectiveCoefficientLabel = effectiveCoefficient.toFixed(2);
  const companyCoefficientLabel = companyCoefficientMode === 'formula'
    ? 'Formule'
    : companyCoefficientMode === 'automatic'
      ? 'Automatique'
      : 'Sans coefficient';

  const computeItemsSubtotal = React.useCallback((items: RentalItem[], coefficientValue: number) => {
    return items.reduce((sum, item) => {
      const base = item.price_per_day * item.quantity * coefficientValue;
      const discount = Number.isFinite(item.discount_percent)
        ? Math.min(100, Math.max(0, Number(item.discount_percent)))
        : 0;
      return sum + base * (1 - discount / 100);
    }, 0);
  }, []);

  const equipmentSubtotal = rental ? computeItemsSubtotal(rental.items, effectiveCoefficient) : 0;
  const deliverySubtotal = rental ? Number(rental.delivery_total_amount || 0) : 0;
  const maintenanceSubtotal = maintenanceCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
  const subtotal = equipmentSubtotal + maintenanceSubtotal + deliverySubtotal + personnelServicesTotal + insuranceServicesTotal + otherServicesTotal;
  const storedTotal = rental ? Number(rental.total_price || 0) : 0;
  const discountValue = rental && rental.discount_type === 'percentage'
    ? subtotal * ((rental.discount_value || 0) / 100)
    : (rental?.discount_value || 0);
  const computedTotal = Math.max(0, subtotal - (discountValue || 0));
  const usesCoefficient = companyCoefficientMode !== 'none' || hasCoefficientOverride;
  const totalTTC = Math.max(
    0,
    usesCoefficient ? computedTotal : Math.max(computedTotal, storedTotal + maintenanceSubtotal)
  );

  React.useEffect(() => {
    if (!rental) return;
    if (coefficientDirty) return;
    const baseValue = hasCoefficientOverride
      ? normalizedOverrideCoefficient
      : defaultCoefficient;
    setCoefficientInput(baseValue ? baseValue.toFixed(2) : '');
  }, [coefficientDirty, defaultCoefficient, hasCoefficientOverride, normalizedOverrideCoefficient, rental]);

  const totalPaid = React.useMemo(() => {
    return paymentHistory.reduce((sum, payment) => {
      if (payment.status === 'failed') return sum;
      return sum + (Number.isFinite(payment.amount) ? payment.amount : 0);
    }, 0);
  }, [paymentHistory]);

  const remainingAmount = Math.max(0, totalTTC - totalPaid);
  const hasRecordedPayment = paymentHistory.some((payment) => payment.status !== 'failed');
  const isFreeRental = totalTTC <= 0.009;
  const isMarkedPaid = rental?.status === 'paid';
  const isFullyPaid = isMarkedPaid || (isFreeRental ? hasRecordedPayment : totalPaid + 0.009 >= totalTTC);
  const isPartiallyPaid = !isFullyPaid && hasRecordedPayment;
  const isPaidOrPartiallyPaid = Boolean(rental && (rental.status === 'paid' || isFullyPaid || isPartiallyPaid));
  const hasOutstandingBalance = remainingAmount > 0.009;
  const canRecordPayment = isFreeRental ? !isFullyPaid : hasOutstandingBalance;
  const deleteBusy = deleteAction !== null;
  const hasPayments = totalPaid > 0.009;
  const isRentalReturned = React.useMemo(() => {
    if (!rental) return false;
    if (rental.returned_at) return true;
    return rental.return_info?.status === 'completed';
  }, [rental]);

  const paymentState = isFullyPaid ? 'paid' : isPartiallyPaid ? 'partial' : 'unpaid';

  const paidStepState: StepState = paymentState === 'paid'
    ? 'completed'
    : paymentState === 'partial'
      ? 'current'
      : 'upcoming';
  const paidStatusLabel = paymentState === 'paid'
    ? 'Payée'
    : paymentState === 'partial'
      ? 'Partiellement payée'
      : 'Non payée';
  const paidStepTone: ProgressStepTone = paymentState === 'paid'
    ? 'success'
    : paymentState === 'partial'
      ? 'warning'
      : 'muted';

  const currentOrder = React.useMemo(() => {
    const status = normalizedWorkflowStatus;
    if (status === 'pending') return STEP_ORDER.created;
    if (status === 'confirmed') return STEP_ORDER.validated;
    if (status === 'preparing') return STEP_ORDER.prepared;
    if (status === 'return_delivery') return STEP_ORDER.delivered;
    if (status === 'in_return') return hasReturnDelivery ? STEP_ORDER.return_delivery : STEP_ORDER.delivered;
    if (status === 'returned' || status === 'completed') return STEP_ORDER.returned;
    if (status === 'paid' || status === 'archived') return STEP_ORDER.paid;
    return STEP_ORDER.delivered;
  }, [normalizedWorkflowStatus, hasReturnDelivery]);

  const computeStepState = React.useCallback((stepId: ProgressStepId): StepState => {
    if (isCancelled) {
      if (stepId === 'created') return 'completed';
      if (stepId === 'validated') return 'cancelled';
      return 'upcoming';
    }
    if (stepId === 'created') return 'completed';
    if (deliveryStepPending) {
      if (STEP_ORDER[stepId] < STEP_ORDER.delivered) return 'completed';
      if (stepId === 'delivered') return 'current';
      return 'upcoming';
    }
    const order = STEP_ORDER[stepId];
    if (!order) return 'upcoming';
    if (currentOrder >= order) return 'completed';
    if (currentOrder + 1 === order) return 'current';
    return 'upcoming';
  }, [currentOrder, deliveryStepPending, isCancelled]);

  const steps = React.useMemo(() => {
    const base: Array<{ id: ProgressStepId; label: string; icon: any }> = [
      { id: 'created', label: 'Créée', icon: FilePlus2 },
      { id: 'validated', label: isCancelled ? 'Refusée' : 'Validée', icon: isCancelled ? ShieldX : ShieldCheck },
      { id: 'prepared', label: 'Préparée', icon: Wrench },
      { id: 'delivered', label: 'Livraison', icon: Truck },
    ];
    if (hasReturnDelivery) {
      base.push({ id: 'return_delivery', label: 'Livraison retour', icon: Truck });
    }
    base.push(
      { id: 'returned', label: 'Retournée', icon: Undo2 },
      { id: 'paid', label: 'Payée', icon: CreditCard },
    );
    return base;
  }, [isCancelled, hasReturnDelivery]);

  const stepsWithState = React.useMemo(() => steps.map(step => ({
    ...step,
    state: step.id === 'paid' ? paidStepState : computeStepState(step.id),
  })), [steps, computeStepState, paidStepState]);
  const allStepsCompleted = React.useMemo(() => stepsWithState.length > 0 && stepsWithState.every((step) => step.state === 'completed'), [stepsWithState]);

  const statusBadgeInfo = React.useMemo(() => {
    if (!rental) {
      return { tone: 'slate' as BadgeTone, label: '-' };
    }
    return {
      tone: getRentalStatusTone(rental.status),
      label: getRentalStatusLabel(rental.status, { cancelledAt: rental.cancelled_at }),
    };
  }, [rental]);

  const canLaunchReturn = React.useMemo(() => {
    if (!rental) return false;
    if (rental.returned_at || (rental.return_info && rental.return_info.status === 'completed')) return false;
    if (['cancelled', 'archived'].includes(rental.status)) return false;
    if (rental.delivery_round_trip) {
      const eligibleStatuses: Array<Rental['status']> = ['in_return', 'paid'];
      if (!eligibleStatuses.includes(rental.status)) return false;
      return Boolean(rental.delivered_at);
    } else {
      const eligibleStatuses: Array<Rental['status']> = ['in_progress', 'delivered', 'completed', 'paid', 'in_return'];
      if (!eligibleStatuses.includes(rental.status)) return false;
      // in_progress may not have a formal delivered_at (no delivery step done)
      return rental.status === 'in_progress' || Boolean(rental.delivered_at);
    }
  }, [rental]);

  const handleRemoveGroup = React.useCallback(async (groupId: string) => {
    if (!rental) return;
    const groupLabel = rental.item_groups?.find((group) => group.id === groupId)?.name || 'Groupe';
    try {
      // Delete items belonging to this group
      const itemsInGroup = rental.items.filter(item => item.group_id === groupId);
      if (itemsInGroup.length > 0) {
        await supabase.from('rental_items').delete().in('id', itemsInGroup.map(i => i.id));
      }
      const { error } = await supabase.from('rental_item_groups').delete().eq('id', groupId);
      if (error) throw error;
      setRental(prev => {
        if (!prev) return prev;
        const filteredGroups = resequenceItemGroups((prev.item_groups || []).filter(g => g.id !== groupId));
        const remainingItems = resequenceRentalItems(
          prev.items.filter(item => item.group_id !== groupId),
          filteredGroups,
        );
        return { ...prev, item_groups: filteredGroups, items: remainingItems };
      });
      recordActivity('group_removed', `${groupLabel} retiré`, { group_id: groupId });
    } catch (err) {
      console.error('remove group', err);
      toast.error('Impossible de supprimer le groupe');
    }
  }, [recordActivity, rental, setRental]);

  const handleAddGroup = React.useCallback(async (name: string, color?: string) => {
    if (!rental) return;
    const position = (rental.item_groups || []).length;
    try {
      const { data, error } = await supabase
        .from('rental_item_groups')
        .insert([{ rental_id: rental.id, name: name.trim(), position, color: color || null }])
        .select('id, name, position, color')
        .single();
      if (error) throw error;
      const newGroup: RentalItemGroup = { id: data.id, name: data.name, position: data.position, color: data.color || null };
      setRental(prev => {
        if (!prev) return prev;
        const groups = prev.item_groups || [];
        const resequenced = resequenceItemGroups([...groups, newGroup]);
        return { ...prev, item_groups: resequenced };
      });
    } catch (err) {
      console.error('add group', err);
      toast.error('Impossible de créer le groupe');
    }
  }, [rental, setRental]);

  const handleSplitItem = React.useCallback(async (itemId: string) => {
    if (!rental) return;
    const item = rental.items.find((it) => it.id === itemId);
    if (!item || item.quantity <= 1) return;

    const siblings = rental.items.filter((it) => (it.group_id || null) === (item.group_id || null));
    const newPosition = (item.position ?? 0) + 0.5;

    try {
      // Reduce original quantity
      const { error: updErr } = await supabase
        .from('rental_items')
        .update({ quantity: item.quantity - 1 })
        .eq('id', itemId);
      if (updErr) throw updErr;

      // Insert new split row with quantity 1
      const insertPayload: Record<string, unknown> = {
        rental_id: rental.id,
        equipment_id: item.equipment_id || null,
        quantity: 1,
        price_per_day: item.price_per_day,
        discount_percent: item.discount_percent ?? 0,
        group_id: item.group_id || null,
        position: newPosition,
        is_external: item.is_external ?? false,
      };
      if (item.is_external) {
        insertPayload.external_name = item.equipment_name;
        insertPayload.external_type = item.equipment_type;
        if ((item as any).external_supplier) insertPayload.external_supplier = (item as any).external_supplier;
      }

      const { data, error: insErr } = await supabase
        .from('rental_items')
        .insert([insertPayload])
        .select('id, equipment_id, quantity, price_per_day, discount_percent, group_id, position, equipment:equipment_id(name, type), is_external, external_name, external_type, external_supplier')
        .single();
      if (insErr) throw insErr;

      const newItem: RentalItem = {
        id: data.id,
        equipment_id: data.equipment_id,
        equipment_name: data.equipment?.name || item.equipment_name,
        equipment_type: data.equipment?.type || item.equipment_type,
        quantity: 1,
        price_per_day: data.price_per_day,
        discount_percent: data.discount_percent ?? 0,
        group_id: data.group_id,
        position: data.position,
        is_external: !!data.is_external,
      } as RentalItem;

      setRental(prev => {
        if (!prev) return prev;
        const updated = prev.items.map((it) =>
          it.id === itemId ? { ...it, quantity: it.quantity - 1 } : it
        );
        return { ...prev, items: [...updated, newItem] };
      });
    } catch (err) {
      console.error('split item', err);
      toast.error('Impossible de séparer l\'élément');
    }
  }, [rental, setRental]);

  const handleRenameGroup = React.useCallback(async (groupId: string, newName: string) => {
    if (!rental) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    setRental(prev => {
      if (!prev) return prev;
      return { ...prev, item_groups: (prev.item_groups || []).map(g => g.id === groupId ? { ...g, name: trimmed } : g) };
    });
    try {
      await supabase.from('rental_item_groups').update({ name: trimmed }).eq('id', groupId);
    } catch (err) {
      console.error('rename group', err);
      toast.error('Impossible de renommer le groupe');
    }
  }, [rental, setRental]);

  const handleAutoCreateGroups = React.useCallback(async () => {
    if (!rental) return;
    const items = rental.items;
    if (items.length === 0) return;

    // Unique categories in item order
    const seen = new Set<string>();
    const orderedTypes: string[] = [];
    items.forEach(it => {
      const t = (it.equipment_type || 'Autre').trim();
      if (!seen.has(t)) { seen.add(t); orderedTypes.push(t); }
    });

    // Existing groups by name (avoid duplicates)
    const existingGroups = rental.item_groups || [];
    const existingByName = new Map(existingGroups.map(g => [g.name.trim().toLowerCase(), g]));

    try {
      // Create missing groups
      const typeToGroup = new Map<string, RentalItemGroup>();
      existingGroups.forEach(g => typeToGroup.set(g.name.trim().toLowerCase(), g));

      const toCreate = orderedTypes.filter(t => !existingByName.has(t.toLowerCase()));
      let position = existingGroups.length;
      const created: RentalItemGroup[] = [];

      for (const typeName of toCreate) {
        const { data, error } = await supabase
          .from('rental_item_groups')
          .insert([{ rental_id: rental.id, name: typeName, position: position++, color: null }])
          .select('id, name, position, color')
          .single();
        if (error) throw error;
        const g: RentalItemGroup = { id: data.id, name: data.name, position: data.position, color: data.color || null };
        created.push(g);
        typeToGroup.set(typeName.toLowerCase(), g);
      }

      const allGroups = resequenceItemGroups([...existingGroups, ...created]);

      // Assign each item to the group matching its category
      const updatedItems = items.map(it => {
        const key = (it.equipment_type || 'Autre').trim().toLowerCase();
        const group = typeToGroup.get(key);
        return group ? { ...it, group_id: group.id } : it;
      });

      // Persist item group_id updates
      await Promise.all(
        updatedItems.map(it =>
          supabase.from('rental_items').update({ group_id: it.group_id }).eq('id', it.id)
        )
      );

      const resequenced = resequenceRentalItems(updatedItems, allGroups);
      setRental(prev => prev ? { ...prev, item_groups: allGroups, items: resequenced } : prev);
      toast.success('Groupes créés par catégorie');
    } catch (err) {
      console.error('auto group', err);
      toast.error('Impossible de créer les groupes automatiquement');
    }
  }, [rental, setRental]);

  const handleMoveGroup = React.useCallback(async ({ groupId, beforeGroupId }: { groupId: string; beforeGroupId: string | null }) => {
    if (!rental) return;
    const sorted = sortItemGroups(rental.item_groups || []);
    const moving = sorted.find(g => g.id === groupId);
    if (!moving) return;
    const filtered = sorted.filter(g => g.id !== groupId);
    const insertAt = beforeGroupId === null ? filtered.length : filtered.findIndex(g => g.id === beforeGroupId);
    filtered.splice(insertAt === -1 ? filtered.length : insertAt, 0, moving);
    const resequenced = resequenceItemGroups(filtered);
    const updatedItems = resequenceRentalItems(rental.items, resequenced);
    // Optimistic update
    setRental(prev => prev ? { ...prev, item_groups: resequenced, items: updatedItems } : prev);
    try {
      await Promise.all(
        resequenced.map(g => supabase.from('rental_item_groups').update({ position: g.position }).eq('id', g.id))
      );
    } catch (err) {
      console.error('move group', err);
    }
  }, [rental, setRental]);

  const handleMoveItem = React.useCallback(async ({ itemId, targetGroupId, beforeItemId }: { itemId: string; targetGroupId: string | null; beforeItemId?: string | null }) => {
    if (!rental) return;
    const item = rental.items.find(it => it.id === itemId);
    if (!item) return;
    const remaining = rental.items.filter(it => it.id !== itemId);
    const bucket = new Map<string | null, RentalItem[]>();
    remaining.forEach(it => {
      const key = it.group_id || null;
      const arr = bucket.get(key) || [];
      arr.push(it);
      bucket.set(key, arr);
    });
    const targetBucket = bucket.get(targetGroupId) || [];
    const movedItem = { ...item, group_id: targetGroupId };
    if (beforeItemId) {
      const idx = targetBucket.findIndex(it => it.id === beforeItemId);
      targetBucket.splice(idx === -1 ? targetBucket.length : idx, 0, movedItem);
    } else {
      targetBucket.push(movedItem);
    }
    bucket.set(targetGroupId, targetBucket);
    const updatedItems = resequenceRentalItems(Array.from(bucket.values()).flat(), rental.item_groups || []);
    // Optimistic update
    setRental(prev => prev ? { ...prev, items: updatedItems } : prev);
    try {
      await Promise.all(
        updatedItems.map(it => supabase.from('rental_items').update({ group_id: it.group_id || null, position: it.position }).eq('id', it.id))
      );
    } catch (err) {
      console.error('move item', err);
    }
  }, [rental, setRental]);

  const handleGroupColorChange = React.useCallback(async (groupId: string, color: string) => {
    // Optimistic update
    setRental(prev => {
      if (!prev) return prev;
      return { ...prev, item_groups: (prev.item_groups || []).map(g => g.id === groupId ? { ...g, color } : g) };
    });
    try {
      const { error } = await supabase.from('rental_item_groups').update({ color }).eq('id', groupId);
      if (error) throw error;
    } catch (err) {
      console.error('group color change', err);
    }
  }, [setRental]);

  // Delivery tab state (must be declared before any early return)
  const [deliveryRows, setDeliveryRows] = React.useState<Array<{
    id?: string;
    vehicle_id: string;
    delivery_at?: string;
    appointment_at?: string;
    return_delivery_at?: string;
    return_appointment_at?: string;
  }>>([]);
  const [initialAssignmentIds, setInitialAssignmentIds] = React.useState<string[]>([]);
  const [loadingDelivery, setLoadingDelivery] = React.useState(false);
  const { offers: deliveryOffers = [], loading: deliveryOffersLoading } = useDeliveryOffers();
  const [deliveryOfferId, setDeliveryOfferId] = React.useState('');
  const [deliveryQuantityInput, setDeliveryQuantityInput] = React.useState('');
  const [deliveryTripType, setDeliveryTripType] = React.useState<'one_way' | 'round_trip'>('one_way');
  const [savingDeliveryOffer, setSavingDeliveryOffer] = React.useState(false);
  const [deliveryAddressEdit, setDeliveryAddressEdit] = React.useState(rental?.delivery_address || '');
  const [savingDeliveryAddress, setSavingDeliveryAddress] = React.useState(false);

  React.useEffect(() => {
    setDeliveryAddressEdit(rental?.delivery_address || '');
  }, [rental?.delivery_address]);

  // Personnel tab state (services only)
  const [personnelAssignmentIds, setPersonnelAssignmentIds] = React.useState<string[]>([]);
  const [savingPersonnelAssignments, setSavingPersonnelAssignments] = React.useState(false);
  const [personnelServiceRows, setPersonnelServiceRows] = React.useState<Array<{
    id?: string;
    service_record_id: string;
    quantity: number;
    days: number;
    discount_percent: number;
  }>>([]);
  const [savingPersonnelServices, setSavingPersonnelServices] = React.useState(false);

  // Insurance tab state
  const [insuranceServiceRows, setInsuranceServiceRows] = React.useState<Array<{
    id?: string;
    service_record_id: string;
    days: number;
  }>>([]);
  const [savingInsuranceServices, setSavingInsuranceServices] = React.useState(false);

  const [otherServiceRows, setOtherServiceRows] = React.useState<Array<{
    id?: string;
    service_record_id: string;
    quantity: number;
    days: number;
  }>>([]);
  const [savingOtherServices, setSavingOtherServices] = React.useState(false);

  React.useEffect(() => {
    const loadAssignments = async () => {
      if (!id) return;
      setLoadingDelivery(true);
      try {
        const { data, error } = await supabase
          .from('vehicle_assignments')
          .select('id, vehicle_id, delivery_at, appointment_at, return_delivery_at, return_appointment_at')
          .eq('rental_id', id)
          .order('created_at', { ascending: true });
        if (error) throw error;
        const rows = (data || []).map((r: any) => ({
          id: r.id as string,
          vehicle_id: r.vehicle_id as string,
          delivery_at: r.delivery_at ? new Date(r.delivery_at).toISOString().slice(0,16) : undefined,
          appointment_at: r.appointment_at ? new Date(r.appointment_at).toISOString().slice(0,16) : undefined,
          return_delivery_at: r.return_delivery_at ? new Date(r.return_delivery_at).toISOString().slice(0,16) : undefined,
          return_appointment_at: r.return_appointment_at ? new Date(r.return_appointment_at).toISOString().slice(0,16) : undefined,
        }));
        setDeliveryRows(rows);
        setInitialAssignmentIds(rows.filter(r => r.id).map(r => r.id!) as string[]);
      } catch (e) {
        console.error('load vehicle assignments', e);
      } finally { setLoadingDelivery(false); }
    };
    loadAssignments();
  }, [id]);

  React.useEffect(() => {
    const fetchDocs = async () => {
      if (!id) return;
      const { data, error } = await supabase
        .from('rental_documents')
        .select('id, title, doc_type, file_url, created_at')
        .eq('rental_id', id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('load docs', error);
        return;
      }
      setDocs(data || []);
      setActiveDocId((data && data[0]?.id) || null);
    };
    fetchDocs();
  }, [id]);

  const fetchDossierEntries = React.useCallback(async () => {
    if (!rental?.id) return;
    setDossierLoading(true);
    setDossierError(null);
    try {
      const { data, error } = await supabase
        .from('rental_dossier_entries')
        .select('id, rental_id, parent_id, entry_type, name, file_url, file_name, file_type, file_size, color, icon, created_at')
        .eq('rental_id', rental.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setDossierEntries((data || []) as typeof dossierEntries);
    } catch (err) {
      console.error('load dossier entries', err);
      setDossierError('Impossible de charger le dossier.');
    } finally {
      setDossierLoading(false);
    }
  }, [rental?.id]);

  React.useEffect(() => {
    if (!rental?.id) return;
    fetchDossierEntries();
  }, [fetchDossierEntries, rental?.id]);

  React.useEffect(() => {
    if (!dossierFolderId) return;
    const exists = dossierEntries.some((entry) => entry.id === dossierFolderId && entry.entry_type === 'folder');
    if (!exists) {
      setDossierFolderId(null);
    }
  }, [dossierEntries, dossierFolderId]);

  React.useEffect(() => {
    setDossierSelectedEntryIds([]);
    setDossierSelectionAnchorId(null);
    setDossierContextMenu(null);
  }, [dossierFolderId]);

  React.useEffect(() => {
    if (!dossierContextMenu) return;
    const handleClose = () => setDossierContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDossierContextMenu(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [dossierContextMenu]);

  React.useEffect(() => {
    if (!dossierNameModalOpen) return;
    const focusTimer = window.setTimeout(() => {
      dossierNameInputRef.current?.focus();
      dossierNameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [dossierNameModalOpen]);

  React.useEffect(() => {
    const loadMaintenanceOptions = async () => {
      try {
        setLoadingMaintenanceOptions(true);
        const { data, error } = await supabase
          .from('maintenance_tasks')
          .select('id, title, status, cost, equipment:equipment_id(name)')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        setMaintenanceOptions((data || []).map((row: any) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          cost: row.cost,
          equipment_name: row.equipment?.name || undefined,
        })));
      } catch (err) {
        console.error('load maintenance options', err);
      } finally {
        setLoadingMaintenanceOptions(false);
      }
    };

    loadMaintenanceOptions();
  }, []);

  React.useEffect(() => {
    const clientId = rental?.client_id;
    if (!clientId) {
      setClientHistory([]);
      setLoadingClientHistory(false);
      return;
    }
    let cancelled = false;
    const loadClientHistory = async () => {
      try {
        setLoadingClientHistory(true);
        const { data, error } = await supabase
          .from('rentals')
          .select(`
            id,
            type,
            start_date,
            total_price,
            status,
            reference_code,
            rental_items (
              equipment_id,
              equipment:equipment_id (
                name
              )
            )
          `)
          .eq('client_id', clientId)
          .order('start_date', { ascending: false })
          .limit(25);
        if (error) throw error;
        if (cancelled) return;
        const rows: ClientHistoryRow[] = (data || []).map((row: any) => {
          const equipmentNames = ((row.rental_items as any[]) || [])
            .map(item => item?.equipment?.name)
            .filter((name: string | undefined | null): name is string => !!name);
          const uniqueNames = Array.from(new Set(equipmentNames));
          let equipmentLabel = '—';
          if (uniqueNames.length > 0) {
            const preview = uniqueNames.slice(0, 3).join(', ');
            equipmentLabel = uniqueNames.length > 3 ? `${preview}…` : preview;
          }
          return {
            id: row.id,
            date: row.start_date,
            type: row.type,
            equipment: equipmentLabel,
            amount: Number(row.total_price || 0),
            status: row.status,
            reference: row.reference_code,
          } as ClientHistoryRow;
        });
        setClientHistory(rows);
      } catch (err) {
        console.error('load client history', err);
        if (!cancelled) setClientHistory([]);
      } finally {
        if (!cancelled) setLoadingClientHistory(false);
      }
    };

    loadClientHistory();
    return () => {
      cancelled = true;
    };
  }, [rental?.client_id, rental?.id]);

  const deliverySummaryLabel = React.useMemo(() => {
    if (!rental) return '';
    if (!rental.delivery_offer_id && !deliverySubtotal) return '';
    const offerName = rental.delivery_offer_name || 'Forfait livraison';
    const unitLabel = getDeliveryUnitLabel(rental.delivery_pricing_type);
    const quantityLabel = rental.delivery_quantity && unitLabel
      ? `${rental.delivery_quantity} ${unitLabel}`
      : '';
    const tripLabel = rental.delivery_round_trip == null
      ? ''
      : rental.delivery_round_trip
        ? 'Aller + retour'
        : 'Aller simple';
    return [offerName, quantityLabel, tripLabel].filter(Boolean).join(' • ');
  }, [rental, deliverySubtotal]);

  const showReturnDeliveryColumns = React.useMemo(
    () => (isEditing ? deliveryTripType === 'round_trip' : hasReturnDelivery),
    [isEditing, deliveryTripType, hasReturnDelivery]
  );

  const activeDeliveryOffers = React.useMemo(
    () => deliveryOffers.filter((offer) => offer.is_active),
    [deliveryOffers]
  );

  const selectedDeliveryOffer = React.useMemo(
    () => activeDeliveryOffers.find((offer) => offer.id === deliveryOfferId) || null,
    [activeDeliveryOffers, deliveryOfferId]
  );
  const personnelServiceOptions = React.useMemo(
    () => services.filter((service) => service.category === 'personnel'),
    [services]
  );
  const personnelServiceLookup = React.useMemo(
    () => new Map(personnelServiceOptions.map((service) => [service.id, service])),
    [personnelServiceOptions]
  );
  const insuranceServiceOptions = React.useMemo(
    () => services.filter((service) => service.category === 'insurance'),
    [services]
  );
  const insuranceServiceLookup = React.useMemo(
    () => new Map(insuranceServiceOptions.map((service) => [service.id, service])),
    [insuranceServiceOptions]
  );
  const otherServiceOptions = React.useMemo(
    () => services.filter((service) => service.category === 'other'),
    [services]
  );
  const otherServiceLookup = React.useMemo(
    () => new Map(otherServiceOptions.map((service) => [service.id, service])),
    [otherServiceOptions]
  );

  const deliveryQuantityValue = React.useMemo(() => {
    if (!deliveryQuantityInput.trim()) return 0;
    const parsed = parseLocalizedNumber(deliveryQuantityInput);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [deliveryQuantityInput]);

  const deliveryQuantityMeta = React.useMemo(() => {
    if (!selectedDeliveryOffer) return { show: false, label: '', unit: '', step: '1' };
    switch (selectedDeliveryOffer.pricing_type) {
      case 'per_km':
        return { show: true, label: 'Distance (km)', unit: 'km', step: '0.1' };
      case 'per_hour':
        return { show: true, label: 'Durée (heures)', unit: 'h', step: '0.5' };
      case 'per_day':
        return { show: true, label: 'Nombre de jours', unit: 'jour(s)', step: '1' };
      case 'per_trip':
        return { show: true, label: 'Nombre de livraisons', unit: 'trajet(s)', step: '1' };
      case 'fixed':
      default:
        return { show: false, label: '', unit: '', step: '1' };
    }
  }, [selectedDeliveryOffer]);

  const resolvedDeliveryQuantity = React.useMemo(() => {
    if (!selectedDeliveryOffer) return 0;
    if (deliveryQuantityValue > 0) return deliveryQuantityValue;
    if (selectedDeliveryOffer.pricing_type === 'fixed' || selectedDeliveryOffer.pricing_type === 'per_trip') {
      return 1;
    }
    return 0;
  }, [selectedDeliveryOffer, deliveryQuantityValue]);

  const deliveryDraftTotal = React.useMemo(() => {
    if (!selectedDeliveryOffer) return 0;
    const base = Number(selectedDeliveryOffer.base_amount || 0);
    const rate = Number(selectedDeliveryOffer.rate_amount || 0);
    const subtotal = base + rate * resolvedDeliveryQuantity;
    const multiplier = deliveryTripType === 'round_trip' ? 2 : 1;
    return Math.max(0, subtotal * multiplier);
  }, [selectedDeliveryOffer, resolvedDeliveryQuantity, deliveryTripType]);

  const deliveryPricingDetails = React.useMemo(() => {
    if (!selectedDeliveryOffer) return '';
    const base = Number(selectedDeliveryOffer.base_amount || 0);
    const rate = Number(selectedDeliveryOffer.rate_amount || 0).toFixed(2);
    const rateLabel = (() => {
      switch (selectedDeliveryOffer.pricing_type) {
        case 'per_km':
          return 'Tarif au km';
        case 'per_hour':
          return 'Tarif horaire';
        case 'per_day':
          return 'Tarif par jour';
        case 'per_trip':
          return 'Tarif par livraison';
        default:
          return 'Prix fixe';
      }
    })();
    if (base > 0) {
      return `${rateLabel} : ${rate} € • Forfait de base : ${base.toFixed(2)} €`;
    }
    return `${rateLabel} : ${rate} €`;
  }, [selectedDeliveryOffer]);

  React.useEffect(() => {
    if (!rental) return;
    if (!isEditing) return;
    setDeliveryOfferId(rental.delivery_offer_id || '');
    setDeliveryQuantityInput(rental.delivery_quantity != null ? String(rental.delivery_quantity) : '');
    setDeliveryTripType(rental.delivery_round_trip ? 'round_trip' : 'one_way');
  }, [rental?.id, isEditing, rental?.delivery_offer_id, rental?.delivery_quantity, rental?.delivery_round_trip]);

  const parsedPaymentAmount = React.useMemo(() => {
    const parsed = parseLocalizedNumber(paymentAmount);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [paymentAmount]);
  const willSettleAmount = isFreeRental
    ? true
    : parsedPaymentAmount > 0 && (totalPaid + parsedPaymentAmount + 0.009 >= totalTTC);
  const willBeDeposit = !isFreeRental && !willSettleAmount && !isRentalReturned && parsedPaymentAmount > 0;
  const isPartialPayment = !isFreeRental && parsedPaymentAmount > 0 && !willSettleAmount;
  const missingReturnItems = React.useMemo(() => {
    if (!rental?.return_info) return [];
    return rental.return_info.items.filter((item) => item.expected_quantity > item.returned_quantity);
  }, [rental]);
  const missingReturnCount = React.useMemo(() => missingReturnItems.reduce((sum, item) => sum + (item.expected_quantity - item.returned_quantity), 0), [missingReturnItems]);

  const tabs = React.useMemo(() => {
    const base = [
      { id: 'general', name: 'Informations générales', icon: Info },
      { id: 'equipment', name: 'Équipements', icon: Package },
      { id: 'delivery', name: 'Livraison', icon: Calendar },
      { id: 'crew', name: 'Équipe', icon: HardHat },
    ];
    if (rental?.type === 'service') {
      base.push({ id: 'personnel', name: 'Personnel', icon: UserCheck });
    }
    base.push({ id: 'insurance', name: 'Assurance', icon: ShieldCheck });
    base.push({ id: 'other', name: 'Autres services', icon: Briefcase });
    if (rental?.type !== 'sale') {
      base.push({ id: 'milestones', name: 'Dates clés', icon: Flag });
    }
    base.push({ id: 'tasks', name: 'Tâches', icon: Check });
    base.push(
      { id: 'financial', name: 'Financier', icon: Euro },
      { id: 'client', name: 'Historique client', icon: Users },
      { id: 'dossier', name: 'Dossier', icon: Folder },
      { id: 'documents', name: 'Documents', icon: FileText },
      { id: 'activity', name: 'Journal', icon: History },
    );
    if (rental?.return_info && rental.return_info.status === 'completed') {
      base.push({ id: 'returns', name: 'Retours', icon: Undo2 });
    }
    if (rental?.portal_request_id && settings?.features?.client_portal) {
      base.push({ id: 'portal_validation', name: 'Validation portail', icon: Globe });
    }
    return base;
  }, [rental, settings]);

  const updateTabsScrollState = React.useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const overflow = scrollWidth - clientWidth > 4;
    setTabsOverflow(overflow);
    if (!overflow) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  const scrollTabsBy = React.useCallback((delta: number) => {
    const container = tabsContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  React.useEffect(() => {
    updateTabsScrollState();
  }, [tabs, updateTabsScrollState]);

  React.useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    updateTabsScrollState();
    const handleResize = () => updateTabsScrollState();
    window.addEventListener('resize', handleResize);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(handleResize);
      observer.observe(container);
    }
    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
    };
  }, [updateTabsScrollState]);

  React.useEffect(() => {
    const allowed = tabs.map((t) => t.id);
    if (!allowed.includes(activeTab)) {
      setActiveTab('general');
    }
  }, [activeTab, setActiveTab, tabs]);

  React.useEffect(() => {
    const prevId = prevTabRef.current;
    if (prevId === activeTab) return;
    const prevIndex = tabs.findIndex((tab) => tab.id === prevId);
    const nextIndex = tabs.findIndex((tab) => tab.id === activeTab);
    if (prevIndex >= 0 && nextIndex >= 0) {
      setTabDirection(nextIndex >= prevIndex ? 'forward' : 'backward');
    }
    prevTabRef.current = activeTab;
  }, [activeTab, tabs]);

  React.useEffect(() => {
    if (!rental || rental.type !== 'service') {
      setServiceForm(null);
      setServiceSingleDay(false);
      setServiceSingleDayMenuOpen(false);
      return;
    }
    setServiceForm({
      title: rental.title || '',
      client_id: rental.client_id || '',
      start_date: toDatetimeLocal(rental.start_date),
      end_date: toDatetimeLocal(rental.end_date),
      location: rental.location || '',
      description: rental.description || '',
      notes: rental.notes || '',
      color: rental.color || '#1D4ED8',
      discount_type: rental.discount_type || '',
      discount_value: rental.discount_value != null ? String(rental.discount_value) : '',
    });
    setServiceSingleDay(false);
  }, [rental]);

  React.useEffect(() => {
    if (!rental || rental.type !== 'service') {
      setPersonnelAssignmentIds([]);
      setPersonnelServiceRows([]);
      return;
    }
    if (isEditing) return;
    setPersonnelAssignmentIds((rental.assigned_personnel || []).map((person) => person.id));
    setPersonnelServiceRows(
      (rental.personnel_services || []).map((service) => ({
        id: service.id,
        service_record_id: service.service_record_id,
        quantity: service.quantity,
        days: service.days,
        discount_percent: service.discount_percent ?? 0,
      }))
    );
  }, [isEditing, rental]);

  React.useEffect(() => {
    if (!rental) {
      setInsuranceServiceRows([]);
      return;
    }
    if (isEditing) return;
    setInsuranceServiceRows(
      (rental.insurance_services || []).map((service) => ({
        id: service.id,
        service_record_id: service.service_record_id,
        days: service.days,
      }))
    );
  }, [isEditing, rental]);

  React.useEffect(() => {
    if (!rental) {
      setOtherServiceRows([]);
      return;
    }
    if (isEditing) return;
    setOtherServiceRows(
      (rental.other_services || []).map((service) => ({
        id: service.id,
        service_record_id: service.service_record_id,
        quantity: service.quantity,
        days: service.days,
      }))
    );
  }, [isEditing, rental]);

  React.useEffect(() => {
    if (!serviceSingleDayMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (serviceSingleDayMenuRef.current && !serviceSingleDayMenuRef.current.contains(event.target as Node)) {
        setServiceSingleDayMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [serviceSingleDayMenuOpen]);

  React.useEffect(() => {
    if (!showCancelModal) return;
    if (!hasPayments) {
      setCancelPaymentMode('no_payment');
      setCancelRefundAmount('');
      setCancelError(null);
      return;
    }
    setCancelPaymentMode((prev) => (prev === 'refund_partial' || prev === 'refund_full' ? prev : 'keep'));
    setCancelRefundAmount(totalPaid > 0 ? totalPaid.toFixed(2) : '');
    setCancelError(null);
  }, [hasPayments, showCancelModal, totalPaid]);

  const isService = rental?.type === 'service';
  const clientNameFromList = React.useMemo(() => {
    const targetId = serviceForm?.client_id || rental?.client_id || '';
    if (!targetId) {
      return rental?.client_name || '';
    }
    const found = clients.find((c) => c.id === targetId);
    return found?.name || rental?.client_name || '';
  }, [clients, rental?.client_id, rental?.client_name, serviceForm?.client_id]);

  const documentClient = React.useMemo<DocumentClientInfo | null>(() => {
    if (!rental) return null;
    const targetId = serviceForm?.client_id || rental.client_id;
    const found = clients.find((c) => c.id === targetId);
    if (found) {
      return {
        name: found.name,
        company_client_name: found.company_client?.name ?? null,
        address: found.address,
        email: found.email,
        phone: found.phone,
      };
    }
    return {
      name: rental.client_name,
    };
  }, [clients, rental, serviceForm?.client_id]);

  const autoEntrepreneurMode = React.useMemo(() => isAutoEntrepreneurMode(settings), [settings]);
  const documentDesign = React.useMemo<DocumentTableDesign>(() => extractDocumentDesign(settings) || DEFAULT_DOC_DESIGN, [settings]);
  const companyInfo = React.useMemo<LegalCompanyInfo>(() => ({
    name: settings?.name,
    legalName: settings?.legal_name,
    logoUrl: settings?.logo_url,
    capital: settings?.capital,
    address: settings?.billing_address || settings?.address,
    phone: settings?.phone,
    email: settings?.billing_email || settings?.email,
    siren: settings?.siren,
    siret: settings?.siret,
    naf: settings?.naf,
    vat: autoEntrepreneurMode ? null : settings?.vat,
    isAutoEntrepreneur: autoEntrepreneurMode,
  }), [autoEntrepreneurMode, settings]);

  const packIds = React.useMemo(() => {
    const ids = new Set<string>();
    (rental?.items || []).forEach((item) => {
      const type = (item.equipment_type || '').toLowerCase();
      if ((type === 'pack' || type === 'kit') && item.equipment_id) {
        ids.add(item.equipment_id);
      }
    });
    return Array.from(ids);
  }, [rental?.items]);
  const packIdsKey = packIds.join('|');
  const packItemsCacheRef = React.useRef<{ key: string; data: Record<string, DocumentPackItem[]> }>({ key: '', data: {} });

  const loadPackItems = React.useCallback(async () => {
    if (!packIds.length) return {};
    if (packItemsCacheRef.current.key === packIdsKey) {
      return packItemsCacheRef.current.data;
    }
    try {
      const { data, error } = await supabase
        .from('equipment_pack_items')
        .select('pack_id, quantity, equipment:equipment_id(name)')
        .in('pack_id', packIds)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const map: Record<string, DocumentPackItem[]> = {};
      (data || []).forEach((row: any) => {
        const packId = typeof row.pack_id === 'string' ? row.pack_id : '';
        if (!packId) return;
        const name = row.equipment?.name || 'Element';
        const quantity = Number.isFinite(row.quantity) ? row.quantity : 1;
        if (!map[packId]) map[packId] = [];
        map[packId].push({ name, quantity });
      });
      packItemsCacheRef.current = { key: packIdsKey, data: map };
      return map;
    } catch (err) {
      console.error('load pack items', err);
      return {};
    }
  }, [packIds, packIdsKey]);

  const deliveryDate = React.useMemo(() => {
    const candidates = deliveryRows
      .map((row) => row.delivery_at || row.appointment_at)
      .filter((value): value is string => Boolean(value));
    if (!candidates.length) return null;
    const sorted = candidates.slice().sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return sorted[0] || null;
  }, [deliveryRows]);

  const paymentsPayload = React.useMemo(() => paymentHistory.map((p) => ({
    id: p.id,
    amount: p.amount,
    status: p.status,
    payment_type: p.paymentType,
    payment_date: p.date,
    reference: p.reference,
  })), [paymentHistory]);

  const handleGenerateDocument = React.useCallback(async (docType: 'devis' | 'facture' | 'bon_prepa') => {
    if (!rental) throw new Error('Prestation introuvable');
    const resolvedTitle = getNextDocumentTitle(docType);
    let latestSettings: any = null;
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', 1)
        .single();
      if (!error && data) {
        latestSettings = data;
      }
    } catch (err) {
      console.warn('load latest company settings', err);
    }

    const settingsSource = latestSettings || settings;
    const templatesRoot = (settingsSource as any)?.templates || {};
    const tpl = templatesRoot?.[docType] || {};
    const editorHtml = typeof tpl.editor_html === 'string' ? tpl.editor_html : '';
    const studioTemplate = resolveTemplateStudioSnapshotForDoc(templatesRoot, docType);
    const studioHasBlocks = Array.isArray(studioTemplate?.blocks) && studioTemplate.blocks.length > 0;
    const customCss = studioHasBlocks
      ? ''
      : (typeof tpl?.studio?.customCss === 'string'
          ? tpl.studio.customCss
          : (typeof studioTemplate?.customCss === 'string' ? studioTemplate.customCss : ''));
    const latestDocumentDesign = extractDocumentDesign(settingsSource) || documentDesign;
    const latestCompanyInfo = settingsSource
      ? {
          name: settingsSource?.name,
          legalName: settingsSource?.legal_name,
          logoUrl: settingsSource?.logo_url,
          capital: settingsSource?.capital,
          address: settingsSource?.billing_address || settingsSource?.address,
          phone: settingsSource?.phone,
          email: settingsSource?.billing_email || settingsSource?.email,
          siren: settingsSource?.siren,
          siret: settingsSource?.siret,
          naf: settingsSource?.naf,
          vat: isAutoEntrepreneurMode(settingsSource) ? null : settingsSource?.vat,
          isAutoEntrepreneur: isAutoEntrepreneurMode(settingsSource),
        }
      : companyInfo;
    const packItemsByEquipmentId = await loadPackItems();

    const response = await fetch('/api/rental-documents/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rentalId: rental.id,
        docType,
        title: resolvedTitle,
        rental,
        editorHtml,
        customCss,
        documentDesign: latestDocumentDesign,
        company: latestCompanyInfo,
        client: documentClient,
        deliveryDate,
        payments: paymentsPayload,
        packItemsByEquipmentId,
        equipmentCoefficient: effectiveCoefficient,
        studioTemplate,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = typeof payload?.error === 'string' ? payload.error : "Impossible d'enregistrer le document";
      throw new Error(message);
    }

    recordActivity('document_generated', `Document généré : ${resolvedTitle}`, { doc_type: docType });
    const { data } = await supabase
      .from('rental_documents')
      .select('id, title, doc_type, file_url, created_at')
      .eq('rental_id', rental.id)
      .order('created_at', { ascending: false });
    setDocs(data || []);
    setActiveDocId((data && data[0]?.id) || null);
  }, [
    rental,
    getNextDocumentTitle,
    settings,
    documentDesign,
    companyInfo,
    documentClient,
    deliveryDate,
    paymentsPayload,
    loadPackItems,
    effectiveCoefficient,
    recordActivity,
  ]);

  const latestQuoteDoc = React.useMemo(() => {
    if (!docs.length) return null;
    return docs.find((doc) => doc.doc_type === 'devis') || null;
  }, [docs]);

  const dossierCurrentFolder = React.useMemo(() => {
    if (!dossierFolderId) return null;
    return dossierEntries.find((entry) => entry.id === dossierFolderId && entry.entry_type === 'folder') || null;
  }, [dossierEntries, dossierFolderId]);
  const dossierShareTargetLabel = dossierCurrentFolder?.name || 'Racine';

  const dossierEntriesInView = React.useMemo(() => {
    const filtered = dossierEntries.filter((entry) => (entry.parent_id ?? null) === dossierFolderId);
    return filtered.slice().sort((a, b) => {
      if (a.entry_type !== b.entry_type) {
        return a.entry_type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [dossierEntries, dossierFolderId]);

  const dossierEntryMap = React.useMemo(() => {
    const map = new Map<string, typeof dossierEntries[number]>();
    dossierEntries.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [dossierEntries]);

  const dossierContextEntry = React.useMemo(() => {
    if (!dossierContextMenu?.entryId) return null;
    return dossierEntryMap.get(dossierContextMenu.entryId) ?? null;
  }, [dossierContextMenu, dossierEntryMap]);

  const dossierClipboardEntry = React.useMemo(() => {
    if (!dossierClipboard) return null;
    return dossierEntryMap.get(dossierClipboard.entryId) ?? null;
  }, [dossierClipboard, dossierEntryMap]);

  const dossierInfoEntry = React.useMemo(() => {
    if (!dossierInfoEntryId) return null;
    return dossierEntryMap.get(dossierInfoEntryId) ?? null;
  }, [dossierEntryMap, dossierInfoEntryId]);

  const dossierPreviewEntry = React.useMemo(() => {
    if (!dossierPreviewEntryId) return null;
    return dossierEntryMap.get(dossierPreviewEntryId) ?? null;
  }, [dossierEntryMap, dossierPreviewEntryId]);

  const dossierNameModalEntry = React.useMemo(() => {
    if (!dossierNameModalEntryId) return null;
    return dossierEntryMap.get(dossierNameModalEntryId) ?? null;
  }, [dossierNameModalEntryId, dossierEntryMap]);

  const dossierPasteTargetId = dossierContextEntry?.entry_type === 'folder'
    ? dossierContextEntry.id
    : dossierFolderId;
  const dossierHasClipboard = Boolean(dossierClipboardEntry);
  const dossierSelectedSet = React.useMemo(() => new Set(dossierSelectedEntryIds), [dossierSelectedEntryIds]);
  const dossierExpandedSet = React.useMemo(() => new Set(dossierExpandedFolderIds), [dossierExpandedFolderIds]);

  const dossierChildrenMap = React.useMemo(() => {
    const tree = new Map<string | null, Array<typeof dossierEntries[number]>>();
    dossierEntries.forEach((entry) => {
      const key = entry.parent_id ?? null;
      const list = tree.get(key) ?? [];
      list.push(entry);
      tree.set(key, list);
    });
    tree.forEach((list) => {
      list.sort((a, b) => {
        if (a.entry_type !== b.entry_type) {
          return a.entry_type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
      });
    });
    return tree;
  }, [dossierEntries]);

  const dossierPathSegments = React.useMemo(() => {
    const segments: Array<typeof dossierEntries[number]> = [];
    let current = dossierCurrentFolder;
    const guard = new Set<string>();
    while (current && !guard.has(current.id)) {
      segments.unshift(current);
      guard.add(current.id);
      current = current.parent_id ? dossierEntryMap.get(current.parent_id) ?? null : null;
    }
    return segments;
  }, [dossierCurrentFolder, dossierEntryMap]);

  React.useEffect(() => {
    if (!dossierFolderId) return;
    const idsToExpand = dossierPathSegments.map((segment) => segment.id);
    setDossierExpandedFolderIds((prev) => Array.from(new Set([...prev, ...idsToExpand])));
  }, [dossierFolderId, dossierPathSegments]);

  const dossierTypeLabel = (entry: typeof dossierEntries[number]) => {
    if (entry.entry_type === 'folder') return 'Dossier';
    const name = entry.name;
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (ext) return ext.toUpperCase();
    if (entry.file_type) {
      const parts = entry.file_type.split('/');
      return (parts[1] || parts[0]).toUpperCase();
    }
    return 'Fichier';
  };

  const getEntryContainerStyle = (entry: typeof dossierEntries[number]) => {
    if (!entry.color) return undefined;
    const backgroundColor = withHexAlpha(entry.color, '33') ?? undefined;
    const borderColor = entry.color;
    return {
      backgroundColor,
      borderColor,
    } as React.CSSProperties;
  };

  const getEntryToneClass = (entry: typeof dossierEntries[number]) => {
    if (entry.color) return '';
    return entry.entry_type === 'folder'
      ? 'bg-amber-50 text-amber-600 border-amber-100'
      : 'bg-blue-50 text-blue-600 border-blue-100';
  };

  const getEntryIconStyle = (entry: typeof dossierEntries[number]) => {
    if (!entry.color) return undefined;
    return {
      color: entry.color,
    } as React.CSSProperties;
  };

  const resolveFolderIcon = (entry: typeof dossierEntries[number]) => {
    if (entry.entry_type !== 'folder') return Folder;
    return DOSSIER_ICON_MAP.get(entry.icon || 'folder') ?? Folder;
  };

  const resolveFolderIconLabel = (iconId: string | null) => {
    if (!iconId) return 'Dossier';
    return DOSSIER_ICON_LABELS.get(iconId) ?? 'Dossier';
  };

  const handleDossierBack = () => {
    setDossierFolderId(dossierCurrentFolder?.parent_id ?? null);
  };

  const buildDossierCopyName = React.useCallback((name: string, parentId: string | null) => {
    const { base, ext } = splitEntryName(name);
    const existingNames = new Set(
      dossierEntries
        .filter((entry) => (entry.parent_id ?? null) === parentId)
        .map((entry) => entry.name),
    );
    const baseName = `${base} - Copie`;
    let candidate = `${baseName}${ext}`;
    let index = 2;
    while (existingNames.has(candidate)) {
      candidate = `${baseName} ${index}${ext}`;
      index += 1;
    }
    return candidate;
  }, [dossierEntries]);

  const isDescendantFolder = React.useCallback((targetParentId: string | null, entryId: string) => {
    let current = targetParentId;
    const guard = new Set<string>();
    while (current) {
      if (current === entryId) return true;
      if (guard.has(current)) return false;
      guard.add(current);
      current = dossierEntryMap.get(current)?.parent_id ?? null;
    }
    return false;
  }, [dossierEntryMap]);

  const openDossierContextMenu = (event: React.MouseEvent, entryId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 220;
    const menuHeight = entryId ? 360 : 220;
    const padding = 12;
    const container = dossierContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const relativeX = event.clientX - rect.left;
      const relativeY = event.clientY - rect.top;
      const maxX = rect.width - menuWidth - padding;
      const maxY = rect.height - menuHeight - padding;
      const clampedX = Math.min(Math.max(relativeX, padding), maxX > padding ? maxX : padding);
      const clampedY = Math.min(Math.max(relativeY, padding), maxY > padding ? maxY : padding);
      setDossierContextMenu({ x: clampedX, y: clampedY, entryId });
    } else {
      const left = Math.min(event.clientX, window.innerWidth - menuWidth - padding);
      const top = Math.min(event.clientY, window.innerHeight - menuHeight - padding);
    setDossierContextMenu({ x: Math.max(left, padding), y: Math.max(top, padding), entryId });
    }
    if (entryId) {
      if (!dossierSelectedSet.has(entryId)) {
        setDossierSelectedEntryIds([entryId]);
        setDossierSelectionAnchorId(entryId);
      }
    }
  };

  const handleDossierSelect = React.useCallback((
    entry: typeof dossierEntries[number],
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    setDossierContextMenu(null);
    if (event.shiftKey && dossierSelectionAnchorId) {
      const ids = dossierEntriesInView.map((item) => item.id);
      const anchorIndex = ids.indexOf(dossierSelectionAnchorId);
      const targetIndex = ids.indexOf(entry.id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        setDossierSelectedEntryIds(ids.slice(start, end + 1));
        return;
      }
    }
    setDossierSelectedEntryIds([entry.id]);
    setDossierSelectionAnchorId(entry.id);
  }, [dossierEntriesInView, dossierSelectionAnchorId]);

  const renderDossierTree = (parentId: string | null, depth = 0): React.ReactNode => {
    const children = dossierChildrenMap.get(parentId ?? null) ?? [];
    if (children.length === 0) return null;
    return children.map((entry) => {
      const isFolder = entry.entry_type === 'folder';
      const isActive = entry.id === dossierFolderId;
      const isExpanded = dossierExpandedSet.has(entry.id);
      const childCount = isFolder ? (dossierChildrenMap.get(entry.id)?.length ?? 0) : 0;
      const iconStyle = getEntryIconStyle(entry);
      const FolderIcon = resolveFolderIcon(entry);
      const iconBaseClass = entry.color ? '' : (isActive ? 'text-blue-600' : 'text-amber-600');
      const fileIconClass = entry.color ? '' : 'text-blue-600';
      return (
        <div key={entry.id}>
          <div className="flex items-center">
            {isFolder ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (childCount === 0) return;
                  setDossierExpandedFolderIds((prev) => (isExpanded
                    ? prev.filter((id) => id !== entry.id)
                    : [...prev, entry.id]));
                }}
                className={`mr-1 inline-flex h-5 w-5 items-center justify-center rounded-sm ${childCount === 0 ? 'text-slate-300 cursor-default' : 'text-slate-600 hover:bg-slate-100'}`}
                style={{ marginLeft: `${8 + depth * 16}px` }}
                aria-label={isExpanded ? 'Réduire' : 'Développer'}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <span className="inline-block h-5 w-5" style={{ marginLeft: `${8 + depth * 16}px` }} />
            )}
            <button
              type="button"
              onClick={(event) => {
                if (isFolder) {
                  setDossierFolderId(entry.id);
                  return;
                }
                handleDossierSelect(entry, event);
              }}
              onDoubleClick={(event) => {
                if (isFolder) return;
                event.stopPropagation();
                if (isPreviewableEntry(entry)) {
                  handlePreviewDossierEntry(entry);
                  return;
                }
                handleDownloadDossierFile(entry);
              }}
              onContextMenu={(event) => openDossierContextMenu(event, entry.id)}
              className={`flex-1 flex items-center gap-2 rounded-md px-2 py-1 text-sm ${isActive ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {isFolder ? (
                <FolderIcon className={`h-4 w-4 ${iconBaseClass}`} style={iconStyle} />
              ) : (
                <FileText className={`h-4 w-4 ${fileIconClass}`} style={iconStyle} />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
          </div>
          {isFolder && isExpanded && renderDossierTree(entry.id, depth + 1)}
        </div>
      );
    });
  };

  const closeDossierNameModal = () => {
    setDossierNameModalOpen(false);
    setDossierNameModalValue('');
    setDossierNameModalEntryId(null);
    setDossierNameModalColor(DEFAULT_FOLDER_COLOR);
    setDossierNameModalIcon('folder');
    setDossierNameModalColorDirty(false);
  };

  const openDossierNameModal = (mode: 'create' | 'edit', entry?: typeof dossierEntries[number]) => {
    setDossierContextMenu(null);
    setDossierNameModalMode(mode);
    setDossierNameModalEntryId(entry?.id ?? null);
    setDossierNameModalValue(entry?.name ?? '');
    if (mode === 'create') {
      setDossierNameModalColor(DEFAULT_FOLDER_COLOR);
      setDossierNameModalIcon('folder');
      setDossierNameModalColorDirty(false);
    } else if (entry) {
      setDossierNameModalColor(entry.color || (entry.entry_type === 'folder' ? DEFAULT_FOLDER_COLOR : DEFAULT_FILE_COLOR));
      setDossierNameModalIcon(entry.icon || 'folder');
      setDossierNameModalColorDirty(false);
    }
    setDossierNameModalOpen(true);
  };

  const createDossierFolder = async (name: string, color: string | null, icon: string | null) => {
    if (!rental || dossierCreating) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    setDossierCreating(true);
    try {
      const { error } = await supabase
        .from('rental_dossier_entries')
        .insert([{
          rental_id: rental.id,
          parent_id: dossierFolderId,
          entry_type: 'folder',
          name: trimmed,
          color,
          icon,
        }]);
      if (error) throw error;
      await fetchDossierEntries();
      toast.success('Dossier créé');
      return true;
    } catch (err) {
      console.error('create dossier folder', err);
      toast.error('Impossible de créer le dossier');
      return false;
    } finally {
      setDossierCreating(false);
    }
  };

  const handleRenameDossierEntry = async (
    entry: typeof dossierEntries[number],
    nextName: string,
    color: string | null,
    icon: string | null,
  ) => {
    if (!rental) return false;
    const trimmed = nextName.trim();
    if (!trimmed) return false;
    const iconValue = entry.entry_type === 'folder' ? icon : null;
    const sameName = trimmed === entry.name;
    const sameColor = (entry.color ?? null) === (color ?? null);
    const sameIcon = (entry.icon ?? null) === (iconValue ?? null);
    if (sameName && sameColor && sameIcon) return false;
    try {
      const updates: {
        name: string;
        file_name?: string;
        color?: string | null;
        icon?: string | null;
      } = {
        name: trimmed,
        color,
        icon: iconValue,
      };
      if (entry.entry_type === 'file' && !sameName) {
        updates.file_name = trimmed;
      }
      const { error } = await supabase
        .from('rental_dossier_entries')
        .update(updates)
        .eq('id', entry.id);
      if (error) throw error;
      await fetchDossierEntries();
      toast.success('Nom mis à jour');
      return true;
    } catch (err) {
      console.error('rename dossier entry', err);
      toast.error('Impossible de renommer');
      return false;
    }
  };

  const handleConfirmDossierNameModal = async () => {
    if (dossierNameModalSaving) return;
    const value = dossierNameModalValue.trim();
    if (!value) {
      toast.error('Nom requis');
      return;
    }
    const normalizedColor = normalizeHexColor(dossierNameModalColor);
    if (dossierNameModalColorDirty && !normalizedColor) {
      toast.error('Couleur invalide');
      return;
    }
    setDossierNameModalSaving(true);
    try {
      let success = false;
      const baseDefaultColor = dossierNameModalMode === 'create'
        ? DEFAULT_FOLDER_COLOR
        : (dossierNameModalEntry?.entry_type === 'folder' ? DEFAULT_FOLDER_COLOR : DEFAULT_FILE_COLOR);
      const colorForSave = (() => {
        if (!dossierNameModalColorDirty) {
          return dossierNameModalMode === 'create'
            ? null
            : (dossierNameModalEntry?.color ?? null);
        }
        if (!normalizedColor) return null;
        return normalizedColor === baseDefaultColor ? null : normalizedColor;
      })();
      const iconForSave = dossierNameModalEntry?.entry_type === 'folder' || dossierNameModalMode === 'create'
        ? dossierNameModalIcon
        : null;
      if (dossierNameModalMode === 'create') {
        success = await createDossierFolder(value, colorForSave, iconForSave);
      } else if (dossierNameModalEntryId) {
        const entry = dossierEntryMap.get(dossierNameModalEntryId);
        if (entry) {
          success = await handleRenameDossierEntry(entry, value, colorForSave, iconForSave);
        }
      }
      if (success) {
        closeDossierNameModal();
      }
    } finally {
      setDossierNameModalSaving(false);
    }
  };

  const duplicateDossierEntry = React.useCallback(async (
    entry: typeof dossierEntries[number],
    destinationParentId: string | null,
  ) => {
    if (!rental) return;
    const name = buildDossierCopyName(entry.name, destinationParentId);
    const payload = {
      rental_id: entry.rental_id,
      parent_id: destinationParentId,
      entry_type: entry.entry_type,
      name,
      file_url: entry.entry_type === 'file' ? entry.file_url : null,
      file_name: entry.entry_type === 'file' ? name : null,
      file_type: entry.entry_type === 'file' ? entry.file_type : null,
      file_size: entry.entry_type === 'file' ? entry.file_size : null,
      color: entry.color ?? null,
      icon: entry.entry_type === 'folder' ? entry.icon ?? null : null,
    };
    const { data, error } = await supabase
      .from('rental_dossier_entries')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    if (entry.entry_type === 'folder') {
      const children = dossierEntries.filter((child) => child.parent_id === entry.id);
      for (const child of children) {
        await duplicateDossierEntry(child, data.id);
      }
    }
  }, [buildDossierCopyName, dossierEntries, rental]);

  const handleDuplicateDossierEntry = async (entry: typeof dossierEntries[number]) => {
    try {
      await duplicateDossierEntry(entry, entry.parent_id ?? null);
      await fetchDossierEntries();
      toast.success('Dupliqué');
    } catch (err) {
      console.error('duplicate dossier entry', err);
      toast.error('Impossible de dupliquer');
    }
  };

  const handleCopyDossierEntry = (entry: typeof dossierEntries[number]) => {
    setDossierClipboard({ entryId: entry.id, mode: 'copy' });
    toast.success('Copié');
  };

  const handleCutDossierEntry = (entry: typeof dossierEntries[number]) => {
    setDossierClipboard({ entryId: entry.id, mode: 'cut' });
    toast.success('Coupé');
  };

  const handlePasteDossierEntry = async (targetParentId: string | null) => {
    if (!dossierClipboard || !dossierClipboardEntry) {
      toast.error('Rien à coller');
      return;
    }
    if (dossierClipboardEntry.entry_type === 'folder' && isDescendantFolder(targetParentId, dossierClipboardEntry.id)) {
      toast.error('Impossible de coller dans ce dossier');
      return;
    }
    if (dossierClipboard.mode === 'cut') {
      if ((dossierClipboardEntry.parent_id ?? null) === targetParentId) {
        setDossierClipboard(null);
        toast.success('Déjà dans ce dossier');
        return;
      }
      try {
        const { error } = await supabase
          .from('rental_dossier_entries')
          .update({ parent_id: targetParentId })
          .eq('id', dossierClipboardEntry.id);
        if (error) throw error;
        setDossierClipboard(null);
        await fetchDossierEntries();
        toast.success('Déplacé');
      } catch (err) {
        console.error('move dossier entry', err);
        toast.error('Impossible de déplacer');
      }
      return;
    }
    try {
      await duplicateDossierEntry(dossierClipboardEntry, targetParentId);
      await fetchDossierEntries();
      toast.success('Collé');
    } catch (err) {
      console.error('paste dossier entry', err);
      toast.error('Impossible de coller');
    }
  };

  const handleShowDossierInfo = (entry: typeof dossierEntries[number]) => {
    setDossierContextMenu(null);
    setDossierInfoEntryId(entry.id);
  };

  const handlePreviewDossierEntry = (entry: typeof dossierEntries[number]) => {
    if (!isPreviewableEntry(entry)) {
      toast.error('Aperçu indisponible');
      return;
    }
    setDossierContextMenu(null);
    setDossierPreviewEntryId(entry.id);
  };

  const handleDownloadDossierZip = async (entry: typeof dossierEntries[number]) => {
    if (!rental || entry.entry_type !== 'folder') return;
    if (dossierZippingId) return;
    const toastId = toast.loading('Compression du dossier…');
    setDossierZippingId(entry.id);
    try {
      const zip = new JSZip();
      const visited = new Set<string>();
      const addFolder = async (folderId: string, prefix: string) => {
        if (visited.has(folderId)) return;
        visited.add(folderId);
        const children = dossierEntries.filter((child) => child.parent_id === folderId);
        if (children.length === 0) {
          zip.folder(prefix);
        }
        for (const child of children) {
          if (child.entry_type === 'folder') {
            const nextPrefix = `${prefix}${child.name}/`;
            zip.folder(nextPrefix);
            await addFolder(child.id, nextPrefix);
          } else if (child.file_url) {
            const blob = await getDossierEntryBlob(child);
            zip.file(`${prefix}${child.name}`, blob);
          }
        }
      };
      await addFolder(entry.id, `${entry.name}/`);
      const content = await zip.generateAsync({ type: 'blob' });
      const downloadName = `${sanitizeFilename(entry.name)}.zip`;
      const url = URL.createObjectURL(content);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = downloadName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Zip prêt', { id: toastId });
    } catch (err) {
      console.error('zip dossier', err);
      toast.error('Impossible de compresser', { id: toastId });
    } finally {
      setDossierZippingId(null);
    }
  };

  const handleDownloadDossierFile = (entry: typeof dossierEntries[number]) => {
    if (!entry.file_url) {
      toast.error('Téléchargement impossible');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = entry.file_url;
    anchor.download = entry.name || undefined;
    anchor.rel = 'noopener';
    anchor.click();
  };

  const fetchDossierShareList = React.useCallback(async () => {
    if (!rental) return;
    setDossierShareListLoading(true);
    setDossierShareListError(null);
    try {
      const params = new URLSearchParams({ rentalId: rental.id });
      const response = await fetch(`/api/dossier-shares?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Impossible de charger les liens.');
      }
      const data = await response.json();
      setDossierShareList(Array.isArray(data?.shares) ? data.shares : []);
    } catch (err) {
      console.error('dossier share list error', err);
      const message = err instanceof Error ? err.message : 'Impossible de charger les liens.';
      setDossierShareListError(message);
    } finally {
      setDossierShareListLoading(false);
    }
  }, [rental]);

  const handleRevokeDossierShare = async (shareId: string) => {
    if (!shareId) return;
    if (!window.confirm('Supprimer ce lien ?')) return;
    try {
      const response = await fetch(`/api/dossier-shares/${shareId}/revoke`, { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Suppression impossible.');
      }
      toast.success('Lien supprimé');
      await fetchDossierShareList();
    } catch (err) {
      console.error('dossier share revoke error', err);
      toast.error('Impossible de supprimer le lien');
    }
  };

  const handleCopyShareLink = async (link: string) => {
    if (!link) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const temp = document.createElement('input');
        temp.value = link;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      toast.success('Lien copié');
    } catch (err) {
      console.error('copy share link error', err);
      toast.error('Impossible de copier le lien');
    }
  };

  const fetchDossierWhitelistEntries = React.useCallback(async () => {
    if (!rental) return [];
    setDossierWhitelistLoading(true);
    setDossierWhitelistError(null);
    try {
      const params = new URLSearchParams({ rentalId: rental.id });
      const response = await fetch(`/api/dossier-whitelist?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Impossible de charger la whitelist.');
      }
      const data = await response.json();
      const entries = Array.isArray(data?.entries) ? data.entries : [];
      setDossierWhitelistEntries(entries);
      return entries;
    } catch (err) {
      console.error('dossier whitelist list error', err);
      const message = err instanceof Error ? err.message : 'Impossible de charger la whitelist.';
      setDossierWhitelistError(message);
      return [];
    } finally {
      setDossierWhitelistLoading(false);
    }
  }, [rental]);

  const handleAddWhitelistEntry = async () => {
    if (!rental || dossierWhitelistSaving) return;
    const email = dossierWhitelistEmail.trim().toLowerCase();
    if (!email) {
      setDossierWhitelistError('Adresse e-mail requise.');
      return;
    }
    setDossierWhitelistSaving(true);
    setDossierWhitelistError(null);
    try {
      const response = await fetch('/api/dossier-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentalId: rental.id, email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Impossible d'ajouter la whitelist.");
      }
      toast.success('Adresse ajoutée');
      setDossierWhitelistEmail('');
      await fetchDossierWhitelistEntries();
    } catch (err) {
      console.error('dossier whitelist add error', err);
      const message = err instanceof Error ? err.message : "Impossible d'ajouter la whitelist.";
      setDossierWhitelistError(message);
    } finally {
      setDossierWhitelistSaving(false);
    }
  };

  const handleDeleteWhitelistEntry = async (entryId: string) => {
    if (!entryId) return;
    if (!window.confirm('Supprimer cette adresse ?')) return;
    try {
      const response = await fetch(`/api/dossier-whitelist/${entryId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Suppression impossible.');
      }
      toast.success('Adresse supprimée');
      await fetchDossierWhitelistEntries();
    } catch (err) {
      console.error('dossier whitelist delete error', err);
      toast.error('Impossible de supprimer');
    }
  };

  const computeDossierShareExpiryDays = React.useCallback(() => {
    if (!dossierShareExpiryEnabled) return null;
    const value = Number(dossierShareExpiryValue);
    if (!Number.isFinite(value) || value <= 0) return null;
    switch (dossierShareExpiryUnit) {
      case 'minutes':
        return value / (60 * 24);
      case 'hours':
        return value / 24;
      case 'months':
        return value * 30;
      default:
        return value;
    }
  }, [dossierShareExpiryEnabled, dossierShareExpiryUnit, dossierShareExpiryValue]);

  const createDossierShareLink = async () => {
    if (!rental || dossierShareLoading) return;
    setDossierShareLoading(true);
    setDossierShareError(null);
    try {
      const password = dossierSharePassword.trim();
      let whitelistEntries = dossierWhitelistEntries;
      if (dossierShareWhitelistEnabled && whitelistEntries.length === 0) {
        whitelistEntries = await fetchDossierWhitelistEntries();
      }
      if (dossierShareWhitelistEnabled && whitelistEntries.length === 0) {
        setDossierShareError('Ajoutez au moins une adresse en whitelist.');
        return;
      }
      const expiresInDays = computeDossierShareExpiryDays();
      if (dossierShareExpiryEnabled && (!expiresInDays || expiresInDays <= 0)) {
        setDossierShareError('Veuillez renseigner une durée valide.');
        return;
      }
      if (dossierSharePasswordEnabled && !password) {
        setDossierShareError('Veuillez renseigner un mot de passe.');
        return;
      }
      const response = await fetch('/api/dossier-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rentalId: rental.id,
          rootEntryId: dossierFolderId,
          password: dossierSharePasswordEnabled ? password : null,
          accessMode: dossierShareAccessMode,
          expiresInDays,
          whitelistEnabled: dossierShareWhitelistEnabled,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Impossible de créer le lien.');
      }
      const data = await response.json();
      if (!data?.shareUrl) {
        throw new Error('Lien indisponible.');
      }
      setDossierShareLink(data.shareUrl);
      if (dossierShareListOpen) {
        await fetchDossierShareList();
      }
    } catch (err) {
      console.error('dossier share error', err);
      const message = err instanceof Error ? err.message : 'Impossible de créer le lien.';
      setDossierShareError(message);
    } finally {
      setDossierShareLoading(false);
    }
  };

  const openDossierShareModal = () => {
    setDossierShareModalOpen(true);
    setDossierShareLink(null);
    setDossierShareError(null);
    setDossierSharePasswordEnabled(false);
    setDossierSharePassword('');
    setDossierShareAccessMode('viewer');
    setDossierShareExpiryEnabled(false);
    setDossierShareExpiryValue('7');
    setDossierShareExpiryUnit('days');
    setDossierShareWhitelistEnabled(false);
    setDossierWhitelistModalOpen(false);
    setDossierWhitelistEntries([]);
    setDossierWhitelistError(null);
    setDossierWhitelistEmail('');
    setDossierWhitelistSaving(false);
    setDossierShareListOpen(false);
    setDossierShareListError(null);
    setDossierShareList([]);
  };

  const closeDossierShareModal = () => {
    if (dossierShareLoading) return;
    setDossierShareModalOpen(false);
    setDossierShareListOpen(false);
    setDossierWhitelistModalOpen(false);
  };

  const handleCopyDossierShareLink = async () => {
    if (!dossierShareLink) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(dossierShareLink);
      } else if (dossierShareInputRef.current) {
        dossierShareInputRef.current.focus();
        dossierShareInputRef.current.select();
        document.execCommand('copy');
      }
      toast.success('Lien copié');
    } catch (err) {
      console.error('copy dossier share', err);
      toast.error('Impossible de copier le lien');
    }
  };

  const handleUploadDossierFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!rental || dossierUploading) return;
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setDossierUploading(true);
    try {
      const payloads = await Promise.all(files.map(async (file) => ({
        rental_id: rental.id,
        parent_id: dossierFolderId,
        entry_type: 'file',
        name: file.name,
        file_url: await fileToDataUrl(file),
        file_name: file.name,
        file_type: file.type || null,
        file_size: Number.isFinite(file.size) ? file.size : null,
        color: null,
        icon: null,
      })));
      const { error } = await supabase
        .from('rental_dossier_entries')
        .insert(payloads);
      if (error) throw error;
      await fetchDossierEntries();
      toast.success('Fichier(s) importé(s)');
    } catch (err) {
      console.error('upload dossier files', err);
      toast.error("Impossible d'importer les fichiers");
    } finally {
      setDossierUploading(false);
      if (dossierFileInputRef.current) {
        dossierFileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteDossierEntry = async (entry: typeof dossierEntries[number]) => {
    if (!rental) return;
    const hasChildren = dossierEntries.some((child) => child.parent_id === entry.id);
    const label = entry.entry_type === 'folder'
      ? hasChildren ? 'Supprimer ce dossier et son contenu ?' : 'Supprimer ce dossier ?'
      : 'Supprimer ce fichier ?';
    if (!window.confirm(label)) return;
    try {
      const { error } = await supabase
        .from('rental_dossier_entries')
        .delete()
        .eq('id', entry.id);
      if (error) throw error;
      await fetchDossierEntries();
      if (entry.id === dossierFolderId) {
        setDossierFolderId(entry.parent_id ?? null);
      }
      toast.success(entry.entry_type === 'folder' ? 'Dossier supprimé' : 'Fichier supprimé');
    } catch (err) {
      console.error('delete dossier entry', err);
      toast.error('Suppression impossible');
    }
  };

  React.useEffect(() => {
    if (!rental || !latestQuoteDoc) return;
    if (quoteExpiryProcessingRef.current) return;
    if (rental.status !== 'confirmed') return;
    if (!latestQuoteDoc.created_at) return;

    const quoteCreatedAt = new Date(latestQuoteDoc.created_at);
    if (!Number.isFinite(quoteCreatedAt.getTime())) return;
    const expiryAt = new Date(quoteCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (Date.now() <= expiryAt.getTime()) return;

    const lastHandledAt = rental.quote_expired_at ? new Date(rental.quote_expired_at) : null;
    if (lastHandledAt && lastHandledAt.getTime() >= quoteCreatedAt.getTime()) return;

    quoteExpiryProcessingRef.current = true;
    const nowIso = new Date().toISOString();
    const updates: Partial<Rental> = {
      status: 'pending',
      generate_invoice: false,
      quote_expired_at: nowIso,
      quote_expired_notice_at: nowIso,
    };
    const run = async () => {
      try {
        const { error } = await supabase
          .from('rentals')
          .update(updates)
          .eq('id', rental.id);
        if (error) throw error;
        setRental((prev) => (prev ? { ...prev, ...updates } as Rental : prev));
        recordActivity('quote_expired', 'Devis expiré : retour en attente de validation.', {
          quote_created_at: latestQuoteDoc.created_at,
        });
        setShowQuoteExpiredModal(true);
      } catch (err) {
        console.error('quote expiry update', err);
      } finally {
        quoteExpiryProcessingRef.current = false;
      }
    };
    run();
  }, [latestQuoteDoc, recordActivity, rental, setRental]);

  // Load unread modification requests on mount (for popup)
  React.useEffect(() => {
    if (!rental?.id) return;
    supabase
      .from('rental_document_requests')
      .select('id, modification_comment, signer_name, recipient_name, created_at')
      .eq('rental_id', rental.id)
      .eq('status', 'modification_requested')
      .is('modification_seen_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setPendingModificationRequests(data as any);
          setShowModificationPopup(true);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rental?.id]);

  // Load all modification requests for the integrated panel
  React.useEffect(() => {
    if (!rental?.id) return;
    supabase
      .from('rental_document_requests')
      .select('id, modification_comment, signer_name, recipient_name, created_at, modification_seen_at')
      .eq('rental_id', rental.id)
      .eq('status', 'modification_requested')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setAllModificationRequests(data as any);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rental?.id]);

  const closeModificationPopup = React.useCallback(async () => {
    setShowModificationPopup(false);
    const ids = pendingModificationRequests.map((r) => r.id);
    if (ids.length > 0) {
      const seenAt = new Date().toISOString();
      await supabase
        .from('rental_document_requests')
        .update({ modification_seen_at: seenAt })
        .in('id', ids);
      setAllModificationRequests((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, modification_seen_at: seenAt } : r));
    }
    setPendingModificationRequests([]);
  }, [pendingModificationRequests]);

  const handleSendModificationFromApp = React.useCallback(async () => {
    if (!rental?.id) return;
    setSendingModification(true);
    try {
      const token = crypto.randomUUID();
      const { error } = await supabase
        .from('rental_document_requests')
        .insert({
          rental_id: rental.id,
          doc_type: latestQuoteDoc?.doc_type || 'devis',
          document_id: latestQuoteDoc?.id || null,
          token,
          status: 'modification_requested',
          modification_comment: modificationCommentInput.trim() || null,
          modification_seen_at: new Date().toISOString(),
        });
      if (error) throw error;
      const seenAt = new Date().toISOString();
      setAllModificationRequests((prev) => [
        {
          id: token,
          modification_comment: modificationCommentInput.trim() || null,
          signer_name: null,
          recipient_name: null,
          created_at: seenAt,
          modification_seen_at: seenAt,
        },
        ...prev,
      ]);
      recordActivity(
        'document_modification_requested',
        modificationCommentInput.trim()
          ? `Modifications demandées : ${modificationCommentInput.trim()}`
          : 'Modifications demandées.',
        { via: 'app' }
      );
      toast.success('Demande de modification enregistrée.');
      setShowSendModificationModal(false);
      setModificationCommentInput('');
    } catch (err) {
      console.error('send modification', err);
      toast.error("Impossible d'enregistrer la demande.");
    } finally {
      setSendingModification(false);
    }
  }, [rental?.id, latestQuoteDoc, modificationCommentInput, recordActivity]);

  const openSendDocumentModal = (doc: { id: string; title: string; doc_type: string }) => {
    setSendDocTarget({ id: doc.id, title: doc.title, doc_type: doc.doc_type });
    setSendDocEmail(documentClient?.email?.trim() || '');
    setSendDocError(null);
    setShowSendDocModal(true);
  };

  const closeSendDocumentModal = () => {
    if (sendingDocId) return;
    setShowSendDocModal(false);
    setSendDocTarget(null);
    setSendDocError(null);
    setSendDocEmail('');
  };

  const sendDocumentEmail = async (doc: { id: string; title: string; doc_type: string }, recipientEmail: string) => {
    if (sendingDocId) return false;
    const docTitle = docTitleMap.get(doc.id) || doc.title || 'Document';
    try {
      setSendingDocId(doc.id);
      const response = await fetch('/api/rental-documents/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: doc.id,
          recipientEmail,
          recipientName: documentClient?.name || null,
          documentTitle: docTitle,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Impossible d'envoyer le document");
      }
      toast.success('Document envoyé par email.');
      recordActivity('document_sent', `Document envoyé à ${recipientEmail} : ${docTitle}`, { doc_type: doc.doc_type });
      return true;
    } catch (err) {
      console.error('send document email', err);
      const message = err instanceof Error ? err.message : "Impossible d'envoyer le document";
      toast.error(message);
      return false;
    } finally {
      setSendingDocId(null);
    }
  };

  const confirmSendDocument = async () => {
    if (!sendDocTarget) return;
    const trimmedEmail = sendDocEmail.trim();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setSendDocError('Adresse e-mail invalide');
      return;
    }
    setSendDocError(null);
    const ok = await sendDocumentEmail(sendDocTarget, trimmedEmail);
    if (ok) {
      closeSendDocumentModal();
    }
  };

  const openApprovalModal = () => {
    setApprovalRequestEmail(documentClient?.email?.trim() || '');
    setApprovalRequestError(null);
    setShowApprovalRequestModal(true);
  };

  const closeApprovalModal = () => {
    if (sendingApprovalRequest) return;
    setShowApprovalRequestModal(false);
    setApprovalRequestError(null);
    setApprovalPasswordEnabled(false);
    setApprovalPassword('');
  };

  const confirmApprovalRequest = async () => {
    if (!rental) return;
    const trimmedEmail = approvalRequestEmail.trim();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setApprovalRequestError('Adresse e-mail invalide');
      return;
    }

    try {
      setSendingApprovalRequest(true);

      let quoteDoc = latestQuoteDoc;
      if (!quoteDoc?.id) {
        try {
          await handleGenerateDocument('devis');
          const { data: freshDocs } = await supabase
            .from('rental_documents')
            .select('id, title, doc_type, file_url, created_at')
            .eq('rental_id', rental.id)
            .order('created_at', { ascending: false });
          quoteDoc = freshDocs?.find((d: any) => d.doc_type === 'devis') || null;
        } catch (genErr) {
          const msg = genErr instanceof Error ? genErr.message : 'Impossible de générer le devis.';
          setApprovalRequestError(msg);
          setSendingApprovalRequest(false);
          return;
        }
        if (!quoteDoc?.id) {
          setApprovalRequestError('Impossible de générer le devis.');
          setSendingApprovalRequest(false);
          return;
        }
      }

      const docTitle = docTitleMap.get(quoteDoc.id) || quoteDoc.title || 'Devis';
      const response = await fetch('/api/rental-documents/request-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: quoteDoc.id,
          rentalId: rental.id,
          recipientEmail: trimmedEmail,
          recipientName: documentClient?.name || null,
          documentTitle: docTitle,
          accessPassword: approvalPasswordEnabled && approvalPassword.trim() ? approvalPassword.trim() : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Impossible d'envoyer la demande de validation");
      }

      toast.success('Demande de validation envoyée.');
      recordActivity('document_approval_requested', `Demande de validation envoyée à ${trimmedEmail} : ${docTitle}`, {
        doc_type: 'devis',
        document_id: quoteDoc.id,
      });
      setShowApprovalRequestModal(false);
      setApprovalRequestError(null);
    } catch (err) {
      console.error('request approval email', err);
      const message = err instanceof Error ? err.message : "Impossible d'envoyer la demande de validation";
      setApprovalRequestError(message);
      toast.error(message);
    } finally {
      setSendingApprovalRequest(false);
    }
  };

  const buildDocShareUrl = React.useCallback((token: string) => {
    if (!token) return '';
    if (typeof window === 'undefined') return `/api/rental-documents/share/${token}`;
    return `${window.location.origin}/api/rental-documents/share/${token}`;
  }, []);

  const generateDocShareToken = () => {
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
    if (cryptoObj?.randomUUID) {
      return cryptoObj.randomUUID().replace(/-/g, '');
    }
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  };

  const loadActiveDocShare = async (docId: string) => {
    const { data, error } = await supabase
      .from('rental_document_shares')
      .select('id, token, status, expires_at, created_at')
      .eq('document_id', docId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const share = data?.[0];
    if (!share) return null;
    if (share.expires_at) {
      const expiresAt = new Date(share.expires_at);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        await supabase
          .from('rental_document_shares')
          .update({ status: 'expired' })
          .eq('id', share.id);
        return null;
      }
    }
    return share;
  };

  const createDocShare = async (docId: string) => {
    const token = generateDocShareToken();
    const { data, error } = await supabase
      .from('rental_document_shares')
      .insert([{ document_id: docId, token }])
      .select('id, token, expires_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Impossible de créer le lien');
    return data;
  };

  const syncDocShareState = (share: { id: string; token: string; expires_at?: string | null } | null) => {
    setDocShareRecord(share ? { id: share.id, token: share.token, expires_at: share.expires_at ?? null } : null);
    setDocShareLink(share ? buildDocShareUrl(share.token) : '');
  };

  const openDocShareModal = async (doc: { id: string; title: string; doc_type: string }) => {
    setDocShareTarget(doc);
    setDocShareError(null);
    syncDocShareState(null);
    setShowDocShareModal(true);
    setDocShareLoading(true);
    try {
      const existing = await loadActiveDocShare(doc.id);
      const share = existing || await createDocShare(doc.id);
      syncDocShareState(share);
    } catch (err) {
      console.error('doc share', err);
      const message = err instanceof Error ? err.message : 'Impossible de générer le lien';
      setDocShareError(message);
    } finally {
      setDocShareLoading(false);
    }
  };

  const closeDocShareModal = () => {
    if (docShareLoading) return;
    setShowDocShareModal(false);
    setDocShareTarget(null);
    setDocShareError(null);
    syncDocShareState(null);
  };

  const handleCreateDocShare = async () => {
    if (!docShareTarget) return;
    setDocShareLoading(true);
    setDocShareError(null);
    try {
      const share = await createDocShare(docShareTarget.id);
      syncDocShareState(share);
    } catch (err) {
      console.error('doc share create', err);
      const message = err instanceof Error ? err.message : 'Impossible de créer le lien';
      setDocShareError(message);
    } finally {
      setDocShareLoading(false);
    }
  };

  const handleRevokeDocShare = async () => {
    if (!docShareRecord) return;
    if (!window.confirm('Supprimer ce lien ?')) return;
    setDocShareLoading(true);
    setDocShareError(null);
    try {
      const { error } = await supabase
        .from('rental_document_shares')
        .update({ status: 'revoked' })
        .eq('id', docShareRecord.id);
      if (error) throw error;
      syncDocShareState(null);
      toast.success('Lien révoqué');
    } catch (err) {
      console.error('doc share revoke', err);
      const message = err instanceof Error ? err.message : 'Impossible de révoquer le lien';
      toast.error(message);
    } finally {
      setDocShareLoading(false);
    }
  };

  const invalidateQuoteAfterChange = React.useCallback(async (details: string, metadata?: Record<string, any>) => {
    if (!rental) return false;
    if (['pending', 'cancelled', 'archived'].includes(rental.status)) return false;
    try {
      const updates: Partial<Rental> = {
        status: 'pending',
        generate_invoice: false,
      };
      const { error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id);
      if (error) throw error;
      setRental((prev) => (prev ? { ...prev, ...updates } as Rental : prev));
      recordActivity('quote_invalidated', details, metadata || null);
      setShowQuoteInvalidatedModal(true);
      return true;
    } catch (err) {
      console.error('invalidate quote', err);
      return false;
    }
  }, [recordActivity, rental, setRental]);

  const updateServiceForm = <K extends keyof ServiceFormState>(field: K, value: ServiceFormState[K]) => {
    setServiceForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleServiceSave = async () => {
    if (!serviceForm || !rental) return;
    const trimmedTitle = serviceForm.title.trim();
    if (!trimmedTitle) {
      toast.error('Le titre est requis');
      return;
    }
    if (!serviceForm.client_id) {
      toast.error('Sélectionnez un client');
      return;
    }
    if (!serviceForm.start_date || !serviceForm.end_date) {
      toast.error('Renseignez les dates de début et de fin');
      return;
    }
    const startIso = fromDatetimeLocal(serviceForm.start_date);
    const endIso = fromDatetimeLocal(serviceForm.end_date);
    if (!startIso || !endIso) {
      toast.error('Dates de prestation invalides');
      return;
    }
    if (new Date(startIso).getTime() > new Date(endIso).getTime()) {
      toast.error('La date de fin doit être postérieure au début');
      return;
    }
    const discountType = serviceForm.discount_type || null;
    let discountValue: number | null = null;
    if (discountType) {
      const parsed = Number(serviceForm.discount_value);
      if (Number.isNaN(parsed)) {
        toast.error('Valeur de remise invalide');
        return;
      }
      discountValue = parsed;
    }

    const colorValue = serviceForm.color || '#1D4ED8';
    const updates: Partial<Rental> = {
      title: trimmedTitle,
      client_id: serviceForm.client_id,
      start_date: startIso,
      end_date: endIso,
      location: serviceForm.location.trim() || null,
      description: serviceForm.description.trim() || null,
      notes: serviceForm.notes.trim() || null,
      color: colorValue,
      discount_type: discountType as Rental['discount_type'],
      discount_value: discountValue,
    };

    setServiceSaving(true);
    setIsSavingOverlayVisible(true);
    try {
      const changeEntries = buildRentalUpdateEntries(rental, updates);
      const { data, error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id)
        .select()
        .single();
      if (error) throw error;

      const updatedClientName = clients.find((c) => c.id === serviceForm.client_id)?.name || rental.client_name;
      setRental({
        ...rental,
        ...data,
        client_name: updatedClientName,
        title: trimmedTitle,
        start_date: startIso,
        end_date: endIso,
        location: updates.location || null,
        description: updates.description || null,
        notes: updates.notes || null,
        color: colorValue,
        discount_type: updates.discount_type || null,
        discount_value: discountValue,
      } as Rental);
      toast.success(`${formatRentalType(rental?.type)} mise à jour`);
      if (changeEntries.length > 0) {
        recordActivities(changeEntries);
      }
      if (changeEntries.length > 0) {
        await invalidateQuoteAfterChange('Devis annulé : informations générales modifiées.');
      }
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      toast.error(`Impossible de mettre à jour la ${formatRentalTypeLower(rental?.type)}`);
    } finally {
      setServiceSaving(false);
      setTimeout(() => setIsSavingOverlayVisible(false), 450);
    }
  };

  const handleServicePrimaryAction = () => {
    if (!isService || !rental) {
      setIsEditing(!isEditing);
      return;
    }
    if (!serviceForm || serviceSaving) return;
    if (!isEditing) {
      setIsEditing(true);
      return;
    }
    void handleServiceSave();
  };

  const handleRentalEditToggle = () => {
    if (isService) return;
    if (isEditing) {
      if (activeTab === 'general' && generalFormRef.current) {
        generalFormRef.current.requestSubmit();
        return;
      }
      setIsEditing(false);
      return;
    }
    setIsEditing(true);
  };

  const serviceColor = isService && serviceForm ? serviceForm.color : (rental?.color || '#1D4ED8');
  const typeLabel = formatRentalType(rental?.type);
  const typeLabelLower = formatRentalTypeLower(rental?.type);
  const titlePrefix = rental?.reference_code ? `${rental.reference_code} · ${typeLabel}` : typeLabel;
  const effectiveTitle = isService && serviceForm ? serviceForm.title : (rental?.title || '');
  const hasTitle = effectiveTitle.trim().length > 0;
  const fallbackClientName = clientNameFromList || rental?.client_name || 'Client';
  const heading = hasTitle ? effectiveTitle.trim() : `${titlePrefix} – ${fallbackClientName}`;
  const subtitle = hasTitle ? `${titlePrefix} – ${fallbackClientName}` : null;

  const primaryButtonDisabled = (isService && !serviceForm) || serviceSaving;

  const displayColor = rental?.color || serviceColor;
  const colorDisplayText = displayColor
    ? (colorName ? `${displayColor} · ${colorName}` : displayColor)
    : '—';

  const discountDisplay = rental?.discount_type
    ? rental.discount_type === 'percentage'
      ? `${rental.discount_value ?? 0}%`
      : formatMoney(rental.discount_value ?? 0)
    : 'Aucune';
  const startDisplay = rental ? formatDateTimeDisplay(rental.start_date) : '—';
  const endDisplay = rental ? formatDateTimeDisplay(rental.end_date) : '—';
  const usageStartDisplay = rental?.usage_start_date ? formatDateTimeDisplay(rental.usage_start_date) : null;
  const usageEndDisplay = rental?.usage_end_date ? formatDateTimeDisplay(rental.usage_end_date) : null;
  const referenceLabel = rental ? (rental.reference_code || rental.id.slice(0, 6).toUpperCase()) : '—';
  const rentalQrPayload = rental ? `rental:${rental.id}` : '';
  const rentalQrUrl = rentalQrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(rentalQrPayload)}`
    : '';
  React.useEffect(() => {
    const raw = (displayColor || '').trim();
    if (!raw) {
      setColorName(null);
      return;
    }
    const hex = raw.startsWith('#') ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{3,6}$/.test(hex)) {
      setColorName(null);
      return;
    }
    const langKey = language === 'fr' ? 'fr' : 'en';
    const cacheKey = `${hex.toLowerCase()}-${langKey}`;
    const cached = colorNameCache.current.get(cacheKey);
    if (cached) {
      setColorName(cached);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`https://www.thecolorapi.com/id?hex=${hex}`, { signal: controller.signal });
        if (!res.ok) throw new Error('color api');
        const data = await res.json();
        let name: string | undefined = data?.name?.value;
        if (!name) return;
        if (langKey === 'fr') {
          const trRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(name)}&langpair=en|fr`, { signal: controller.signal });
          if (trRes.ok) {
            const trData = await trRes.json();
            const translated = trData?.responseData?.translatedText;
            if (translated && typeof translated === 'string') {
              name = translated;
            }
          }
        }
        if (cancelled) return;
        colorNameCache.current.set(cacheKey, name);
        setColorName(name);
      } catch (err) {
        if (!cancelled) setColorName(null);
      }
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [displayColor, language]);

  const handleCopyRentalQrPayload = async () => {
    if (!rentalQrPayload) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(rentalQrPayload);
      } else {
        const temp = document.createElement('input');
        temp.value = rentalQrPayload;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      toast.success('Code QR de la prestation copié');
    } catch (err) {
      console.error('copy rental qr payload error', err);
      toast.error('Impossible de copier le code QR');
    }
  };

  const renderRentalQrBlock = () => {
    if (!rentalQrPayload || !rentalQrUrl) return null;
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">QR code prestation / location / vente</p>
            <p className="mt-1 text-xs text-gray-600">
              Compatible avec le scan dépôt pour ouvrir rapidement cette fiche.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyRentalQrPayload}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            <Copy className="h-3.5 w-3.5" />
            Copier le code
          </button>
        </div>

        <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <img
            src={rentalQrUrl}
            alt={`QR ${referenceLabel}`}
            className="h-32 w-32 rounded-md border border-gray-200 bg-white p-2"
            loading="lazy"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Contenu du QR</p>
            <p className="mt-1 break-all rounded-md bg-white px-2.5 py-2 font-mono text-xs text-gray-700">
              {rentalQrPayload}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderActionPanel = () => {
    if (!rental) return null;
    const showDecisionButtons = rental.status === 'pending';
    const showApprovalRequestButton = showDecisionButtons;
    const acceptedStatuses: Rental['status'][] = [
      'confirmed',
      'preparing',
      'in_progress',
      'delivered',
      'return_delivery',
      'in_return',
      'returned',
      'completed',
    ];
    const showMarkPaidButton = acceptedStatuses.includes(rental.status) && canRecordPayment;
    const showPrepButton = rental.status === 'confirmed' || rental.status === 'preparing';
    const showDeliveryConfirmButton = canConfirmDelivery;
    const showReturnDeliveryConfirmButton = canConfirmReturnDelivery;
    const showReturnButton = canLaunchReturn;
    const showDeleteButton = false;
    const showCancelButton = !showDecisionButtons && !isCancelled && rental.status !== 'archived';
    const showRestoreButton = rental.status === 'cancelled';
    const actionCount = showDecisionButtons
      ? 2 + (showDeleteButton ? 1 : 0) + (showApprovalRequestButton ? 1 : 0)
      : [showMarkPaidButton, showPrepButton, showDeliveryConfirmButton, showReturnDeliveryConfirmButton, showReturnButton, showCancelButton, showRestoreButton, showDeleteButton].filter(Boolean).length;
    const singleRowClass = actionCount === 1 ? 'flex-1 justify-center' : '';
    const fillRowClass = actionCount === 2 ? 'flex-1 justify-center' : '';
    const denseTextClass = actionCount >= 3 ? 'text-[10px]' : 'text-sm';
    const actionLayoutClass = 'flex flex-nowrap items-stretch gap-2 overflow-x-auto';
    const decisionRowClass = 'flex flex-nowrap items-center gap-2 overflow-x-auto';
    const decisionButtonClass = fillRowClass;
    return (
      <div className={actionLayoutClass}>
        {showDecisionButtons ? (
          <>
            <div className="flex flex-col gap-2 w-full">
              <div className={decisionRowClass}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleRefuseService}
                  className={`flex-1 bg-rose-50 text-rose-700 hover:bg-rose-100 focus:ring-rose-200 ${denseTextClass}`}
                >
                  <ShieldX className="h-4 w-4" /> Refuser
                </Button>
                <Button
                  type="button"
                  onClick={handleAcceptService}
                  className={`flex-1 bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-300 ${denseTextClass}`}
                >
                  <ShieldCheck className="h-4 w-4" /> Valider
                </Button>
              </div>
              {showApprovalRequestButton && (
                <Button
                  type="button"
                  onClick={openApprovalModal}
                  className={`w-full bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-300 ${denseTextClass}`}
                >
                  <FileSignature className="h-4 w-4" /> Demander validation
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2 w-full">
            <div className="flex flex-nowrap items-stretch gap-2">
              {showPrepButton && (
                <Button
                  type="button"
                  onClick={() => setShowPrep(true)}
                  className={`flex-1 justify-center bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-300 ${denseTextClass}`}
                >
                  {rental.status === 'confirmed' ? 'Lancer la préparation' : 'Continuer la préparation'}
                </Button>
              )}
              {showDeliveryConfirmButton && (
                <Button
                  type="button"
                  onClick={() => setShowDeliveryConfirm(true)}
                  className={`flex-1 justify-center bg-sky-600 text-white hover:bg-sky-700 focus:ring-sky-300 ${denseTextClass}`}
                >
                  <Truck className="h-4 w-4" /> Confirmer la livraison
                </Button>
              )}
              {showReturnDeliveryConfirmButton && (
                <Button
                  type="button"
                  onClick={() => setShowReturnDeliveryConfirm(true)}
                  className={`flex-1 justify-center bg-cyan-600 text-white hover:bg-cyan-700 focus:ring-cyan-300 ${denseTextClass}`}
                >
                  <Truck className="h-4 w-4" /> Confirmer la livraison retour
                </Button>
              )}
              {showReturnButton && (
                <Button
                  type="button"
                  onClick={() => {
                    if (shouldWarnEarlyReturn) {
                      setShowEarlyReturnConfirm(true);
                      return;
                    }
                    setReturnMode('new');
                    setShowReturn(true);
                  }}
                  className={`flex-1 justify-center bg-orange-600 text-white hover:bg-orange-700 focus:ring-orange-300 ${denseTextClass}`}
                >
                  Confirmer la réception
                </Button>
              )}
              {showCancelButton && (
                <Button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className={`flex-1 justify-center bg-red-600 text-white hover:bg-red-700 focus:ring-red-300 ${denseTextClass}`}
                >
                  {`Annuler la ${typeLabelLower}`}
                </Button>
              )}
              {showRestoreButton && (
                <Button
                  type="button"
                  onClick={() => setShowRestoreConfirm(true)}
                  className={`flex-1 justify-center bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-300 ${denseTextClass}`}
                >
                  {`Réactiver la ${typeLabelLower}`}
                </Button>
              )}
            </div>
            {showMarkPaidButton && (
              <Button
                type="button"
                onClick={handleOpenPaymentModal}
                disabled={!canRecordPayment}
                className={`w-full bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-300 disabled:opacity-60 ${denseTextClass}`}
              >
                <CreditCard className="h-4 w-4" /> Option de paiement
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };
  const renderProgressCard = () => {
    if (!rental) {
      return null;
    }

    const stepsDisplay = stepsWithState.map((step) => {
      const isPaidStep = step.id === 'paid';
      const description = isPaidStep
        ? paymentState === 'paid'
          ? 'Paiement total enregistré'
          : paymentState === 'partial'
            ? 'Paiement partiel enregistré'
            : 'Aucun paiement enregistré'
        : step.state === 'completed'
          ? 'Étape validée'
          : step.state === 'current'
            ? 'Étape en cours'
            : step.state === 'cancelled'
              ? 'Étape annulée'
              : 'Étape à venir';
      const tone: ProgressStepTone = (() => {
        if (isPaidStep) return paidStepTone;
        if (allStepsCompleted) return 'success';
        if (isCancelled) {
          if (step.id === 'created' || step.id === 'validated') return 'danger';
          if (step.state === 'completed' || step.state === 'current') return 'accent';
        }
        if (step.state === 'cancelled') return 'danger';
        if (step.state === 'completed' || step.state === 'current') return 'accent';
        return 'muted';
      })();

      const displayLabel = step.id === 'returned' && step.state === 'completed'
        ? 'Terminée'
        : step.label;

      return {
        id: step.id,
        label: displayLabel,
        icon: step.icon,
        state: step.state,
        statusLabel: isPaidStep ? paidStatusLabel : STATE_LABEL[step.state],
        description,
        tone,
      };
    });

    return (
      <ProgressStepsCard
        title="Avancement"
        subtitle={`Réf : ${referenceLabel}`}
        badge={{ label: statusBadgeInfo.label, tone: statusBadgeInfo.tone }}
        accentColor={serviceColor}
        steps={stepsDisplay}
        className="h-full"
        showProgress={false}
        headerActions={renderActionPanel()}
        headerActionsClassName="space-y-3"
      />
    );
  };

  const handleRentalGeneralSubmit = React.useCallback(async (updates: Partial<Rental>) => {
    if (!rental) {
      return;
    }
    try {
      const changeEntries = buildRentalUpdateEntries(rental, updates);
      const { data, error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id)
        .select()
        .single();
      if (error) throw error;
      setRental({ ...rental, ...data } as Rental);
      setIsEditing(false);
      if (changeEntries.length > 0) {
        recordActivities(changeEntries);
      }
      if (changeEntries.length > 0) {
        await invalidateQuoteAfterChange('Devis annulé : informations générales modifiées.');
      }
    } catch (e) {
      console.error('update rental', e);
      toast.error("Impossible d'enregistrer les modifications");
    }
  }, [buildRentalUpdateEntries, invalidateQuoteAfterChange, recordActivities, rental]);

  const renderPrimaryInfoCard = () => {
    if (!rental) {
      return (
        <div className="bg-white rounded-lg p-6 h-full">
          <div className="flex items-center justify-center h-32 text-sm text-gray-500">Chargement...</div>
        </div>
      );
    }

    if (isService && isEditing) {
      if (!serviceForm) {
        return (
          <div className="bg-white rounded-lg p-6 h-full">
            <div className="flex items-center justify-center h-32 text-sm text-gray-500">Chargement...</div>
          </div>
        );
      }
      return (
        <div className="bg-white rounded-lg p-6 h-full flex flex-col gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Informations principales</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-600">Titre</p>
                <Input
                  value={serviceForm.title}
                  onChange={(e) => updateServiceForm('title', e.target.value)}
                  placeholder="Titre de la prestation"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-600">Référence</p>
                <p className="text-sm text-gray-900 font-mono">{referenceLabel}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-600">Client</p>
                <Select
                  value={serviceForm.client_id}
                  onChange={(e) => updateServiceForm('client_id', e.target.value)}
                >
                  <option value="">Sélectionner un client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-600">Lieu</p>
                <Input
                  value={serviceForm.location}
                  onChange={(e) => updateServiceForm('location', e.target.value)}
                  placeholder="Lieu de la prestation"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-600">Début</p>
                <Input
                  type="datetime-local"
                  value={serviceForm.start_date}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (serviceSingleDay) {
                      const startValue = toStartOfDayLocal(nextValue);
                      updateServiceForm('start_date', startValue);
                      updateServiceForm('end_date', startValue ? toEndOfDayLocal(startValue) : '');
                      return;
                    }
                    updateServiceForm('start_date', nextValue);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-600">Fin</p>
                <div className="relative flex items-stretch gap-2" ref={serviceSingleDayMenuRef}>
                  <Input
                    type="datetime-local"
                    value={serviceForm.end_date}
                    onChange={(e) => updateServiceForm('end_date', e.target.value)}
                    disabled={serviceSingleDay}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setServiceSingleDayMenuOpen((prev) => !prev)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                    aria-label="Options"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {serviceSingleDayMenuOpen && (
                    <div className="absolute right-0 top-full z-20 mt-2 w-[220px] rounded-xl border border-slate-200 bg-white shadow-lg">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm font-medium text-slate-700">1 jour</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={serviceSingleDay}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setServiceSingleDay(checked);
                              if (!checked) return;
                              const base = serviceForm.start_date || serviceForm.end_date;
                              if (!base) return;
                              const startValue = toStartOfDayLocal(base);
                              updateServiceForm('start_date', startValue);
                              updateServiceForm('end_date', startValue ? toEndOfDayLocal(startValue) : '');
                            }}
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-600">Couleur</p>
                <div className="flex items-center gap-3">
                  <ColorPickerButton
                    value={serviceForm.color || '#111827'}
                    onChange={(value) => updateServiceForm('color', value)}
                    size="md"
                  />
                  <Input
                    value={serviceForm.color}
                    onChange={(e) => updateServiceForm('color', e.target.value)}
                    className="max-w-[140px]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-600">Remise</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    value={serviceForm.discount_type}
                    onChange={(e) => updateServiceForm('discount_type', e.target.value)}
                  >
                    <option value="">Aucune</option>
                    <option value="percentage">Pourcentage</option>
                    <option value="fixed">Montant fixe</option>
                  </Select>
                  <Input
                    type="number"
                    value={serviceForm.discount_value}
                    onChange={(e) => updateServiceForm('discount_value', e.target.value)}
                    placeholder="0"
                    disabled={!serviceForm.discount_type}
                  />
                </div>
              </div>
            </div>
          </div>
          {renderRentalQrBlock()}
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-lg font-semibold text-gray-900">Description</h3>
            <Textarea
              rows={4}
              value={serviceForm.description}
              onChange={(e) => updateServiceForm('description', e.target.value)}
              placeholder="Ajoutez des informations complémentaires..."
            />
          </div>
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-lg font-semibold text-gray-900">Info client</h3>
            <Textarea
              rows={3}
              value={serviceForm.notes}
              onChange={(e) => updateServiceForm('notes', e.target.value)}
              placeholder="Informations utiles sur le client..."
            />
          </div>
        </div>
      );
    }

    if (!isService && isEditing) {
      return (
        <div className="bg-white rounded-lg p-6 h-full flex flex-col gap-6">
          <RentalGeneralForm
            rental={rental}
            clients={clients.map(c => ({ id: c.id, name: c.name, client_type: c.client_type, company_client_id: c.company_client_id }))}
            onSubmit={handleRentalGeneralSubmit}
            formRef={generalFormRef}
          />
          {renderRentalQrBlock()}
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg p-6 h-full flex flex-col gap-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Informations principales</h3>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-600">Titre</p>
              <p className="text-sm text-gray-900">{rental.title || 'Non renseigné'}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-600">Référence</p>
              <p className="text-sm text-gray-900 font-mono">{referenceLabel}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-600">Client</p>
              <p className="text-sm text-gray-900">{fallbackClientName}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-600">Lieu</p>
              <p className="text-sm text-gray-900">{rental.location || 'Non renseigné'}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Période de Facturation</p>
              <p className="text-sm text-gray-900">{startDisplay} → {endDisplay}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{"Période d'Utilisation"}</p>
              {usageStartDisplay && usageEndDisplay ? (
                <p className="text-sm text-gray-900">{usageStartDisplay} → {usageEndDisplay}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">Non renseignée — utilise la facturation</p>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-600">Couleur</p>
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-4 w-4 rounded-full border border-slate-200 shadow-sm"
                  style={{ backgroundColor: displayColor || serviceColor }}
                />
                <span className="text-sm text-gray-900">{colorDisplayText}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-600">Remise</p>
              <p className="text-sm text-gray-900">{discountDisplay}</p>
            </div>
          </div>
        </div>
        {renderRentalQrBlock()}
        <div className="border-t border-gray-100 pt-6">
          <h3 className="text-lg font-semibold text-gray-900">Description</h3>
          <p className="mt-3 text-sm leading-relaxed text-gray-700">
            {rental.description?.trim() || 'Aucune description fournie.'}
          </p>
        </div>
        <div className="border-t border-gray-100 pt-6">
          <h3 className="text-lg font-semibold text-gray-900">Info client</h3>
          <p className="mt-3 text-sm leading-relaxed text-gray-700">
            {rental.notes?.trim() || 'Aucune information client.'}
          </p>
        </div>
      </div>
    );
  };

  const renderGeneralTab = () => (
    <div className="bg-gray-100 p-6 space-y-6">
      <div className="flex flex-col xl:flex-row gap-6 items-stretch">
        <div className="flex-1 min-w-0 h-full">
          {renderPrimaryInfoCard()}
        </div>
        <div className="xl:w-[35%] xl:flex-none h-full">
          {renderProgressCard()}
        </div>
      </div>
    </div>
  );
  if (loading || clientsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !rental) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Erreur de chargement</h3>
        <p className="mt-2 text-sm text-gray-500">Le projet est introuvable ou a été supprimé.</p>
        <button
          onClick={() => navigate('/rentals')}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          Retour aux projets
        </button>
      </div>
    );
  }

  const handleEditSubmit = (data: Partial<Rental>) => {
    setRental({ ...rental, ...data });
    setIsEditing(false);
  };

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    const item = rental.items.find((target) => target.id === itemId);
    if (!item) return;
    const safeQuantity = Math.max(1, newQuantity);
    if (item.quantity === safeQuantity) return;
    setRental({
      ...rental,
      items: rental.items.map((item) =>
        item.id === itemId ? { ...item, quantity: safeQuantity } : item
      ),
    });
    recordActivity(
      'item_quantity_updated',
      `${item.equipment_name}: ${item.quantity} -> ${safeQuantity}`,
      { item_id: itemId }
    );
  };

  const handleDiscountChange = async (itemId: string, newDiscount: number) => {
    if (!rental) return;
    const currentItem = rental.items.find((item) => item.id === itemId);
    const safeDiscount = Number.isFinite(newDiscount) ? Math.min(100, Math.max(0, newDiscount)) : 0;
    const nextItems = rental.items.map((item) =>
      item.id === itemId ? { ...item, discount_percent: safeDiscount } : item
    );
    setRental({ ...rental, items: nextItems });

    try {
      const { error } = await supabase
        .from('rental_items')
        .update({ discount_percent: safeDiscount })
        .eq('id', itemId);
      if (error) throw error;

      const itemsSubtotal = computeItemsSubtotal(nextItems, effectiveCoefficient);
      const baseTotal = itemsSubtotal + maintenanceSubtotal + deliverySubtotal + personnelServicesTotal + insuranceServicesTotal + otherServicesTotal;
      const rentalDiscount = rental.discount_type === 'percentage'
        ? baseTotal * ((rental.discount_value || 0) / 100)
        : (rental.discount_value || 0);
      const nextTotal = Math.max(0, baseTotal - rentalDiscount);

      const { error: totalError } = await supabase
        .from('rentals')
        .update({ total_price: Number(nextTotal.toFixed(2)) })
        .eq('id', rental.id);
      if (totalError) throw totalError;

      setRental(prev => prev ? { ...prev, total_price: Number(nextTotal.toFixed(2)) } : prev);
      if (currentItem) {
        const prevDiscount = Number.isFinite(currentItem.discount_percent)
          ? Math.min(100, Math.max(0, Number(currentItem.discount_percent)))
          : 0;
        if (prevDiscount !== safeDiscount) {
          recordActivity(
            'item_discount_updated',
            `${currentItem.equipment_name}: ${prevDiscount}% -> ${safeDiscount}%`,
            { item_id: itemId }
          );
          await invalidateQuoteAfterChange('Devis annulé : remise modifiée.', { item_id: itemId });
        }
      }
    } catch (err) {
      console.error('update discount', err);
      toast.error("Impossible de mettre à jour la remise");
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!rental) return;
    const targetItem = rental.items.find((item) => item.id === itemId);
    if (!targetItem) return;
    try {
      const { error } = await supabase
        .from('rental_items')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
      const nextItems = rental.items.filter((item) => item.id !== itemId);
      const itemsSubtotal = computeItemsSubtotal(nextItems, effectiveCoefficient);
      const baseTotal = itemsSubtotal + maintenanceSubtotal + deliverySubtotal + personnelServicesTotal + insuranceServicesTotal + otherServicesTotal;
      const rentalDiscount = rental.discount_type === 'percentage'
        ? baseTotal * ((rental.discount_value || 0) / 100)
        : (rental.discount_value || 0);
      const nextTotal = Math.max(0, baseTotal - (rentalDiscount || 0));

      await supabase
        .from('rentals')
        .update({ total_price: Number(nextTotal.toFixed(2)) })
        .eq('id', rental.id);

      setRental(prev => prev ? { ...prev, items: nextItems, total_price: Number(nextTotal.toFixed(2)) } : prev);
      recordActivity(
        'item_removed',
        `${targetItem.equipment_name} (x${targetItem.quantity}) retiré`,
        { item_id: itemId }
      );
      await invalidateQuoteAfterChange('Devis annulé : matériel retiré.', { item_id: itemId });
      toast.success('Matériel retiré');
    } catch (err) {
      console.error('remove item', err);
      toast.error("Impossible de retirer le matériel");
    }
  };

  const handleSaveCoefficientOverride = async () => {
    if (!rental || coefficientSaving) return;
    const normalizedInput = coefficientInput.replace(',', '.').trim();
    const parsed = Number.parseFloat(normalizedInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Coefficient invalide.');
      return;
    }
    setCoefficientSaving(true);
    try {
      const nextTotal = computeTotalForCoefficient(rental.items, parsed, deliverySubtotal);
      const updates: Partial<Rental> = {
        rental_coefficient_override: parsed,
        total_price: Number(nextTotal.toFixed(2)),
      };
      const { error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id);
      if (error) throw error;
      setRental(prev => (prev ? { ...prev, ...updates } as Rental : prev));
      setCoefficientDirty(false);
      toast.success('Coefficient mis à jour');
      await invalidateQuoteAfterChange('Devis annulé : coefficient modifié.');
    } catch (err) {
      console.error('save coefficient override', err);
      toast.error("Impossible de modifier le coefficient");
    } finally {
      setCoefficientSaving(false);
    }
  };

  const handleResetCoefficientOverride = async () => {
    if (!rental || coefficientSaving) return;
    setCoefficientSaving(true);
    try {
      const nextTotal = computeTotalForCoefficient(rental.items, defaultCoefficient, deliverySubtotal);
      const updates: Partial<Rental> = {
        rental_coefficient_override: null,
        total_price: Number(nextTotal.toFixed(2)),
      };
      const { error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id);
      if (error) throw error;
      setRental(prev => (prev ? { ...prev, ...updates } as Rental : prev));
      setCoefficientInput(defaultCoefficient.toFixed(2));
      setCoefficientDirty(false);
      toast.success('Coefficient réinitialisé');
      await invalidateQuoteAfterChange('Devis annulé : coefficient réinitialisé.');
    } catch (err) {
      console.error('reset coefficient override', err);
      toast.error("Impossible de reinitialiser le coefficient");
    } finally {
      setCoefficientSaving(false);
    }
  };

  const handleAddItem = async (equipment: Equipment, quantity: number, groupId?: string | null) => {
    if (!rental) return;
    const targetGroupId = groupId || null;
    const siblings = rental.items.filter((item) => (item.group_id || null) === targetGroupId);
    const position = siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.position || 0)) + 1;

    try {
      const { data, error } = await supabase
        .from('rental_items')
        .insert([{
          rental_id: rental.id,
          equipment_id: equipment.id,
          quantity,
          price_per_day: equipment.rental_price_ttc,
          discount_percent: 0,
          group_id: targetGroupId,
          position,
          is_external: false,
        }])
        .select('id, equipment_id, quantity, price_per_day, discount_percent, group_id, position, equipment:equipment_id(name, type), is_external')
        .single();
      if (error) throw error;

      const inserted = {
        id: data.id,
        equipment_id: data.equipment_id,
        equipment_name: data.equipment?.name || equipment.name,
        equipment_type: data.equipment?.type || equipment.type,
        quantity: data.quantity,
        price_per_day: data.price_per_day,
        discount_percent: data.discount_percent ?? 0,
        group_id: data.group_id,
        position: data.position,
        is_external: !!data.is_external,
      } as RentalItem;

      setRental(prev => prev ? { ...prev, items: [...prev.items, inserted] } : prev);
      toast.success('Matériel ajouté');
      recordActivity(
        'item_added',
        `${inserted.equipment_name} (x${inserted.quantity}) ajouté`,
        { item_id: inserted.id, equipment_id: inserted.equipment_id }
      );
      await invalidateQuoteAfterChange('Devis annulé : matériel ajouté.', { item_id: inserted.id, equipment_id: inserted.equipment_id });
    } catch (err) {
      console.error('add item', err);
      toast.error("Impossible d'ajouter le matériel");
    }
  };

  const handleAddExternalItem = async (
    payload: { name: string; description?: string; type: string; subtype?: string; supplier?: string; price_per_day: number },
    quantity: number,
    groupId?: string | null,
  ) => {
    if (!rental) return;
    const targetGroupId = groupId || null;
    const siblings = rental.items.filter((item) => (item.group_id || null) === targetGroupId);
    const position = siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.position || 0)) + 1;
    const baseType = [payload.type, payload.subtype].filter(Boolean).join(' / ');
    const externalLabel = rental?.type === 'sale' ? 'Achat matériel' : 'Sous-location';
    const displayType = baseType ? `${baseType} (${externalLabel})` : externalLabel;

    try {
      const { data, error } = await supabase
        .from('rental_items')
        .insert([{
          rental_id: rental.id,
          equipment_id: null,
          quantity,
          price_per_day: payload.price_per_day,
          discount_percent: 0,
          group_id: targetGroupId,
          position,
          is_external: true,
          external_name: payload.name,
          external_description: payload.description || null,
          external_type: payload.type,
          external_subtype: payload.subtype || null,
          external_supplier: payload.supplier || null,
        }])
        .select('id, equipment_id, quantity, price_per_day, discount_percent, group_id, position, is_external, external_name, external_description, external_type, external_subtype, external_supplier')
        .single();
      if (error) throw error;

      const inserted: RentalItem = {
        id: data.id,
        equipment_id: null,
        equipment_name: data.external_name || payload.name,
        equipment_type: displayType,
        quantity: data.quantity,
        price_per_day: data.price_per_day,
        discount_percent: data.discount_percent ?? 0,
        group_id: data.group_id,
        position: data.position,
        is_external: true,
        external_name: data.external_name,
        external_description: data.external_description,
        external_type: data.external_type,
        external_subtype: data.external_subtype,
        external_supplier: data.external_supplier,
      };

      setRental(prev => prev ? { ...prev, items: [...prev.items, inserted] } : prev);
      toast.success(
        rental?.type === 'sale' ? 'Achat matériel ajouté' : 'Matériel sous-loué ajouté'
      );
      recordActivity(
        'item_added',
        `${inserted.equipment_name} (x${inserted.quantity}) ajouté`,
        { item_id: inserted.id }
      );
      await invalidateQuoteAfterChange('Devis annulé : matériel ajouté.', { item_id: inserted.id });
    } catch (err) {
      console.error('add external item', err);
      toast.error(
        rental?.type === 'sale'
          ? "Impossible d'ajouter l'achat matériel"
          : "Impossible d'ajouter la sous-location"
      );
    }
  };

  const handleAddMaintenanceCharge = async () => {
    if (!rental) return;
    const selectedOption = maintenanceOptions.find((opt) => opt.id === selectedMaintenanceId);
    const label = (maintenanceLabel || selectedOption?.title || '').trim();
    const amountValue = maintenanceAmount !== '' ? parseFloat(maintenanceAmount) : (selectedOption?.cost ?? 0);

    if (!label) {
      toast.error('Définissez un libellé pour la maintenance');
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error('Montant invalide');
      return;
    }

    try {
      setAddingMaintenance(true);
      const { data, error } = await supabase
        .from('rental_maintenance_charges')
        .insert([{
          rental_id: rental.id,
          maintenance_id: selectedMaintenanceId || null,
          label,
          amount: amountValue,
        }])
        .select('id, maintenance_id, label, amount, maintenance:maintenance_id(title, status)')
        .single();
      if (error) throw error;
      const newCharge = {
        id: data.id,
        maintenance_id: data.maintenance_id,
        label: data.label,
        amount: Number(data.amount || 0),
        maintenance_title: data.maintenance?.title,
        maintenance_status: data.maintenance?.status,
      };
      setRental(prev => prev ? {
        ...prev,
        maintenance_charges: [...(prev.maintenance_charges || []), newCharge],
      } : prev);
      toast.success('Maintenance ajoutée à la facture');
      setSelectedMaintenanceId('');
      setMaintenanceLabel('');
      setMaintenanceAmount('');
      setShowAddMaintenance(false);
      recordActivity(
        'maintenance_added',
        `${newCharge.label} (${formatMoney(newCharge.amount)}) ajouté`,
        { maintenance_id: newCharge.maintenance_id }
      );
      await invalidateQuoteAfterChange('Devis annulé : maintenance ajoutée.', { maintenance_id: newCharge.maintenance_id });
    } catch (err) {
      console.error('add maintenance charge', err);
      toast.error("Impossible d'ajouter la maintenance");
    } finally {
      setAddingMaintenance(false);
    }
  };

  const handleRemoveMaintenanceCharge = async (chargeId: string) => {
    if (!window.confirm('Retirer cette maintenance de la facture ?')) return;
    try {
      const targetCharge = (rental?.maintenance_charges || []).find((charge) => charge.id === chargeId);
      const { error } = await supabase
        .from('rental_maintenance_charges')
        .delete()
        .eq('id', chargeId);
      if (error) throw error;
      setRental(prev => prev ? {
        ...prev,
        maintenance_charges: (prev.maintenance_charges || []).filter(charge => charge.id !== chargeId),
      } : prev);
      toast.success('Maintenance retirée');
      if (targetCharge) {
        recordActivity(
          'maintenance_removed',
          `${targetCharge.label} (${formatMoney(targetCharge.amount)}) retiré`,
          { maintenance_id: targetCharge.maintenance_id }
        );
      }
      await invalidateQuoteAfterChange('Devis annulé : maintenance retirée.', { maintenance_id: targetCharge?.maintenance_id || null });
    } catch (err) {
      console.error('remove maintenance charge', err);
      toast.error("Impossible de retirer la maintenance");
    }
  };

  const handleAcceptService = async () => {
    const currentRental = rental;
    try {
      if (!currentRental) return;
      if (currentRental.status !== 'pending') return;
      const amount_ttc = Math.round(totalTTC * 100) / 100;
      await ensureRentalDraftInvoice({
        rentalId: currentRental.id,
        clientId: currentRental.client_id || null,
        referenceCode: currentRental.reference_code || null,
        amountTTC: amount_ttc,
        note: `Générée après acceptation de la ${formatRentalTypeLower(currentRental?.type)}`,
      });
      const { data: updData, error: updErr } = await supabase
        .from('rentals')
        .update({ status: 'confirmed', generate_invoice: true })
        .eq('id', currentRental.id)
        .select('id');
      if (updErr) throw updErr;
      if (!updData || updData.length === 0) throw new Error('La mise à jour a été refusée par le serveur (permissions insuffisantes).');
      toast.success(`${formatRentalType(currentRental?.type)} acceptée. Facture brouillon créée.`);
      setRental((prev) => prev ? { ...prev, status: 'confirmed', generate_invoice: true } as any : prev);
      recordActivity('status_confirmed', `${formatRentalType(currentRental?.type)} acceptée.`);
    } catch (e) {
      console.error('[handleAcceptService]', e);
      toast.error(e instanceof Error ? e.message : `Impossible d'accepter la ${formatRentalTypeLower(currentRental?.type)}`);
    }
  };

  const handleRefuseService = async () => {
    const currentRental = rental;
    try {
      if (!currentRental) return;
      await supabase.from('calendar_events').delete().or(`rental_id.eq.${currentRental.id},service_id.eq.${currentRental.id}`);
      const { data: updData, error } = await supabase.from('rentals').update({
        status: 'cancelled',
        status_before_cancellation: currentRental.status,
        cancelled_at: null,
        cancellation_reason: 'Rejetée',
        cancellation_payment_policy: null,
        cancellation_refund_amount: null,
      }).eq('id', currentRental.id).select('id');
      if (error) throw error;
      if (!updData || updData.length === 0) throw new Error('La mise à jour a été refusée par le serveur (permissions insuffisantes).');
      toast.success(`${formatRentalType(currentRental?.type)} rejetée`);
      setRental((prev) => prev ? { ...prev, status: 'cancelled', status_before_cancellation: currentRental.status, cancelled_at: null } as any : prev);
      recordActivity('status_rejected', `${formatRentalType(currentRental?.type)} rejetée.`);
    } catch (e) {
      console.error('[handleRefuseService]', e);
      toast.error(e instanceof Error ? e.message : `Impossible de rejeter la ${formatRentalTypeLower(currentRental?.type)}`);
    }
  };

  const deleteServiceAllTraces = async () => {
    try {
      if (!rental) return;
      setDeleteAction('purge');
      const targetId = rental.id;
      const { error: calErr } = await supabase
        .from('calendar_events')
        .delete()
        .or(`rental_id.eq.${targetId},service_id.eq.${targetId}`);
      if (calErr) throw calErr;
      const { error: vdhErr } = await supabase
        .from('vehicle_delivery_history')
        .delete()
        .eq('rental_id', targetId);
      if (vdhErr) throw vdhErr;
      const { error: vaErr } = await supabase
        .from('vehicle_assignments')
        .delete()
        .eq('rental_id', targetId);
      if (vaErr) throw vaErr;
      const { error: actErr } = await supabase
        .from('personnel_activities')
        .delete()
        .eq('rental_id', targetId);
      if (actErr) throw actErr;
      const { error: payErr } = await supabase
        .from('payments')
        .delete()
        .eq('rental_id', targetId);
      if (payErr) throw payErr;
      const { error: invErr } = await supabase
        .from('invoices')
        .delete()
        .eq('rental_id', targetId);
      if (invErr) throw invErr;
      const { error: docErr } = await supabase
        .from('rental_documents')
        .delete()
        .eq('rental_id', targetId);
      if (docErr) throw docErr;
      const { error: rentalErr } = await supabase.from('rentals').delete().eq('id', targetId);
      if (rentalErr) throw rentalErr;
      toast.success(`${formatRentalType(rental?.type)} supprimée`);
      setShowDeleteOptions(false);
      navigate('/rentals');
    } catch (e) {
      console.error(e);
      toast.error('Suppression impossible');
    } finally {
      setDeleteAction(null);
    }
  };

  const archiveService = async () => {
    try {
      if (!rental) return;
      setDeleteAction('archive');
      const { error } = await supabase.from('rentals').update({ status: 'archived' }).eq('id', rental.id);
      if (error) throw error;
      setRental({ ...rental, status: 'archived' } as any);
      toast.success(`${formatRentalType(rental?.type)} archivée`);
      recordActivity('status_archived', `${formatRentalType(rental?.type)} archivée.`);
      setShowDeleteOptions(false);
      navigate('/rentals');
    } catch (e) {
      console.error(e);
      toast.error(`Impossible d'archiver la ${formatRentalTypeLower(rental?.type)}`);
    } finally {
      setDeleteAction(null);
    }
  };

  const handleDeleteService = async () => {
    try {
      if (!rental) return;
      if (isPaidOrPartiallyPaid) {
        setShowDeleteOptions(true);
        return;
      }
      await supabase.from('calendar_events').delete().or(`rental_id.eq.${rental.id},service_id.eq.${rental.id}`);
      const { error } = await supabase.from('rentals').delete().eq('id', rental.id);
      if (error) throw error;
      toast.success(`${formatRentalType(rental?.type)} supprimée`);
      navigate('/rentals');
    } catch (e) {
      console.error(e);
      toast.error('Suppression impossible');
    }
  };

  const handleCancelRental = async () => {
    if (!rental) return;
    if (cancelling) return;
    setCancelError(null);

    const policy = hasPayments ? cancelPaymentMode : 'no_payment';
    let refundAmount = 0;
    if (hasPayments && policy === 'refund_full') {
      refundAmount = totalPaid;
    }
    if (hasPayments && policy === 'refund_partial') {
      const parsed = parseLocalizedNumber(cancelRefundAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setCancelError('Saisissez un montant valide à rembourser.');
        return;
      }
      if (parsed > totalPaid + 0.009) {
        setCancelError('Le montant ne peut pas dépasser le total encaissé.');
        return;
      }
      refundAmount = parsed;
    }

    setCancelling(true);
    try {
      if (refundAmount > 0) {
        const paymentDate = new Date().toISOString().slice(0, 10);
        const reference = `REFUND-${Date.now()}`;
        const { data: refundRow, error: refundErr } = await supabase
          .from('payments')
          .insert([{
            rental_id: rental.id,
            invoice_id: linkedInvoiceId || null,
            amount: -Number(refundAmount.toFixed(2)),
            payment_method: 'Remboursement',
            payment_date: paymentDate,
            reference,
            status: 'completed',
            payment_type: 'refund',
          }])
          .select('id, amount, payment_method, payment_date, reference, status, invoice_id, payment_type')
          .single();
        if (refundErr) throw refundErr;
        if (refundRow) {
          setPaymentHistory((prev) => [mapPaymentRow(refundRow), ...prev]);
        }
      }

      const updates: Partial<Rental> = {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason.trim() || null,
        cancellation_payment_policy: policy,
        cancellation_refund_amount: refundAmount > 0 ? Number(refundAmount.toFixed(2)) : null,
        status_before_cancellation: rental.status,
      };
      const { error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id);
      if (error) throw error;
      setRental(prev => (prev ? { ...prev, ...updates } as Rental : prev));

      const policyLabel = (() => {
        if (!hasPayments || policy === 'no_payment') return 'Aucun paiement enregistré';
        if (policy === 'keep') return 'Paiements conservés';
        if (policy === 'refund_full') return `Remboursement total ${formatMoney(refundAmount)}`;
        return `Remboursement partiel ${formatMoney(refundAmount)}`;
      })();
      const reasonText = cancelReason.trim() ? ` Motif: ${cancelReason.trim()}` : '';
      recordActivity('status_cancelled', `${formatRentalType(rental?.type)} annulée — ${policyLabel}.${reasonText}`);
      if (refundAmount > 0) {
        recordActivity('payment_recorded', `Remboursement de ${formatMoney(refundAmount)}.`, {
          amount: refundAmount,
          payment_type: 'refund',
        });
      }
      toast.success(`${formatRentalType(rental?.type)} annulée`);
      setShowCancelModal(false);
      setCancelReason('');
      setCancelRefundAmount('');
    } catch (err) {
      console.error('cancel rental', err);
      toast.error(`Impossible d'annuler la ${formatRentalTypeLower(rental?.type)}`);
    } finally {
      setCancelling(false);
    }
  };

  const handleRestoreRental = async () => {
    if (!rental) return;
    try {
      const fallbackStatus: Rental['status'] = rental.cancelled_at ? 'confirmed' : 'pending';
      const nextStatus = (rental.status_before_cancellation as Rental['status']) || fallbackStatus;
      const updates: Partial<Rental> = {
        status: nextStatus,
        cancelled_at: null,
        cancellation_reason: null,
        cancellation_payment_policy: null,
        cancellation_refund_amount: null,
        status_before_cancellation: null,
      };
      const { error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id);
      if (error) throw error;
      setRental(prev => (prev ? { ...prev, ...updates } as Rental : prev));
      recordActivity('status_restored', `${formatRentalType(rental?.type)} réactivée.`);
      toast.success(`${formatRentalType(rental?.type)} réactivée`);
    } catch (err) {
      console.error('restore rental', err);
      toast.error(`Impossible de réactiver la ${formatRentalTypeLower(rental?.type)}`);
    } finally {
      setShowRestoreConfirm(false);
    }
  };


  const saveDeliveryAddress = async () => {
    if (!id || !rental) return;
    setSavingDeliveryAddress(true);
    try {
      await supabase.from('rentals').update({ delivery_address: deliveryAddressEdit.trim() || null }).eq('id', id);
      setRental({ ...rental, delivery_address: deliveryAddressEdit.trim() || null });
      toast.success('Adresse de livraison enregistrée');
    } catch {
      toast.error("Impossible d'enregistrer l'adresse");
    } finally {
      setSavingDeliveryAddress(false);
    }
  };

  const saveDelivery = async () => {
    if (!id || !rental) return;
    try {
      // Fetch current to be safe
      const { data: current } = await supabase
        .from('vehicle_assignments')
        .select('id, vehicle_id')
        .eq('rental_id', id);
      const currentIds = new Set((current || []).map((r: any) => r.id as string));
      const nextIds = new Set(deliveryRows.filter(r => r.id).map(r => r.id as string));
      const toDelete = Array.from(currentIds).filter(x => !nextIds.has(x));
      if (toDelete.length) {
        await supabase.from('vehicle_assignments').delete().in('id', toDelete);
        // Log cancellations
        const hist = toDelete.map(x => {
          const row = (current || []).find((r: any) => r.id === x);
          return row ? { vehicle_id: row.vehicle_id, rental_id: id, event: 'cancelled', event_time: rental.start_date, location: rental.location || null, notes: null } : null;
        }).filter(Boolean);
        if (hist.length) await supabase.from('vehicle_delivery_history').insert(hist as any[]);
      }

      // Upsert rows
      for (const r of deliveryRows) {
        const payload: any = {
          vehicle_id: r.vehicle_id,
          rental_id: id,
          start_at: rental.start_date,
          end_at: rental.end_date,
          status: 'scheduled',
          delivery_at: r.delivery_at || null,
          appointment_at: r.appointment_at || null,
          return_delivery_at: r.return_delivery_at || null,
          return_appointment_at: r.return_appointment_at || null,
        };
        if (r.id) {
          await supabase.from('vehicle_assignments').update(payload).eq('id', r.id);
          // log if times provided
          const hist: any[] = [];
          if (r.delivery_at) hist.push({ vehicle_id: r.vehicle_id, rental_id: id, event: 'delivery', event_time: r.delivery_at, location: rental.location || null, notes: null });
          if (r.appointment_at) hist.push({ vehicle_id: r.vehicle_id, rental_id: id, event: 'appointment', event_time: r.appointment_at, location: rental.location || null, notes: null });
          if (hist.length) await supabase.from('vehicle_delivery_history').insert(hist);
        } else {
          const { data: ins } = await supabase
            .from('vehicle_assignments')
            .insert([payload])
            .select('id')
            .single();
          if (ins?.id) {
            r.id = ins.id;
            const hist: any[] = [];
            if (r.delivery_at) hist.push({ vehicle_id: r.vehicle_id, rental_id: id, event: 'delivery', event_time: r.delivery_at, location: rental.location || null, notes: null });
            if (r.appointment_at) hist.push({ vehicle_id: r.vehicle_id, rental_id: id, event: 'appointment', event_time: r.appointment_at, location: rental.location || null, notes: null });
            if (!r.delivery_at && !r.appointment_at) hist.push({ vehicle_id: r.vehicle_id, rental_id: id, event: 'scheduled', event_time: rental.start_date, location: rental.location || null, notes: null });
            if (hist.length) await supabase.from('vehicle_delivery_history').insert(hist);
          }
        }
      }
      toast.success('Livraison mise à jour');
      recordActivity('delivery_schedule_updated', 'Logistique mise à jour.');
    } catch (e) {
      console.error(e);
      toast.error('Sauvegarde livraison impossible');
    }
  };

  const addPersonnelServiceRow = () => {
    setPersonnelServiceRows((prev) => [
      ...prev,
      {
        id: globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `tmp-${Math.random().toString(36).slice(2, 9)}`,
        service_record_id: '',
        quantity: 1,
        days: 1,
        discount_percent: 0,
      },
    ]);
  };

  const updatePersonnelServiceRow = (rowId: string, updates: Partial<{ service_record_id: string; quantity: number; days: number; discount_percent: number }>) => {
    setPersonnelServiceRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...updates } : row))
    );
  };

  const removePersonnelServiceRow = (rowId: string) => {
    setPersonnelServiceRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const addInsuranceServiceRow = () => {
    setInsuranceServiceRows((prev) => [
      ...prev,
      {
        id: globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `tmp-${Math.random().toString(36).slice(2, 9)}`,
        service_record_id: '',
        days: 1,
      },
    ]);
  };

  const updateInsuranceServiceRow = (rowId: string, updates: Partial<{ service_record_id: string; days: number }>) => {
    setInsuranceServiceRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...updates } : row))
    );
  };

  const removeInsuranceServiceRow = (rowId: string) => {
    setInsuranceServiceRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const addOtherServiceRow = () => {
    setOtherServiceRows((prev) => [
      ...prev,
      {
        id: globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `tmp-${Math.random().toString(36).slice(2, 9)}`,
        service_record_id: '',
        quantity: 1,
        days: 1,
      },
    ]);
  };

  const updateOtherServiceRow = (rowId: string, updates: Partial<{ service_record_id: string; quantity: number; days: number }>) => {
    setOtherServiceRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...updates } : row))
    );
  };

  const removeOtherServiceRow = (rowId: string) => {
    setOtherServiceRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const savePersonnelAssignments = async () => {
    if (!rental) return;
    setSavingPersonnelAssignments(true);
    try {
      const { data: current, error } = await supabase
        .from('rental_affectation')
        .select('personnel_id')
        .eq('rental_id', rental.id);
      if (error) throw error;
      const currentIds = new Set((current || []).map((row: any) => row.personnel_id));
      const nextIds = new Set(personnelAssignmentIds);
      const toRemove = Array.from(currentIds).filter((pid) => !nextIds.has(pid));
      const toAdd = Array.from(nextIds).filter((pid) => !currentIds.has(pid));
      if (toRemove.length) {
        await supabase
          .from('rental_affectation')
          .delete()
          .eq('rental_id', rental.id)
          .in('personnel_id', toRemove);
        await supabase
          .from('personnel_activities')
          .delete()
          .eq('rental_id', rental.id)
          .eq('type', 'service')
          .in('personnel_id', toRemove);
      }
      if (toAdd.length) {
        const linkRows = toAdd.map((personnelId) => ({
          rental_id: rental.id,
          personnel_id: personnelId,
        }));
        await supabase.from('rental_affectation').insert(linkRows);
        const activityRows = toAdd.map((personnelId) => ({
          personnel_id: personnelId,
          type: 'service',
          title: 'Affectation prestation',
          description: rental.location || null,
          rental_id: rental.id,
          client_name: null,
          location: rental.location || null,
          start_time: rental.start_date,
          end_time: rental.end_date,
          status: 'pending',
        }));
        await supabase.from('personnel_activities').insert(activityRows);
      }

      const personnelMap = new Map<string, { id: string; first_name: string; last_name: string }>();
      personnelList.forEach((person) => {
        personnelMap.set(person.id, { id: person.id, first_name: person.first_name, last_name: person.last_name });
      });
      (rental.assigned_personnel || []).forEach((person) => {
        if (!personnelMap.has(person.id)) {
          personnelMap.set(person.id, person);
        }
      });
      const nextAssignments = Array.from(nextIds)
        .map((pid) => personnelMap.get(pid))
        .filter(Boolean) as Array<{ id: string; first_name: string; last_name: string }>;
      nextAssignments.sort((a, b) => {
        const last = a.last_name.localeCompare(b.last_name);
        return last !== 0 ? last : a.first_name.localeCompare(b.first_name);
      });
      setRental((prev) => (prev ? { ...prev, assigned_personnel: nextAssignments } : prev));
      toast.success('Affectations mises a jour');
      recordActivity('personnel_assignments_updated', 'Affectations personnel mises a jour.');
      if (toAdd.length || toRemove.length) {
        await invalidateQuoteAfterChange('Devis annulé : affectations modifiées.');
      }
    } catch (err) {
      console.error('save personnel assignments', err);
      toast.error('Sauvegarde des affectations impossible');
    } finally {
      setSavingPersonnelAssignments(false);
    }
  };

  const savePersonnelServices = async () => {
    if (!rental) return;
    const missingService = personnelServiceRows.some((row) => !row.service_record_id);
    if (missingService) {
      toast.error('Selectionnez un service pour chaque ligne.');
      return;
    }
    setSavingPersonnelServices(true);
    try {
      const { data: current, error } = await supabase
        .from('rental_personnel_services')
        .select('id')
        .eq('rental_id', rental.id);
      if (error) throw error;
      const currentIds = new Set((current || []).map((row: any) => row.id));
      const nextIds = new Set(personnelServiceRows.filter((row) => row.id).map((row) => row.id as string));
      const toDelete = Array.from(currentIds).filter((id) => !nextIds.has(id));
      if (toDelete.length) {
        await supabase.from('rental_personnel_services').delete().in('id', toDelete);
      }

      const nextServices = [];
      for (const row of personnelServiceRows) {
        if (!row.service_record_id) continue;
        const payload = {
          rental_id: rental.id,
          service_record_id: row.service_record_id,
          quantity: parsePositiveInt(String(row.quantity), 1),
          days: parsePositiveInt(String(row.days), 1, rentalDays),
          discount_percent: clampPercent(row.discount_percent || 0),
        };
        if (row.id && currentIds.has(row.id)) {
          await supabase.from('rental_personnel_services').update(payload).eq('id', row.id);
          nextServices.push({ id: row.id, ...payload });
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('rental_personnel_services')
            .insert([payload])
            .select('id')
            .single();
          if (insErr) throw insErr;
          const nextId = inserted?.id || row.id;
          if (nextId) {
            row.id = nextId;
          }
          nextServices.push({ id: nextId || row.id, ...payload });
        }
      }

      const nextPersonnelServices = nextServices.map((row: any) => {
        const service = personnelServiceLookup.get(row.service_record_id);
        return {
          id: row.id,
          service_record_id: row.service_record_id,
          title: service?.title || 'Service',
          cost_per_person: service?.cost_per_person ?? null,
          quantity: row.quantity,
          days: row.days,
          discount_percent: row.discount_percent ?? 0,
        };
      });
      setPersonnelServiceRows(nextPersonnelServices.map((service) => ({
        id: service.id,
        service_record_id: service.service_record_id,
        quantity: service.quantity,
        days: service.days,
        discount_percent: service.discount_percent ?? 0,
      })));
      const servicesTotal = nextPersonnelServices.reduce((sum, service) => {
        const unit = Number(service.cost_per_person || 0);
        const safeUnit = Number.isFinite(unit) ? unit : 0;
        const discount = clampPercent(service.discount_percent || 0);
        return sum + safeUnit * Number(service.quantity || 0) * Number(service.days || 0) * (1 - discount / 100);
      }, 0);
      const baseTotal = equipmentSubtotal + maintenanceSubtotal + deliverySubtotal + servicesTotal + insuranceServicesTotal + otherServicesTotal;
      const discount = rental.discount_type === 'percentage'
        ? baseTotal * ((rental.discount_value || 0) / 100)
        : (rental.discount_value || 0);
      const nextTotal = Math.max(0, baseTotal - (discount || 0));

      await supabase.from('rentals').update({ total_price: Number(nextTotal.toFixed(2)) }).eq('id', rental.id);

      setRental((prev) => (prev ? {
        ...prev,
        personnel_services: nextPersonnelServices,
        total_price: Number(nextTotal.toFixed(2)),
      } : prev));
      toast.success('Services de personnel mis a jour');
      recordActivity('personnel_services_updated', 'Services de personnel mis a jour.');
      await invalidateQuoteAfterChange('Devis annulé : services de personnel modifiés.');
    } catch (err) {
      console.error('save personnel services', err);
      toast.error('Sauvegarde des services impossible');
    } finally {
      setSavingPersonnelServices(false);
    }
  };

  const saveInsuranceServices = async () => {
    if (!rental) return;
    const missingService = insuranceServiceRows.some((row) => !row.service_record_id);
    if (missingService) {
      toast.error('Selectionnez une assurance pour chaque ligne.');
      return;
    }
    setSavingInsuranceServices(true);
    try {
      const { data: current, error } = await supabase
        .from('rental_insurance_services')
        .select('id')
        .eq('rental_id', rental.id);
      if (error) throw error;
      const currentIds = new Set((current || []).map((row: any) => row.id));
      const nextIds = new Set(insuranceServiceRows.filter((row) => row.id).map((row) => row.id as string));
      const toDelete = Array.from(currentIds).filter((id) => !nextIds.has(id));
      if (toDelete.length) {
        await supabase.from('rental_insurance_services').delete().in('id', toDelete);
      }

      const nextServices = [];
      for (const row of insuranceServiceRows) {
        if (!row.service_record_id) continue;
        const payload = {
          rental_id: rental.id,
          service_record_id: row.service_record_id,
          days: parsePositiveInt(String(row.days), 1, rentalDays),
        };
        if (row.id && currentIds.has(row.id)) {
          await supabase.from('rental_insurance_services').update(payload).eq('id', row.id);
          nextServices.push({ id: row.id, ...payload });
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('rental_insurance_services')
            .insert([payload])
            .select('id')
            .single();
          if (insErr) throw insErr;
          const nextId = inserted?.id || row.id;
          if (nextId) {
            row.id = nextId;
          }
          nextServices.push({ id: nextId || row.id, ...payload });
        }
      }

      const nextInsuranceServices = nextServices.map((row: any) => {
        const service = insuranceServiceLookup.get(row.service_record_id);
        return {
          id: row.id,
          service_record_id: row.service_record_id,
          title: service?.title || 'Assurance',
          amount_per_day: service?.amount_per_day ?? null,
          days: row.days,
        };
      });
      setInsuranceServiceRows(nextInsuranceServices.map((service) => ({
        id: service.id,
        service_record_id: service.service_record_id,
        days: service.days,
      })));
      const servicesTotal = nextInsuranceServices.reduce((sum, service) => {
        const unit = Number(service.amount_per_day || 0);
        const safeUnit = Number.isFinite(unit) ? unit : 0;
        return sum + safeUnit * Number(service.days || 0);
      }, 0);
      const baseTotal = equipmentSubtotal + maintenanceSubtotal + deliverySubtotal + personnelServicesTotal + servicesTotal + otherServicesTotal;
      const discount = rental.discount_type === 'percentage'
        ? baseTotal * ((rental.discount_value || 0) / 100)
        : (rental.discount_value || 0);
      const nextTotal = Math.max(0, baseTotal - (discount || 0));

      await supabase.from('rentals').update({ total_price: Number(nextTotal.toFixed(2)) }).eq('id', rental.id);

      setRental((prev) => (prev ? {
        ...prev,
        insurance_services: nextInsuranceServices,
        total_price: Number(nextTotal.toFixed(2)),
      } : prev));
      toast.success('Assurances mises a jour');
      recordActivity('insurance_services_updated', 'Assurances mises a jour.');
      await invalidateQuoteAfterChange('Devis annulé : assurances modifiées.');
    } catch (err) {
      console.error('save insurance services', err);
      toast.error('Sauvegarde des assurances impossible');
    } finally {
      setSavingInsuranceServices(false);
    }
  };

  const saveOtherServices = async () => {
    if (!rental) return;
    const missingService = otherServiceRows.some((row) => !row.service_record_id);
    if (missingService) {
      toast.error('Selectionnez un service pour chaque ligne.');
      return;
    }
    setSavingOtherServices(true);
    try {
      const { data: current, error } = await supabase
        .from('rental_other_services')
        .select('id')
        .eq('rental_id', rental.id);
      if (error) throw error;
      const currentIds = new Set((current || []).map((row: any) => row.id));
      const nextIds = new Set(otherServiceRows.filter((row) => row.id).map((row) => row.id as string));
      const toDelete = Array.from(currentIds).filter((id) => !nextIds.has(id));
      if (toDelete.length) {
        await supabase.from('rental_other_services').delete().in('id', toDelete);
      }

      const nextServices = [];
      for (const row of otherServiceRows) {
        if (!row.service_record_id) continue;
        const payload = {
          rental_id: rental.id,
          service_record_id: row.service_record_id,
          quantity: parsePositiveInt(String(row.quantity), 1),
          days: parsePositiveInt(String(row.days), 1, rentalDays),
        };
        if (row.id && currentIds.has(row.id)) {
          await supabase.from('rental_other_services').update(payload).eq('id', row.id);
          nextServices.push({ id: row.id, ...payload });
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('rental_other_services')
            .insert([payload])
            .select('id')
            .single();
          if (insErr) throw insErr;
          const nextId = inserted?.id || row.id;
          if (nextId) {
            row.id = nextId;
          }
          nextServices.push({ id: nextId || row.id, ...payload });
        }
      }

      const nextOtherServices = nextServices.map((row: any) => {
        const service = otherServiceLookup.get(row.service_record_id);
        return {
          id: row.id,
          service_record_id: row.service_record_id,
          title: service?.title || 'Service',
          price: service?.price ?? null,
          quantity: row.quantity,
          days: row.days,
        };
      });
      setOtherServiceRows(nextOtherServices.map((service) => ({
        id: service.id,
        service_record_id: service.service_record_id,
        quantity: service.quantity,
        days: service.days,
      })));
      const servicesTotal = nextOtherServices.reduce((sum, service) => {
        const unit = Number(service.price || 0);
        const safeUnit = Number.isFinite(unit) ? unit : 0;
        return sum + safeUnit * Number(service.quantity || 0) * Number(service.days || 0);
      }, 0);
      const baseTotal = equipmentSubtotal + maintenanceSubtotal + deliverySubtotal + personnelServicesTotal + insuranceServicesTotal + servicesTotal;
      const discount = rental.discount_type === 'percentage'
        ? baseTotal * ((rental.discount_value || 0) / 100)
        : (rental.discount_value || 0);
      const nextTotal = Math.max(0, baseTotal - (discount || 0));

      await supabase.from('rentals').update({ total_price: Number(nextTotal.toFixed(2)) }).eq('id', rental.id);

      setRental((prev) => (prev ? {
        ...prev,
        other_services: nextOtherServices,
        total_price: Number(nextTotal.toFixed(2)),
      } : prev));
      toast.success('Autres services mis a jour');
      recordActivity('other_services_updated', 'Autres services mis a jour.');
      await invalidateQuoteAfterChange('Devis annulé : autres services modifiés.');
    } catch (err) {
      console.error('save other services', err);
      toast.error('Sauvegarde des autres services impossible');
    } finally {
      setSavingOtherServices(false);
    }
  };

  const computeTotalForCoefficient = (items: RentalItem[], coefficientValue: number, deliveryAmount: number) => {
    if (!rental) return 0;
    const itemsSubtotal = computeItemsSubtotal(items, coefficientValue);
    const base = itemsSubtotal + maintenanceSubtotal + deliveryAmount + personnelServicesTotal + insuranceServicesTotal + otherServicesTotal;
    const discount = rental.discount_type === 'percentage'
      ? base * ((rental.discount_value || 0) / 100)
      : (rental.discount_value || 0);
    return Math.max(0, base - (discount || 0));
  };

  const computeTotalWithDelivery = (deliveryAmount: number) => {
    if (!rental) return 0;
    const base = equipmentSubtotal + maintenanceSubtotal + deliveryAmount + personnelServicesTotal + insuranceServicesTotal + otherServicesTotal;
    const discount = rental.discount_type === 'percentage'
      ? base * ((rental.discount_value || 0) / 100)
      : (rental.discount_value || 0);
    return Math.max(0, base - discount);
  };

  const handleSaveDeliveryOffer = async () => {
    if (!rental || !selectedDeliveryOffer) return;
    if (selectedDeliveryOffer.pricing_type !== 'fixed' && resolvedDeliveryQuantity <= 0) {
      toast.error('Renseignez une quantité valide pour la livraison.');
      return;
    }
    setSavingDeliveryOffer(true);
    try {
      const totalAmount = Number(deliveryDraftTotal.toFixed(2));
      const updates: Partial<Rental> = {
        delivery_offer_id: selectedDeliveryOffer.id,
        delivery_offer_name: selectedDeliveryOffer.name,
        delivery_pricing_type: selectedDeliveryOffer.pricing_type,
        delivery_rate_amount: Number(selectedDeliveryOffer.rate_amount || 0),
        delivery_base_amount: Number(selectedDeliveryOffer.base_amount || 0),
        delivery_quantity: resolvedDeliveryQuantity,
        delivery_round_trip: deliveryTripType === 'round_trip',
        delivery_total_amount: totalAmount,
        total_price: Number(computeTotalWithDelivery(totalAmount).toFixed(2)),
      };

      const { error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id);
      if (error) throw error;
      setRental({ ...rental, ...updates } as Rental);
      toast.success('Forfait livraison mis à jour');
      recordActivity('delivery_offer_updated', `Forfait livraison : ${selectedDeliveryOffer.name}.`, {
        offer_id: selectedDeliveryOffer.id,
        total: totalAmount,
      });
      await invalidateQuoteAfterChange('Devis annulé : forfait livraison modifié.', { offer_id: selectedDeliveryOffer.id });
    } catch (err) {
      console.error('save delivery offer', err);
      toast.error("Impossible d'enregistrer le forfait");
    } finally {
      setSavingDeliveryOffer(false);
    }
  };

  const handleClearDeliveryOffer = async () => {
    if (!rental) return;
    setSavingDeliveryOffer(true);
    try {
      const updates: Partial<Rental> = {
        delivery_offer_id: null,
        delivery_offer_name: null,
        delivery_pricing_type: null,
        delivery_rate_amount: null,
        delivery_base_amount: null,
        delivery_quantity: null,
        delivery_round_trip: null,
        delivery_total_amount: null,
        total_price: Number(computeTotalWithDelivery(0).toFixed(2)),
      };
      const { error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id);
      if (error) throw error;
      setRental({ ...rental, ...updates } as Rental);
      setDeliveryOfferId('');
      setDeliveryQuantityInput('');
      setDeliveryTripType('one_way');
      toast.success('Forfait livraison supprimé');
      recordActivity('delivery_offer_cleared', 'Forfait livraison supprimé.');
      await invalidateQuoteAfterChange('Devis annulé : forfait livraison supprimé.');
    } catch (err) {
      console.error('clear delivery offer', err);
      toast.error("Impossible de supprimer le forfait");
    } finally {
      setSavingDeliveryOffer(false);
    }
  };

  const handleOpenPaymentModal = () => {
    if (!rental) return;
    if (!canRecordPayment) {
      toast(`Cette ${formatRentalTypeLower(rental?.type)} est déjà réglée.`);
      return;
    }
    const suggested = isFreeRental ? 0 : Math.max(0, remainingAmount);
    setPaymentAmount(isFreeRental ? '0' : (suggested > 0 ? suggested.toFixed(2) : ''));
    setPaymentError(null);
    setShowPaymentModal(true);
  };

  const handleClosePaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentAmount('');
    setPaymentError(null);
  };

  const handleRecordPayment = async () => {
    if (!rental) return;
    const amountValue = parseLocalizedNumber(paymentAmount);
    const numericAmount = Number.isFinite(amountValue) ? amountValue : 0;
    if (!isFreeRental && numericAmount <= 0) {
      setPaymentError('Veuillez saisir un montant supérieur à 0.');
      return;
    }
    if (!canRecordPayment) {
      setPaymentError('Tout est déjà réglé.');
      return;
    }
    if (!isFreeRental && numericAmount > remainingAmount + 0.009) {
      setPaymentError('Le montant ne peut pas dépasser le reste à payer.');
      return;
    }

    setSavingPayment(true);
    setPaymentError(null);

    const clampedAmount = isFreeRental ? 0 : Math.min(numericAmount, remainingAmount);
    const roundedAmount = Math.round(clampedAmount * 100) / 100;
    const willSettleRental = isFreeRental ? true : totalPaid + roundedAmount + 0.009 >= totalTTC;
    const isDeposit = !isFreeRental && !willSettleRental && !isRentalReturned;
    const updates: Record<string, any> = {};
    if (willSettleRental && rental.status !== 'paid') {
      updates.status = 'paid';
    }

    try {
      const paymentDate = new Date().toISOString().slice(0, 10);
      const generatedRef = `PAY-${new Date().getTime()}`;

      const insertPayload = {
        rental_id: rental.id,
        invoice_id: linkedInvoiceId || null,
        amount: roundedAmount,
        payment_method: isFreeRental ? 'Gratuit' : 'Paiement direct',
        payment_date: paymentDate,
        reference: generatedRef,
        status: 'completed',
        payment_type: isDeposit ? 'deposit' : 'payment',
      };

      const { data: inserted, error: insertError } = await supabase
        .from('payments')
        .insert([insertPayload])
        .select('id, amount, payment_method, payment_date, reference, status, invoice_id, payment_type')
        .single();
      if (insertError) throw insertError;

      /* Sync invoice totals: create allocation so DB trigger recomputes paid_amount/balance_due/status */
      if (linkedInvoiceId && roundedAmount > 0) {
        await (supabase as any)
          .from('invoice_payment_allocations')
          .insert([{ invoice_id: linkedInvoiceId, payment_id: inserted.id, amount: roundedAmount }]);
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('rentals')
          .update(updates)
          .eq('id', rental.id);
        if (error) throw error;
        setRental({ ...rental, ...updates } as any);
      }

      setPaymentHistory(prev => [mapPaymentRow(inserted), ...prev]);
      const successMessage = isFreeRental
        ? `${formatRentalType(rental?.type)} gratuite validée`
        : isDeposit
          ? 'Acompte enregistré'
          : willSettleRental
            ? `${formatRentalType(rental?.type)} marquée comme payée`
            : 'Paiement partiel enregistré';
      recordActivity('payment_recorded', successMessage, {
        amount: roundedAmount,
        method: insertPayload.payment_method,
        payment_type: insertPayload.payment_type,
      });
      toast.success(successMessage);
      handleClosePaymentModal();
    } catch (err) {
      console.error(err);
      toast.error("Impossible d'enregistrer le paiement");
    } finally {
      setSavingPayment(false);
    }
  };


  return (
    <div className="space-y-6">
      {isService ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                to="/rentals"
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft className="h-6 w-6" />
              </Link>
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: serviceColor }}
                />
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">{heading}</h1>
                  {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
                </div>
              </div>
              <StatusBadge tone={statusBadgeInfo.tone}>
                {statusBadgeInfo.label}
              </StatusBadge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleServicePrimaryAction}
                disabled={primaryButtonDisabled || isSavingOverlayVisible}
                className={isEditing
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-300'}
              >
                {isEditing ? (
                  <>
                    <Save className="h-4 w-4" /> Enregistrer
                  </>
                ) : (
                  <>
                    <Edit className="h-4 w-4" /> Modifier
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={handleDeleteService}
                variant="secondary"
                className="bg-rose-50 text-rose-700 hover:bg-rose-100 focus:ring-rose-200"
              >
                <Trash2 className="h-4 w-4" /> Supprimer
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <RentalHeader
          rental={rental}
          onEdit={handleRentalEditToggle}
          isEditing={isEditing}
          showDecisionButtons={false}
          onAcceptPending={handleAcceptService}
          onRejectPending={handleRefuseService}
          showMarkPaidButton={false}
          onMarkPaid={handleOpenPaymentModal}
          markPaidDisabled={!rental || !canRecordPayment}
          onOpenFileExplorer={() => setShowFileExplorer(true)}
        />
      )}

      <div className="border-b border-gray-200 px-4 sm:px-6">
        <div className="relative">
          {tabsOverflow && (
            <>
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scrollTabsBy(-240)}
                  className="absolute left-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:text-gray-700"
                  aria-label="Voir les onglets précédents"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scrollTabsBy(240)}
                  className="absolute right-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:text-gray-700"
                  aria-label="Voir les onglets suivants"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          <nav
            ref={tabsContainerRef}
            onScroll={updateTabsScrollState}
            className="-mb-px flex items-center space-x-6 sm:space-x-8 overflow-x-auto scroll-smooth no-scrollbar"
          >
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
                  } flex items-center whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <StepTransition stepKey={activeTab} direction={tabDirection}>
        {activeTab === 'general' && renderGeneralTab()}

        {activeTab !== 'general' && (
          <div className="rounded-lg">
        {activeTab === 'equipment' && (
          <div className="flex gap-4 p-4 bg-gray-50/40 dark:bg-gray-900/40" style={{ height: 'calc(100vh - 260px)', minHeight: '420px' }}>
            {/* Left: equipment catalog browser (edit mode only) */}
            {isEditing && (
              <div className="w-60 xl:w-72 flex-shrink-0 flex flex-col bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 flex-shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Catalogue</span>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <EquipmentCatalogPanel
                    existingItems={rental.items}
                    onAdd={(eq) => handleAddItem(eq, 1, null)}
                    onRemoveItem={handleRemoveItem}
                    onRemoveGroup={handleRemoveGroup}
                    groups={rental.item_groups}
                    startDate={rental.usage_start_date || rental.start_date}
                    endDate={rental.usage_end_date || rental.end_date}
                    skipAvailability={rental.type === 'sale'}
                  />
                </div>
              </div>
            )}
            {/* Right: project equipment list */}
            <div className="flex-1 min-w-0 overflow-auto">
              <RentalEquipmentList
                items={rental.items}
                groups={rental.item_groups || []}
                onQuantityChange={handleQuantityChange}
                onDiscountChange={handleDiscountChange}
                onRemoveItem={handleRemoveItem}
                onSplitItem={isEditing ? handleSplitItem : undefined}
                onAddItem={handleAddItem}
                onAddExternalItem={handleAddExternalItem}
                onAddGroup={isEditing ? handleAddGroup : undefined}
                onRenameGroup={isEditing ? handleRenameGroup : undefined}
                onAutoGroup={isEditing ? handleAutoCreateGroups : undefined}
                onGroupColorChange={isEditing ? handleGroupColorChange : undefined}
                onRemoveGroup={isEditing ? handleRemoveGroup : undefined}
                onMoveGroup={isEditing ? handleMoveGroup : undefined}
                onMoveItem={isEditing ? handleMoveItem : undefined}
                readonly={!isEditing}
                startDate={rental.usage_start_date || rental.start_date}
                endDate={rental.usage_end_date || rental.end_date}
                persisted={true}
                externalTabLabel={rental.type === 'sale' ? 'Achat matériel' : undefined}
                skipAvailability={rental.type === 'sale'}
                coefficient={effectiveCoefficient}
              />
            </div>
          </div>
        )}

          {activeTab === 'delivery' && (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
              <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
                {/* Adresse de livraison */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Adresse de livraison</div>
                      <div className="text-xs text-gray-500">Adresse précise où le matériel doit être livré.</div>
                    </div>
                    {!isEditing && rental.delivery_address && (
                      <span className="text-xs text-gray-400">{rental.delivery_address}</span>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <AddressSearchInput
                        id="rental-delivery-address-edit"
                        value={deliveryAddressEdit}
                        onChange={setDeliveryAddressEdit}
                        onSelect={setDeliveryAddressEdit}
                        placeholder="Ex : 12 rue de la Paix, 75001 Paris"
                        emptyLabel="Aucune suggestion"
                        loadingLabel="Recherche…"
                      />
                      <div className="flex items-center gap-2">
                        {(() => {
                          const clientDefault = clients.find(c => c.id === rental.client_id)?.default_delivery_address;
                          return clientDefault ? (
                            <button
                              type="button"
                              onClick={() => setDeliveryAddressEdit(clientDefault)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition"
                            >
                              Pré-remplir depuis le client
                            </button>
                          ) : null;
                        })()}
                        <button
                          type="button"
                          onClick={saveDeliveryAddress}
                          disabled={savingDeliveryAddress}
                          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                          {savingDeliveryAddress ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                      {rental.delivery_address || <span className="text-gray-400 italic">Non renseignée</span>}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100" />

                {deliverySummaryLabel && (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                    <div className="text-sm font-medium text-gray-900">Forfait livraison</div>
                    <div className="text-sm text-gray-700">{deliverySummaryLabel}</div>
                    <div className="text-sm text-gray-700">Montant : {formatMoney(deliverySubtotal)}</div>
                  </div>
                )}
                {isEditing && (
                  <div className="rounded-md border border-gray-200 bg-white p-4 space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Forfait livraison</div>
                        <div className="text-xs text-gray-500">Ajoutez ou modifiez une offre de transport.</div>
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {deliveryDraftTotal > 0 ? `Total : ${formatMoney(deliveryDraftTotal)}` : 'Aucun forfait'}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Offre</label>
                        <select
                          value={deliveryOfferId}
                          onChange={(e) => setDeliveryOfferId(e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                          disabled={deliveryOffersLoading}
                        >
                          <option value="">Aucune offre</option>
                          {activeDeliveryOffers.map((offer) => (
                            <option key={offer.id} value={offer.id}>
                              {offer.name}
                            </option>
                          ))}
                        </select>
                        {!deliveryOffersLoading && activeDeliveryOffers.length === 0 && (
                          <p className="mt-1 text-xs text-gray-500">Aucune offre active disponible.</p>
                        )}
                      </div>
                      {deliveryQuantityMeta.show && (
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">{deliveryQuantityMeta.label}</label>
                          <input
                            type="number"
                            min={0}
                            step={deliveryQuantityMeta.step}
                            value={deliveryQuantityInput}
                            onChange={(e) => setDeliveryQuantityInput(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                          />
                        </div>
                      )}
                      {deliveryOfferId && (
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Trajet</label>
                          <select
                            value={deliveryTripType}
                            onChange={(e) => setDeliveryTripType(e.target.value as 'one_way' | 'round_trip')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                          >
                            <option value="one_way">Aller simple</option>
                            <option value="round_trip">Aller + retour</option>
                          </select>
                        </div>
                      )}
                      {selectedDeliveryOffer && (
                        <div className="md:col-span-2 text-sm text-gray-600">
                          {deliveryPricingDetails}
                          {selectedDeliveryOffer.description && (
                            <div className="text-xs text-gray-500 mt-1">{selectedDeliveryOffer.description}</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleClearDeliveryOffer}
                        disabled={savingDeliveryOffer || (!deliveryOfferId && !rental.delivery_offer_id)}
                        className="px-3 py-2 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Supprimer le forfait
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveDeliveryOffer}
                        disabled={savingDeliveryOffer || !deliveryOfferId}
                        className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingDeliveryOffer ? 'Enregistrement…' : 'Enregistrer le forfait'}
                      </button>
                    </div>
                  </div>
                )}
                {loadingDelivery ? (
                  <div className="text-sm text-gray-500">Chargement...</div>
                ) : (
                  <>
                  {!isEditing ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Véhicule</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Livraison</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">RDV</th>
                            {showReturnDeliveryColumns && (
                              <>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Retour livraison</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">RDV retour</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {deliveryRows.length === 0 && (
                            <tr>
                              <td className="px-3 py-4 text-sm text-gray-500" colSpan={showReturnDeliveryColumns ? 5 : 3}>
                                Aucune affectation
                              </td>
                            </tr>
                          )}
                          {deliveryRows.map((row) => {
                            const v = vehicles.find(x => x.id === row.vehicle_id);
                            return (
                              <tr key={row.id || row.vehicle_id}>
                                <td className="px-3 py-2 text-sm">{v ? `${v.name} — ${v.license_plate}` : row.vehicle_id}</td>
                                <td className="px-3 py-2 text-sm">{row.delivery_at ? new Date(row.delivery_at).toLocaleString() : '-'}</td>
                                <td className="px-3 py-2 text-sm">{row.appointment_at ? new Date(row.appointment_at).toLocaleString() : '-'}</td>
                                {showReturnDeliveryColumns && (
                                  <>
                                    <td className="px-3 py-2 text-sm">{row.return_delivery_at ? new Date(row.return_delivery_at).toLocaleString() : '-'}</td>
                                    <td className="px-3 py-2 text-sm">{row.return_appointment_at ? new Date(row.return_appointment_at).toLocaleString() : '-'}</td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Véhicule</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Livraison</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">RDV</th>
                              {showReturnDeliveryColumns && (
                                <>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Retour livraison</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">RDV retour</th>
                                </>
                              )}
                              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {deliveryRows.map((row) => (
                              <tr key={row.id || row.vehicle_id}>
                                <td className="px-3 py-2">
                                  <select
                                    value={row.vehicle_id}
                                    onChange={(e) => setDeliveryRows(prev => prev.map(r => r === row ? { ...r, vehicle_id: e.target.value } : r))}
                                    className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
                                  >
                                    <option value="">— Sélectionner —</option>
                                    {vehicles.map(v => (
                                      <option key={v.id} value={v.id}>{v.name} — {v.license_plate}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="datetime-local"
                                    value={row.delivery_at || ''}
                                    onChange={(e) => setDeliveryRows(prev => prev.map(r => r === row ? { ...r, delivery_at: e.target.value } : r))}
                                    className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="datetime-local"
                                    value={row.appointment_at || ''}
                                    onChange={(e) => setDeliveryRows(prev => prev.map(r => r === row ? { ...r, appointment_at: e.target.value } : r))}
                                    className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
                                  />
                                </td>
                                {showReturnDeliveryColumns && (
                                  <>
                                    <td className="px-3 py-2">
                                      <input
                                        type="datetime-local"
                                        value={row.return_delivery_at || ''}
                                        onChange={(e) => setDeliveryRows(prev => prev.map(r => r === row ? { ...r, return_delivery_at: e.target.value } : r))}
                                        className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="datetime-local"
                                        value={row.return_appointment_at || ''}
                                        onChange={(e) => setDeliveryRows(prev => prev.map(r => r === row ? { ...r, return_appointment_at: e.target.value } : r))}
                                        className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
                                      />
                                    </td>
                                  </>
                                )}
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setDeliveryRows(prev => prev.filter(r => r !== row))}
                                    className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    Retirer
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {deliveryRows.length === 0 && (
                              <tr>
                                <td className="px-3 py-4 text-sm text-gray-500" colSpan={showReturnDeliveryColumns ? 6 : 4}>Aucun véhicule ajouté</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm"
                          onClick={() => setDeliveryRows(prev => [...prev, { vehicle_id: '' }])}
                        >
                          Ajouter un véhicule
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm"
                          onClick={saveDelivery}
                        >
                          Enregistrer
                        </button>
                      </div>
                    </>
                  )}
                  </>
                )}
              </div>
              </div>
              <div className="lg:col-span-2 flex flex-col gap-3">
                <DeliveryMapView address={rental?.delivery_address || rental?.location || ''} />
                <DeliveryDistanceCard companyAddress={settings?.address ?? ''} deliveryAddress={rental?.delivery_address || rental?.location || ''} />
              </div>
            </div>
          </div>
          )}

          {activeTab === 'crew' && rental && (
            <RentalCrewPanel rental={rental} />
          )}

          {activeTab === 'personnel' && (
            <div className="p-6 space-y-6">
              <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">Affectation interne</div>
                  <div className="text-xs text-gray-500">Personnel affecté à la prestation.</div>
                </div>
                {isEditing ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-auto border rounded p-2">
                      {personnelList.map((person) => (
                        <label key={person.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={personnelAssignmentIds.includes(person.id)}
                            onChange={(event) => {
                              setPersonnelAssignmentIds((prev) =>
                                event.target.checked
                                  ? [...prev, person.id]
                                  : prev.filter((id) => id !== person.id)
                              );
                            }}
                          />
                          <span>{person.first_name} {person.last_name}</span>
                        </label>
                      ))}
                      {!personnelLoading && personnelList.length === 0 && (
                        <div className="text-xs text-gray-500">Aucun membre du personnel disponible.</div>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={savePersonnelAssignments}
                        disabled={savingPersonnelAssignments || personnelLoading}
                        className="px-3 py-1.5 text-sm"
                      >
                        {savingPersonnelAssignments ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Intervenant</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {personnelAssignments.map((person) => (
                          <tr key={person.id}>
                            <td className="px-3 py-2 text-sm">
                              {person.first_name} {person.last_name}
                            </td>
                          </tr>
                        ))}
                        {personnelAssignments.length === 0 && (
                          <tr>
                            <td className="px-3 py-4 text-sm text-gray-500">Aucune affectation</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">Services de personnel</div>
                  <div className="text-xs text-gray-500">Services de personnel liés à la prestation.</div>
                </div>
                {isEditing ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-500">
                        Jours max: {rentalDays}
                      </div>
                      <Button type="button" className="px-3 py-1.5 text-sm" onClick={addPersonnelServiceRow}>
                        Ajouter un service
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Service</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Quantité</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Jours</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Remise %</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Coût/personne</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {personnelServiceRows.map((row) => {
                            const linkedService = personnelServiceLookup.get(row.service_record_id);
                            const unit = linkedService?.cost_per_person != null ? Number(linkedService.cost_per_person) : null;
                            const unitValue = unit != null && Number.isFinite(unit) ? unit : null;
                            const discount = clampPercent(row.discount_percent || 0);
                            const total = unitValue != null
                              ? unitValue * row.quantity * row.days * (1 - discount / 100)
                              : null;
                            return (
                              <tr key={row.id}>
                                <td className="px-3 py-2">
                                  <Select
                                    value={row.service_record_id}
                                    onChange={(event) => updatePersonnelServiceRow(row.id!, { service_record_id: event.target.value })}
                                    disabled={servicesLoading}
                                  >
                                    <option value="">
                                      {servicesLoading ? 'Chargement...' : 'Choisir un service'}
                                    </option>
                                    {personnelServiceOptions.map((service) => (
                                      <option key={service.id} value={service.id}>
                                        {service.title}
                                      </option>
                                    ))}
                                  </Select>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={row.quantity}
                                    onChange={(event) =>
                                      updatePersonnelServiceRow(
                                        row.id!,
                                        { quantity: parsePositiveInt(event.target.value, row.quantity || 1) }
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={rentalDays}
                                    step={1}
                                    value={row.days}
                                    onChange={(event) =>
                                      updatePersonnelServiceRow(
                                        row.id!,
                                        { days: parsePositiveInt(event.target.value, row.days || 1, rentalDays) }
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={row.discount_percent}
                                    onChange={(event) =>
                                      updatePersonnelServiceRow(
                                        row.id!,
                                        { discount_percent: clampPercent(event.target.value, row.discount_percent || 0) }
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {unitValue != null ? formatMoney(unitValue) : '—'}
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {total != null ? formatMoney(total) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removePersonnelServiceRow(row.id!)}
                                    className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    Retirer
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {personnelServiceRows.length === 0 && (
                            <tr>
                              <td className="px-3 py-4 text-sm text-gray-500" colSpan={7}>
                                Aucun service de personnel.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={savePersonnelServices}
                        disabled={savingPersonnelServices || servicesLoading}
                        className="px-3 py-1.5 text-sm"
                      >
                        {savingPersonnelServices ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Service</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Quantité</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Jours</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Remise</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Coût/personne</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {personnelServices.map((service) => {
                          const unit = service.cost_per_person != null ? Number(service.cost_per_person) : null;
                          const unitValue = unit != null && Number.isFinite(unit) ? unit : null;
                          const discount = clampPercent(service.discount_percent || 0);
                          const total = unitValue != null
                            ? unitValue * service.quantity * service.days * (1 - discount / 100)
                            : null;
                          return (
                            <tr key={service.id}>
                              <td className="px-3 py-2 text-sm">{service.title}</td>
                              <td className="px-3 py-2 text-sm">{service.quantity}</td>
                              <td className="px-3 py-2 text-sm">{service.days}</td>
                              <td className="px-3 py-2 text-sm">{discount > 0 ? `${discount}%` : '—'}</td>
                              <td className="px-3 py-2 text-sm">
                                {unitValue != null ? formatMoney(unitValue) : '—'}
                              </td>
                              <td className="px-3 py-2 text-sm">
                                {total != null ? formatMoney(total) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                        {personnelServices.length === 0 && (
                          <tr>
                            <td className="px-3 py-4 text-sm text-gray-500" colSpan={6}>
                              Aucun service de personnel.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'insurance' && (
            <div className="p-6 space-y-6">
              <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">Affectation assurance</div>
                  <div className="text-xs text-gray-500">Assurances liées au projet.</div>
                </div>
                {isEditing ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-500">
                        Jours max: {rentalDays}
                      </div>
                      <Button type="button" className="px-3 py-1.5 text-sm" onClick={addInsuranceServiceRow}>
                        Ajouter une assurance
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Assurance</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Jours</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Montant/jour</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {insuranceServiceRows.map((row) => {
                            const linkedService = insuranceServiceLookup.get(row.service_record_id);
                            const unit = linkedService?.amount_per_day != null ? Number(linkedService.amount_per_day) : null;
                            const unitValue = unit != null && Number.isFinite(unit) ? unit : null;
                            const total = unitValue != null
                              ? unitValue * row.days
                              : null;
                            return (
                              <tr key={row.id}>
                                <td className="px-3 py-2">
                                  <Select
                                    value={row.service_record_id}
                                    onChange={(event) => updateInsuranceServiceRow(row.id!, { service_record_id: event.target.value })}
                                    disabled={servicesLoading}
                                  >
                                    <option value="">
                                      {servicesLoading ? 'Chargement...' : 'Choisir une assurance'}
                                    </option>
                                    {insuranceServiceOptions.map((service) => (
                                      <option key={service.id} value={service.id}>
                                        {service.title}
                                      </option>
                                    ))}
                                  </Select>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={rentalDays}
                                    step={1}
                                    value={row.days}
                                    onChange={(event) =>
                                      updateInsuranceServiceRow(
                                        row.id!,
                                        { days: parsePositiveInt(event.target.value, row.days || 1, rentalDays) }
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {unitValue != null ? formatMoney(unitValue) : '—'}
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {total != null ? formatMoney(total) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeInsuranceServiceRow(row.id!)}
                                    className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    Retirer
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {insuranceServiceRows.length === 0 && (
                            <tr>
                              <td className="px-3 py-4 text-sm text-gray-500" colSpan={5}>
                                Aucune assurance.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={saveInsuranceServices}
                        disabled={savingInsuranceServices || servicesLoading}
                        className="px-3 py-1.5 text-sm"
                      >
                        {savingInsuranceServices ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Assurance</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Jours</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Montant/jour</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {insuranceServices.map((service) => {
                          const unit = service.amount_per_day != null ? Number(service.amount_per_day) : null;
                          const unitValue = unit != null && Number.isFinite(unit) ? unit : null;
                          const total = unitValue != null
                            ? unitValue * service.days
                            : null;
                          return (
                            <tr key={service.id}>
                              <td className="px-3 py-2 text-sm">{service.title}</td>
                              <td className="px-3 py-2 text-sm">{service.days}</td>
                              <td className="px-3 py-2 text-sm">
                                {unitValue != null ? formatMoney(unitValue) : '—'}
                              </td>
                              <td className="px-3 py-2 text-sm">
                                {total != null ? formatMoney(total) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                        {insuranceServices.length === 0 && (
                          <tr>
                            <td className="px-3 py-4 text-sm text-gray-500" colSpan={4}>
                              Aucune assurance.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'other' && (
            <div className="p-6 space-y-6">
              <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">Autres services</div>
                  <div className="text-xs text-gray-500">Services complémentaires liés au projet.</div>
                </div>
                {isEditing ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-500">
                        Jours max: {rentalDays}
                      </div>
                      <Button type="button" className="px-3 py-1.5 text-sm" onClick={addOtherServiceRow}>
                        Ajouter un service
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Service</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Quantité</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Jours</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Prix</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {otherServiceRows.map((row) => {
                            const linkedService = otherServiceLookup.get(row.service_record_id);
                            const unit = linkedService?.price != null ? Number(linkedService.price) : null;
                            const unitValue = unit != null && Number.isFinite(unit) ? unit : null;
                            const total = unitValue != null
                              ? unitValue * row.quantity * row.days
                              : null;
                            return (
                              <tr key={row.id}>
                                <td className="px-3 py-2">
                                  <Select
                                    value={row.service_record_id}
                                    onChange={(event) => updateOtherServiceRow(row.id!, { service_record_id: event.target.value })}
                                    disabled={servicesLoading}
                                  >
                                    <option value="">
                                      {servicesLoading ? 'Chargement...' : 'Choisir un service'}
                                    </option>
                                    {otherServiceOptions.map((service) => (
                                      <option key={service.id} value={service.id}>
                                        {service.title}
                                      </option>
                                    ))}
                                  </Select>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={row.quantity}
                                    onChange={(event) =>
                                      updateOtherServiceRow(
                                        row.id!,
                                        { quantity: parsePositiveInt(event.target.value, row.quantity || 1) }
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={rentalDays}
                                    step={1}
                                    value={row.days}
                                    onChange={(event) =>
                                      updateOtherServiceRow(
                                        row.id!,
                                        { days: parsePositiveInt(event.target.value, row.days || 1, rentalDays) }
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {unitValue != null ? formatMoney(unitValue) : '—'}
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {total != null ? formatMoney(total) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeOtherServiceRow(row.id!)}
                                    className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    Retirer
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {otherServiceRows.length === 0 && (
                            <tr>
                              <td className="px-3 py-4 text-sm text-gray-500" colSpan={6}>
                                Aucun service.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={saveOtherServices}
                        disabled={savingOtherServices || servicesLoading}
                        className="px-3 py-1.5 text-sm"
                      >
                        {savingOtherServices ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Service</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Quantité</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Jours</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Prix</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {otherServices.map((service) => {
                          const unit = service.price != null ? Number(service.price) : null;
                          const unitValue = unit != null && Number.isFinite(unit) ? unit : null;
                          const total = unitValue != null
                            ? unitValue * service.quantity * service.days
                            : null;
                          return (
                            <tr key={service.id}>
                              <td className="px-3 py-2 text-sm">{service.title}</td>
                              <td className="px-3 py-2 text-sm">{service.quantity}</td>
                              <td className="px-3 py-2 text-sm">{service.days}</td>
                              <td className="px-3 py-2 text-sm">
                                {unitValue != null ? formatMoney(unitValue) : '—'}
                              </td>
                              <td className="px-3 py-2 text-sm">
                                {total != null ? formatMoney(total) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                        {otherServices.length === 0 && (
                          <tr>
                            <td className="px-3 py-4 text-sm text-gray-500" colSpan={5}>
                              Aucun service.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'milestones' && (
            <div className="p-6">
              <RentalMilestonesPanel rental={rental} onLog={recordActivity} />
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="p-6">
              <RentalTasksPanel rental={rental} onLog={recordActivity} />
            </div>
          )}

          {activeTab === 'financial' && (
            <div className="p-6 space-y-6">
              {/* Coefficient card (moved here from equipment tab) */}
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Coefficient de location</div>
                      {hasCoefficientOverride && (
                        <StatusBadge tone="orange" size="sm" className="font-semibold">Personnalisé</StatusBadge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>Durée : <strong>{rentalDays} j</strong></span>
                      <span>Mode société : <strong>{companyCoefficientLabel}</strong></span>
                      <span>Défaut : <strong>{defaultCoefficientLabel}</strong></span>
                      <span>Appliqué : <strong>{effectiveCoefficientLabel}</strong></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={coefficientInput}
                      onChange={(event) => { setCoefficientInput(event.target.value); setCoefficientDirty(true); }}
                      disabled={!isEditing || coefficientSaving}
                      placeholder="Coefficient"
                      className="w-28 rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-right focus:border-blue-500 focus:outline-none disabled:bg-gray-100 dark:disabled:bg-gray-800 dark:bg-gray-800 dark:text-gray-200"
                    />
                    {isEditing && (
                      <>
                        <button
                          type="button"
                          onClick={handleSaveCoefficientOverride}
                          disabled={coefficientSaving || !coefficientInput.trim()}
                          className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                          {coefficientSaving ? '…' : 'Appliquer'}
                        </button>
                        {hasCoefficientOverride && (
                          <button
                            type="button"
                            onClick={handleResetCoefficientOverride}
                            disabled={coefficientSaving}
                            className="px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                          >
                            Réinitialiser
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Détail financier</h3>
                    <div className="mt-4 space-y-3 text-sm">
                      {deliverySubtotal > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>Livraison</span>
                          <span className="font-medium text-gray-900">{formatMoney(deliverySubtotal)}</span>
                        </div>
                      )}
                      {insuranceServicesTotal > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>Assurance</span>
                          <span className="font-medium text-gray-900">{formatMoney(insuranceServicesTotal)}</span>
                        </div>
                      )}
                      {otherServicesTotal > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>Autres services</span>
                          <span className="font-medium text-gray-900">{formatMoney(otherServicesTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Sous-total</span>
                        <span className="font-medium text-gray-900">{formatMoney(subtotal)}</span>
                      </div>
                      {discountValue ? (
                        <div className="flex justify-between text-red-600">
                          <span>Remise ({rental.discount_type === 'percentage' ? `${rental.discount_value}%` : `${rental.discount_value}€`})</span>
                          <span className="font-medium">-{formatMoney(discountValue)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between border-t border-gray-100 pt-3">
                        <span className="text-base font-semibold text-gray-900">Total</span>
                        <span className="text-base font-bold text-gray-900">{formatMoney(totalTTC)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Wrench className="h-4 w-4" /> Maintenance / SAV sur facture
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowAddMaintenance(prev => !prev)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {showAddMaintenance ? 'Fermer' : 'Ajouter'}
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {maintenanceCharges.length === 0 && !showAddMaintenance && (
                        <p className="text-sm text-gray-500">Aucune maintenance ajoutée à la facture.</p>
                      )}
                      {maintenanceCharges.map(charge => (
                        <div key={charge.id} className="flex items-start justify-between rounded-lg border border-white/60 bg-white px-3 py-2 shadow-sm">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{charge.label}</p>
                            {charge.maintenance_title && (
                              <p className="text-xs text-gray-500">{charge.maintenance_title} • {charge.maintenance_status || '—'}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-gray-900">{formatMoney(Number(charge.amount || 0))}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveMaintenanceCharge(charge.id)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {showAddMaintenance && (
                      <div className="mt-4 space-y-3 rounded-lg bg-white p-4 shadow-sm">
                        <div>
                          <label className="text-xs text-gray-600">Sélectionner une maintenance</label>
                          <select
                            value={selectedMaintenanceId}
                            onChange={(e) => {
                              const value = e.target.value;
                              setSelectedMaintenanceId(value);
                              const option = maintenanceOptions.find(opt => opt.id === value);
                              if (option) {
                                setMaintenanceLabel(option.title || 'Maintenance');
                                setMaintenanceAmount(option.cost != null ? option.cost.toString() : '');
                              }
                            }}
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          >
                            <option value="">-- Saisie manuelle --</option>
                            {maintenanceOptions.map(opt => (
                              <option key={opt.id} value={opt.id}>
                                {opt.title} {opt.equipment_name ? `• ${opt.equipment_name}` : ''} ({opt.status})
                              </option>
                            ))}
                          </select>
                          {loadingMaintenanceOptions && (
                            <p className="text-xs text-gray-500 mt-1">Chargement des maintenances…</p>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Libellé</label>
                          <input
                            value={maintenanceLabel}
                            onChange={(e) => setMaintenanceLabel(e.target.value)}
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            placeholder="Ex: SAV caméra"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Montant</label>
                          <input
                            type="number"
                            step="0.01"
                            value={maintenanceAmount}
                            onChange={(e) => setMaintenanceAmount(e.target.value)}
                            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddMaintenance(false);
                              setSelectedMaintenanceId('');
                              setMaintenanceLabel('');
                              setMaintenanceAmount('');
                            }}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={handleAddMaintenanceCharge}
                            disabled={addingMaintenance}
                            className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {addingMaintenance ? 'Ajout…' : 'Ajouter'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Gestion financière</h3>
                  <InvoiceFinancialPanel
                    invoiceId={linkedInvoiceId}
                    rentalId={rental?.id ?? null}
                    totalTTC={totalTTC}
                    clientEmail={rental?.client_email ?? null}
                    clientName={rental?.client_name ?? null}
                    invoiceNumber={rental?.reference_code ?? null}
                    onPaymentChange={() => {
                      /* refresh payment history so existing totals stay in sync */
                      (supabase as any)
                        .from('payments')
                        .select('id, amount, payment_method, payment_date, reference, status, invoice_id, payment_type')
                        .eq('rental_id', rental?.id)
                        .order('payment_date', { ascending: false, nullsFirst: false })
                        .then(({ data }: { data: any[] | null }) => {
                          setPaymentHistory((data || []).map(mapPaymentRow));
                        });
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'client' && (
            <div className="p-6">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Historique client — {rental.client_name}</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Équipement
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Montant
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Statut
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {loadingClientHistory ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-sm text-gray-500">
                            Chargement de l'historique…
                          </td>
                        </tr>
                      ) : clientHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-sm text-gray-500">
                            Aucun projet précédent pour ce client.
                          </td>
                        </tr>
                      ) : (
                        clientHistory.map((item) => {
                          const typeLabelDisplay = item.type === 'service'
                            ? 'Prestation'
                            : item.type === 'sale'
                              ? 'Vente'
                              : 'Location';
                          const statusLabelDisplay = getRentalStatusLabel(item.status);
                          const badgeTone = getRentalStatusTone(item.status);
                          const amountDisplay = Number.isFinite(item.amount)
                            ? `${item.amount.toFixed(2)}€`
                            : '—';
                          const dateDisplay = item.date ? new Date(item.date).toLocaleDateString() : '—';
                          return (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{dateDisplay}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{typeLabelDisplay}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {item.reference ? `${item.reference} • ${item.equipment}` : item.equipment}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{amountDisplay}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <StatusBadge tone={badgeTone}>
                                  {statusLabelDisplay}
                                </StatusBadge>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="p-6">
              <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Documents</h3>
                    <p className="text-sm text-gray-500">{`Générez, visualisez et exportez les documents liés à la ${typeLabelLower}.`}</p>
                  </div>
                  <button
                    onClick={() => setShowDocModal(true)}
                    className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Générer un document
                  </button>
                </div>
                {allModificationRequests.length > 0 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-700 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700">
                      <Edit className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                      <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">Demandes de modification</span>
                      {allModificationRequests.filter((r) => !r.modification_seen_at).length > 0 && (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                          {allModificationRequests.filter((r) => !r.modification_seen_at).length}
                        </span>
                      )}
                      {allModificationRequests.some((r) => !r.modification_seen_at) && (
                        <button
                          onClick={async () => {
                            const ids = allModificationRequests.filter((r) => !r.modification_seen_at).map((r) => r.id);
                            const seenAt = new Date().toISOString();
                            await supabase.from('rental_document_requests').update({ modification_seen_at: seenAt }).in('id', ids);
                            setAllModificationRequests((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, modification_seen_at: seenAt } : r));
                            setPendingModificationRequests([]);
                          }}
                          className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          Marquer comme vu
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-amber-100 dark:divide-amber-800/40">
                      {allModificationRequests.map((req) => {
                        const isUnread = !req.modification_seen_at;
                        const fromClient = Boolean(req.signer_name || req.recipient_name);
                        const author = req.signer_name || req.recipient_name || 'Interne';
                        return (
                          <div key={req.id} className={`px-4 py-3 ${isUnread ? 'bg-amber-50/60 dark:bg-amber-900/20' : 'bg-white dark:bg-gray-900'}`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5">
                                {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />}
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{author}</span>
                                {fromClient && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">via email</span>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                                {new Date(req.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            {req.modification_comment ? (
                              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{req.modification_comment}</p>
                            ) : (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic">Aucun commentaire.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1 space-y-2">
                    <h4 className="text-sm font-medium text-gray-700">Liste des documents</h4>
                    <div className={`overflow-auto rounded-lg bg-gray-50 divide-y divide-gray-200 shadow-sm ${docs.length > 0 ? 'max-h-[520px]' : 'max-h-72'}`}>
                      {docs.length === 0 && (
                        <div className="p-3 text-sm text-gray-500">Aucun document</div>
                      )}
                      {docs.map(d => {
                        const docTitle = docTitleMap.get(d.id) || d.title;
                        return (
                          <button
                            key={d.id}
                            onClick={() => setActiveDocId(d.id)}
                            className={`w-full text-left p-3 transition-colors ${activeDocId === d.id ? 'bg-white shadow-inner' : 'hover:bg-white/70'}`}
                          >
                            <div className="text-sm font-medium text-gray-900">{docTitle}</div>
                            <div className="text-xs text-gray-500">{d.doc_type} • {new Date(d.created_at).toLocaleDateString()}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-700">Aperçu</h4>
                      {activeDocId && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              const doc = docs.find(d => d.id === activeDocId);
                              if (!doc) return;
                              const docTitle = docTitleMap.get(doc.id) || doc.title;
                              if (!window.confirm('Supprimer ce document ?')) return;
                              try {
                                const { error } = await supabase.from('rental_documents').delete().eq('id', doc.id);
                                if (error) throw error;
                                const remaining = docs.filter(d => d.id !== doc.id);
                                setDocs(remaining);
                                setActiveDocId(remaining.length ? remaining[0].id : null);
                                toast.success('Document supprimé');
                                recordActivity('document_deleted', `Document supprimé : ${docTitle}`, { doc_type: doc.doc_type });
                              } catch (e) {
                                console.error(e);
                                toast.error('Suppression impossible');
                              }
                            }}
                            className="px-2 py-1 text-xs rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            Supprimer
                          </button>
                          {(() => {
                            const doc = docs.find(d => d.id === activeDocId);
                            if (!doc) return null;
                            const docTitle = docTitleMap.get(doc.id) || doc.title;
                            const downloadName = `${sanitizeFilename(docTitle)}.pdf`;
                            const basePreviewUrl = activeDocPreviewUrl || doc.file_url;
                            const previewUrl = activeDocPreviewUrl
                              ? withFilenameFragment(basePreviewUrl, downloadName)
                              : basePreviewUrl;
                          return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = basePreviewUrl;
                                    link.download = downloadName;
                                    document.body.appendChild(link);
                                    link.click();
                                    link.remove();
                                  }}
                                  className="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                                >
                                  Télécharger
                                </button>
                                {doc.doc_type !== 'bon_prepa' && (
                                  <button
                                    type="button"
                                    onClick={() => openSendDocumentModal(doc)}
                                    disabled={Boolean(sendingDocId)}
                                    title="Envoyer par email"
                                    className="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  >
                                    {sendingDocId === doc.id ? 'Envoi...' : 'Envoyer'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openDocShareModal(doc)}
                                  className="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                                >
                                  Partager
                                </button>
                                <a
                                  href={previewUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                                >
                                  Ouvrir
                                </a>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <div className={`rounded-lg bg-gray-50 shadow-sm ${docs.length > 0 ? 'min-h-[520px] md:min-h-[620px]' : ''}`}>
                      {activeDocId ? (
                        (() => {
                          const doc = docs.find(d => d.id === activeDocId);
                          if (!doc) return <div className="p-4 text-sm text-gray-500">Aucun document sélectionné</div>;
                          const docTitle = docTitleMap.get(doc.id) || doc.title;
                          const downloadName = `${sanitizeFilename(docTitle)}.pdf`;
                          const basePreviewUrl = activeDocPreviewUrl || doc.file_url;
                          const previewUrl = activeDocPreviewUrl
                            ? withFilenameFragment(basePreviewUrl, downloadName)
                            : basePreviewUrl;
                          return (
                            <iframe
                              src={previewUrl}
                              title={docTitleMap.get(doc.id) || doc.title}
                              className={`w-full border-0 rounded-lg ${docs.length > 0 ? 'h-[520px] md:h-[620px]' : 'h-96'}`}
                            />
                          );
                        })()
                      ) : (
                        <div className="p-4 text-sm text-gray-500">Sélectionnez un document pour l'afficher</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'dossier' && (
            <div ref={dossierContainerRef} className="p-6 relative">
              <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
                <div className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-3 space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-md border border-blue-100 bg-blue-50 flex items-center justify-center">
                        <Folder className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Dossier</h3>
                        <p className="text-xs text-slate-500">Explorateur de fichiers</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDossierBack}
                        disabled={!dossierFolderId}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border shadow-sm bg-white text-slate-700 border-slate-300 hover:bg-slate-50 ${dossierFolderId ? '' : 'opacity-50 cursor-not-allowed'}`}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Retour
                      </button>
                      <button
                        type="button"
                        onClick={() => openDossierNameModal('create')}
                        disabled={dossierCreating}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border shadow-sm bg-white text-slate-700 border-slate-300 hover:bg-slate-50 ${dossierCreating ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <FolderPlus className="h-4 w-4" />
                        Nouveau dossier
                      </button>
                      <button
                        type="button"
                        onClick={() => dossierFileInputRef.current?.click()}
                        disabled={dossierUploading}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border shadow-sm text-white bg-blue-600 border-blue-600 hover:bg-blue-700 ${dossierUploading ? 'opacity-60 cursor-not-allowed hover:bg-blue-600' : ''}`}
                      >
                        <Upload className="h-4 w-4" />
                        {dossierUploading ? 'Import...' : 'Importer'}
                      </button>
                      <button
                        type="button"
                        onClick={openDossierShareModal}
                        disabled={!rental}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border shadow-sm bg-white text-slate-700 border-slate-300 hover:bg-slate-50 ${!rental ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Share2 className="h-4 w-4" />
                        Partager
                      </button>
                      <input
                        ref={dossierFileInputRef}
                        type="file"
                        multiple
                        onChange={handleUploadDossierFiles}
                        className="hidden"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Home className="h-4 w-4" />
                      <button
                        type="button"
                        onClick={() => setDossierFolderId(null)}
                        className="font-semibold text-slate-800 hover:underline"
                      >
                        Dossier
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {dossierPathSegments.length === 0 ? (
                        <>
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-500">Racine</span>
                        </>
                      ) : (
                        dossierPathSegments.map((segment, index) => {
                          const isCurrent = index === dossierPathSegments.length - 1;
                          return (
                            <div key={segment.id} className="flex items-center gap-2">
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                              {isCurrent ? (
                                <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-800">
                                  {segment.name}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setDossierFolderId(segment.id)}
                                  className="rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                                >
                                  {segment.name}
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
                {dossierError && (
                  <div className="border-b border-slate-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {dossierError}
                  </div>
                )}
                <div className="flex flex-col lg:flex-row">
                  <aside
                    className="lg:w-64 border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r"
                    onContextMenu={(event) => openDossierContextMenu(event, null)}
                  >
                    <div className="px-3 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dossiers</div>
                    </div>
                    <div className="px-2 pb-3 space-y-1 max-h-[520px] overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => setDossierFolderId(null)}
                        onContextMenu={(event) => openDossierContextMenu(event, null)}
                        className={`w-full flex items-center gap-2 rounded-md px-2 py-1 text-sm ${!dossierFolderId ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
                      >
                        <Home className={`h-4 w-4 ${!dossierFolderId ? 'text-blue-600' : 'text-slate-500'}`} />
                        <span className="truncate">Racine</span>
                      </button>
                      {renderDossierTree(null, 0)}
                      {dossierEntries.filter((entry) => entry.entry_type === 'folder').length === 0 && (
                        <div className="px-2 py-3 text-xs text-slate-500">Aucun dossier</div>
                      )}
                    </div>
                  </aside>
                  <div className="flex-1 px-4 py-3">
                    <div className="rounded-md border border-slate-200 bg-white">
                      <div
                        className="px-3 py-3"
                        onContextMenu={(event) => openDossierContextMenu(event, null)}
                        onClick={(event) => {
                          if (event.target === event.currentTarget) {
                            setDossierSelectedEntryIds([]);
                            setDossierSelectionAnchorId(null);
                          }
                        }}
                      >
                        {dossierLoading ? (
                          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            Chargement du dossier…
                          </div>
                        ) : dossierEntriesInView.length === 0 ? (
                          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            Aucun élément dans ce dossier.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                            {dossierEntriesInView.map((entry) => {
                              const isFolder = entry.entry_type === 'folder';
                              const fileLabel = entry.name;
                              const isSelected = dossierSelectedSet.has(entry.id);
                              const isCut = dossierClipboard?.mode === 'cut' && dossierClipboard.entryId === entry.id;
                              const containerStyle = getEntryContainerStyle(entry);
                              const iconStyle = getEntryIconStyle(entry);
                              const FolderIcon = resolveFolderIcon(entry);
                              const toneClass = getEntryToneClass(entry);
                              return (
                                <div
                                  key={entry.id}
                                  role="button"
                                  tabIndex={0}
                                  title={fileLabel}
                                  onClick={(event) => handleDossierSelect(entry, event)}
                                  onDoubleClick={() => {
                                    if (isFolder) {
                                      setDossierFolderId(entry.id);
                                      return;
                                    }
                                    if (isPreviewableEntry(entry)) {
                                      handlePreviewDossierEntry(entry);
                                    }
                                  }}
                                  onContextMenu={(event) => openDossierContextMenu(event, entry.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' && isFolder) {
                                      event.preventDefault();
                                      setDossierFolderId(entry.id);
                                    }
                                  }}
                                  className={`group flex flex-col items-center gap-2 rounded-md border px-2 py-3 text-center transition ${isSelected ? 'border-blue-300 bg-blue-50/60' : 'border-transparent hover:bg-slate-50'} ${isCut ? 'opacity-60' : ''}`}
                                >
                                  <div
                                    className={`h-14 w-14 rounded-md flex items-center justify-center border ${toneClass}`}
                                    style={containerStyle}
                                  >
                                    {isFolder ? <FolderIcon className="h-7 w-7" style={iconStyle} /> : <FileText className="h-7 w-7" style={iconStyle} />}
                                  </div>
                                  <div className="text-[11px] text-slate-700 leading-snug max-w-[96px] h-8 overflow-hidden break-words">
                                    {fileLabel}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                        <span>{dossierEntriesInView.length} élément{dossierEntriesInView.length > 1 ? 's' : ''}</span>
                        <span>{dossierCurrentFolder ? dossierCurrentFolder.name : 'Racine'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {dossierContextMenu && (
                <div
                  className="absolute z-50 w-56 rounded-md border border-slate-200 bg-white shadow-lg"
                  style={{ left: dossierContextMenu.x, top: dossierContextMenu.y }}
                  onClick={(event) => event.stopPropagation()}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <div className="py-1 text-sm">
                    {dossierContextEntry ? (
                      <>
                        {dossierContextEntry.entry_type === 'folder' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setDossierContextMenu(null);
                                setDossierFolderId(dossierContextEntry.id);
                              }}
                              className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                            >
                              Ouvrir
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDossierContextMenu(null);
                                handleDownloadDossierZip(dossierContextEntry);
                              }}
                              disabled={Boolean(dossierZippingId)}
                              className={`w-full px-3 py-2 text-left ${dossierZippingId ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-100'}`}
                            >
                              Télécharger en .zip
                            </button>
                          </>
                        ) : (
                          <>
                            {isPreviewableEntry(dossierContextEntry) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDossierContextMenu(null);
                                  handlePreviewDossierEntry(dossierContextEntry);
                                }}
                                className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                              >
                                Aperçu
                              </button>
                            )}
                            {dossierContextEntry.file_url && (
                              <a
                                href={dossierContextEntry.file_url}
                                download={dossierContextEntry.name || undefined}
                                onClick={() => setDossierContextMenu(null)}
                                className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                              >
                                Télécharger
                              </a>
                            )}
                          </>
                        )}
                        <div className="my-1 border-t border-slate-200" />
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            openDossierNameModal('edit', dossierContextEntry);
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            handleDuplicateDossierEntry(dossierContextEntry);
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Dupliquer
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            handleCopyDossierEntry(dossierContextEntry);
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Copier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            handleCutDossierEntry(dossierContextEntry);
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Couper
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            handlePasteDossierEntry(dossierPasteTargetId ?? null);
                          }}
                          disabled={!dossierHasClipboard}
                          className={`w-full px-3 py-2 text-left ${dossierHasClipboard ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`}
                        >
                          Coller
                        </button>
                        <div className="my-1 border-t border-slate-200" />
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            handleShowDossierInfo(dossierContextEntry);
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Voir les infos
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            handleDeleteDossierEntry(dossierContextEntry);
                          }}
                          className="w-full px-3 py-2 text-left text-rose-700 hover:bg-rose-50"
                        >
                          Supprimer
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            handlePasteDossierEntry(dossierFolderId);
                          }}
                          disabled={!dossierHasClipboard}
                          className={`w-full px-3 py-2 text-left ${dossierHasClipboard ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`}
                        >
                          Coller
                        </button>
                        <div className="my-1 border-t border-slate-200" />
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            openDossierNameModal('create');
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Nouveau dossier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDossierContextMenu(null);
                            dossierFileInputRef.current?.click();
                          }}
                          className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100"
                        >
                          Importer
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {dossierPreviewEntry && dossierPreviewEntry.file_url && createPortal((
                <div className="fixed inset-0 z-[12048] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/60"
                    onClick={() => setDossierPreviewEntryId(null)}
                  />
                  <div className="relative w-full max-w-4xl rounded-lg bg-white shadow-lg overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-9 w-9 rounded-md flex items-center justify-center border ${getEntryToneClass(dossierPreviewEntry)}`}
                          style={getEntryContainerStyle(dossierPreviewEntry)}
                        >
                          <FileText className="h-4 w-4" style={getEntryIconStyle(dossierPreviewEntry)} />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">{dossierPreviewEntry.name}</h3>
                          <p className="text-xs text-slate-500">Aperçu</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDossierPreviewEntryId(null)}
                        className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Fermer
                      </button>
                    </div>
                    <div className="bg-slate-900/5 p-4">
                      {isImageEntry(dossierPreviewEntry) ? (
                        <div className="flex items-center justify-center max-h-[70vh] overflow-auto">
                          <img
                            src={dossierPreviewEntry.file_url}
                            alt={dossierPreviewEntry.name}
                            className="max-h-[68vh] max-w-full rounded-md shadow"
                          />
                        </div>
                      ) : (
                        <iframe
                          title={`Aperçu ${dossierPreviewEntry.name}`}
                          src={dossierPreviewEntry.file_url}
                          className="w-full h-[70vh] rounded-md border border-slate-200 bg-white"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ), document.body)}
              {dossierInfoEntry && createPortal((
                <div className="fixed inset-0 z-[12048] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => setDossierInfoEntryId(null)}
                  />
                  <div className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-10 w-10 rounded-md flex items-center justify-center border ${getEntryToneClass(dossierInfoEntry)}`}
                        style={getEntryContainerStyle(dossierInfoEntry)}
                      >
                        {dossierInfoEntry.entry_type === 'folder' ? (
                          (() => {
                            const FolderIcon = resolveFolderIcon(dossierInfoEntry);
                            return <FolderIcon className="h-5 w-5" style={getEntryIconStyle(dossierInfoEntry)} />;
                          })()
                        ) : (
                          <FileText className="h-5 w-5" style={getEntryIconStyle(dossierInfoEntry)} />
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Informations</h3>
                        <p className="text-xs text-slate-500">{dossierInfoEntry.entry_type === 'folder' ? 'Dossier' : 'Fichier'}</p>
                      </div>
                    </div>
                    <dl className="mt-4 space-y-2 text-sm text-slate-600">
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Nom</dt>
                        <dd className="text-right text-slate-800 break-words">{dossierInfoEntry.name}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Type</dt>
                        <dd className="text-right text-slate-800">{dossierTypeLabel(dossierInfoEntry)}</dd>
                      </div>
                      {dossierInfoEntry.entry_type === 'file' && (
                        <div className="flex items-start justify-between gap-4">
                          <dt className="text-slate-500">Taille</dt>
                          <dd className="text-right text-slate-800">{formatFileSize(dossierInfoEntry.file_size)}</dd>
                        </div>
                      )}
                      {dossierInfoEntry.entry_type === 'file' && dossierInfoEntry.file_type && (
                        <div className="flex items-start justify-between gap-4">
                          <dt className="text-slate-500">Mime</dt>
                          <dd className="text-right text-slate-800">{dossierInfoEntry.file_type}</dd>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Couleur</dt>
                        <dd className="text-right text-slate-800">
                          {dossierInfoEntry.color ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: dossierInfoEntry.color }} />
                              {dossierInfoEntry.color}
                            </span>
                          ) : (
                            'Par defaut'
                          )}
                        </dd>
                      </div>
                      {dossierInfoEntry.entry_type === 'folder' && (
                        <div className="flex items-start justify-between gap-4">
                          <dt className="text-slate-500">Icône</dt>
                          <dd className="text-right text-slate-800">{resolveFolderIconLabel(dossierInfoEntry.icon)}</dd>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Ajouté le</dt>
                        <dd className="text-right text-slate-800">{new Date(dossierInfoEntry.created_at).toLocaleDateString()}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">ID</dt>
                        <dd className="text-right text-slate-800 break-words">{dossierInfoEntry.id}</dd>
                      </div>
                    </dl>
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setDossierInfoEntryId(null)}
                        className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Fermer
                      </button>
                    </div>
                  </div>
                </div>
              ), document.body)}
              {dossierNameModalOpen && createPortal((
                <div className="fixed inset-0 z-[12048] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => !dossierNameModalSaving && closeDossierNameModal()}
                  />
                  <div className="relative w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {dossierNameModalMode === 'create' ? 'Nouveau dossier' : 'Modifier'}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {dossierNameModalMode === 'create'
                        ? 'Saisissez le nom du dossier.'
                        : "Modifiez le nom, la couleur et l'icone."}
                    </p>
                    <div className="mt-4">
                      <Input
                        ref={dossierNameInputRef}
                        value={dossierNameModalValue}
                        onChange={(event) => setDossierNameModalValue(event.target.value)}
                        placeholder={dossierNameModalMode === 'create' ? 'Nom du dossier' : 'Nom'}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleConfirmDossierNameModal();
                          }
                        }}
                      />
                    </div>
                    <div className="mt-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Couleur</p>
                      <div className="mt-2 flex items-center gap-3">
                        <ColorPickerButton
                          value={dossierNameModalColor}
                          onChange={(value) => {
                            setDossierNameModalColor(value);
                            setDossierNameModalColorDirty(true);
                          }}
                          size="md"
                          ariaLabel="Choisir une couleur"
                        />
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: dossierNameModalColor }} />
                          <span>Couleur appliquee</span>
                        </div>
                      </div>
                    </div>
                    {(dossierNameModalMode === 'create' || dossierNameModalEntry?.entry_type === 'folder') && (
                      <div className="mt-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Icone</p>
                        <div className="mt-2 grid grid-cols-4 gap-2">
                          {DOSSIER_ICON_OPTIONS.map((option) => {
                            const isSelected = dossierNameModalIcon === option.id;
                            const iconStyle = normalizeHexColor(dossierNameModalColor)
                              ? {
                                color: dossierNameModalColor,
                                backgroundColor: withHexAlpha(dossierNameModalColor, '1a') ?? undefined,
                                borderColor: withHexAlpha(dossierNameModalColor, '33') ?? dossierNameModalColor,
                              }
                              : undefined;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setDossierNameModalIcon(option.id)}
                                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs ${isSelected ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                title={option.label}
                              >
                                <div className="h-8 w-8 rounded-md border flex items-center justify-center" style={iconStyle}>
                                  <option.Icon className="h-4 w-4" />
                                </div>
                                <span className="truncate w-full">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={closeDossierNameModal}
                        disabled={dossierNameModalSaving}
                        className={`px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 ${dossierNameModalSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDossierNameModal}
                        disabled={dossierNameModalSaving}
                        className={`px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 ${dossierNameModalSaving ? 'opacity-80 cursor-not-allowed hover:bg-blue-600' : ''}`}
                      >
                        {dossierNameModalMode === 'create' ? 'Créer' : 'Enregistrer'}
                      </button>
                    </div>
                  </div>
                </div>
              ), document.body)}
              {dossierShareModalOpen && createPortal((
                <div className="fixed inset-0 z-[12048] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={closeDossierShareModal}
                  />
                  <div className="relative w-full max-w-lg rounded-lg bg-white p-5 shadow-lg">
                    <h3 className="text-lg font-semibold text-slate-900">Partager le dossier</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {`Ce lien donne accès au dossier "${dossierShareTargetLabel}" et à son contenu.`}
                    </p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mode d'accès</p>
                        <Select
                          value={dossierShareAccessMode}
                          onChange={(event) => setDossierShareAccessMode(event.target.value as 'viewer' | 'editor')}
                          className="mt-2"
                        >
                          <option value="viewer">Viewer (lecture seule)</option>
                          <option value="editor">Editeur</option>
                        </Select>
                        <p className="mt-1 text-xs text-slate-400">Le mode viewer permet seulement de voir et télécharger.</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={dossierSharePasswordEnabled}
                            onChange={(event) => {
                              const nextValue = event.target.checked;
                              setDossierSharePasswordEnabled(nextValue);
                              if (nextValue) {
                                setDossierShareWhitelistEnabled(false);
                              }
                              if (!nextValue) {
                                setDossierSharePassword('');
                              }
                              if (dossierShareError) setDossierShareError(null);
                            }}
                            disabled={dossierShareWhitelistEnabled}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                          />
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mot de passe</p>
                        </div>
                        <div className={`mt-2 rounded-md border ${dossierSharePasswordEnabled ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                          <Input
                            type="password"
                            value={dossierSharePassword}
                            onChange={(event) => {
                              setDossierSharePassword(event.target.value);
                              if (dossierShareError) setDossierShareError(null);
                            }}
                            placeholder="Mot de passe"
                            disabled={!dossierSharePasswordEnabled}
                            className="border-0 bg-transparent"
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Activez pour protéger le lien.</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={dossierShareWhitelistEnabled}
                            onChange={(event) => {
                              const nextValue = event.target.checked;
                              setDossierShareWhitelistEnabled(nextValue);
                              if (nextValue) {
                                setDossierSharePasswordEnabled(false);
                                setDossierSharePassword('');
                                void fetchDossierWhitelistEntries();
                              }
                              if (dossierShareError) setDossierShareError(null);
                            }}
                            disabled={dossierSharePasswordEnabled}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                          />
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Whitelist</p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              setDossierWhitelistModalOpen(true);
                              await fetchDossierWhitelistEntries();
                            }}
                            disabled={!dossierShareWhitelistEnabled}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${dossierShareWhitelistEnabled ? 'border-slate-300 text-slate-700 hover:bg-slate-50' : 'border-slate-200 text-slate-400 cursor-not-allowed'}`}
                          >
                            <Share2 className="h-4 w-4" />
                            Gérer la whitelist
                          </button>
                          <span className="text-xs text-slate-500">
                            {dossierWhitelistEntries.length} adresse{dossierWhitelistEntries.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">La whitelist remplace le mot de passe.</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={dossierShareExpiryEnabled}
                            onChange={(event) => {
                              setDossierShareExpiryEnabled(event.target.checked);
                              if (dossierShareError) setDossierShareError(null);
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                          />
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expiration</p>
                        </div>
                        <div className={`mt-2 flex overflow-hidden rounded-md border ${dossierShareExpiryEnabled ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={dossierShareExpiryValue}
                            onChange={(event) => {
                              setDossierShareExpiryValue(event.target.value);
                              if (dossierShareError) setDossierShareError(null);
                            }}
                            disabled={!dossierShareExpiryEnabled}
                            className="w-1/2 bg-transparent px-3 py-2 text-sm text-slate-700 focus:outline-none disabled:cursor-not-allowed"
                            placeholder="Valeur"
                          />
                          <select
                            value={dossierShareExpiryUnit}
                            onChange={(event) => {
                              setDossierShareExpiryUnit(event.target.value as typeof dossierShareExpiryUnit);
                              if (dossierShareError) setDossierShareError(null);
                            }}
                            disabled={!dossierShareExpiryEnabled}
                            className="w-1/2 border-l border-slate-200 bg-transparent px-3 py-2 text-sm text-slate-700 focus:outline-none disabled:cursor-not-allowed"
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Heures</option>
                            <option value="days">Jours</option>
                            <option value="months">Mois</option>
                          </select>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Activez l'expiration et choisissez une durée.</p>
                      </div>
                      {dossierShareLoading && (
                        <div className="text-sm text-slate-500">Génération du lien en cours…</div>
                      )}
                      {dossierShareError && (
                        <div className="text-sm text-rose-600">{dossierShareError}</div>
                      )}
                      {dossierShareLink && (
                        <>
                          <div className="flex items-center gap-2">
                            <Input
                              ref={dossierShareInputRef}
                              value={dossierShareLink}
                              onFocus={(event) => event.target.select()}
                              readOnly
                            />
                            <button
                              type="button"
                              onClick={handleCopyDossierShareLink}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Copy className="h-4 w-4" />
                              Copier
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => window.open(dossierShareLink, '_blank', 'noopener')}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Ouvrir
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={createDossierShareLink}
                          disabled={dossierShareLoading}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 ${dossierShareLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <Share2 className="h-4 w-4" />
                          {dossierShareLink ? 'Nouveau lien' : 'Créer un lien'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setDossierShareListOpen(true);
                            await fetchDossierShareList();
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Share2 className="h-4 w-4" />
                          Voir les liens existants
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={closeDossierShareModal}
                        className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Fermer
                      </button>
                    </div>
                  </div>
                </div>
              ), document.body)}
              {dossierShareListOpen && createPortal((
                <div className="fixed inset-0 z-[12050] flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative w-full max-w-2xl rounded-lg bg-white p-5 shadow-lg">
                    <h3 className="text-lg font-semibold text-slate-900">Liens existants</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Supprimez les liens si vous souhaitez retirer l'accès au dossier.
                    </p>
                    <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                      {dossierShareListLoading && (
                        <div className="text-sm text-slate-500">Chargement des liens…</div>
                      )}
                      {dossierShareListError && (
                        <div className="text-sm text-rose-600">{dossierShareListError}</div>
                      )}
                      {!dossierShareListLoading && !dossierShareListError && dossierShareList.length === 0 && (
                        <div className="text-sm text-slate-500">Aucun lien créé pour le moment.</div>
                      )}
                      {!dossierShareListLoading && !dossierShareListError && dossierShareList.length > 0 && (
                        <div className="space-y-2">
                          {dossierShareList.map((share) => {
                            const rootLabel = share.rootEntryId
                              ? dossierEntryMap.get(share.rootEntryId)?.name || 'Dossier'
                              : 'Dossier complet';
                            const statusLabel = DOSSIER_SHARE_STATUS_LABELS[share.status] || share.status;
                            const statusTone = DOSSIER_SHARE_STATUS_TONES[share.status] || 'slate';
                            const createdLabel = new Date(share.createdAt).toLocaleDateString();
                            const expiresLabel = share.expiresAt
                              ? `Expire le ${new Date(share.expiresAt).toLocaleDateString()}`
                              : 'Sans expiration';
                            const isRevocable = share.status !== 'revoked';
                            return (
                              <div key={share.id} className="rounded-md border border-slate-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-800">{rootLabel}</p>
                                    <p className="text-xs text-slate-500">Créé le {createdLabel}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      Mode {share.accessMode === 'editor' ? 'éditeur' : 'viewer'} · {expiresLabel}
                                      {share.hasPassword ? ' · Protégé' : ''}
                                      {share.whitelistEnabled ? ' · Whitelist' : ''}
                                    </p>
                                  </div>
                                  <StatusBadge tone={statusTone} size="xs" className="font-semibold">
                                    {statusLabel}
                                  </StatusBadge>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyShareLink(share.shareUrl)}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
                                  >
                                    <Copy className="h-3 w-3" />
                                    Copier
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => window.open(share.shareUrl, '_blank', 'noopener')}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Ouvrir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeDossierShare(share.id)}
                                    disabled={!isRevocable}
                                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${isRevocable ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-slate-200 text-slate-400 cursor-not-allowed'}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Supprimer
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setDossierShareListOpen(false)}
                        className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              ), document.body)}
              {dossierWhitelistModalOpen && createPortal((
                <div className="fixed inset-0 z-[12054] flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative w-full max-w-2xl rounded-lg bg-white p-5 shadow-lg">
                    <h3 className="text-lg font-semibold text-slate-900">Whitelist</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Ajoutez des adresses e-mail autorisées à accéder au lien.
                    </p>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            value={dossierWhitelistEmail}
                            onChange={(event) => {
                              setDossierWhitelistEmail(event.target.value);
                              if (dossierWhitelistError) setDossierWhitelistError(null);
                            }}
                            placeholder="email@exemple.com"
                            className="flex-1"
                          />
                          <button
                            type="button"
                            onClick={handleAddWhitelistEntry}
                            disabled={dossierWhitelistSaving}
                            className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm ${dossierWhitelistSaving ? 'border-slate-200 text-slate-400 cursor-not-allowed' : 'border-slate-300 text-slate-700 hover:bg-white'}`}
                          >
                            Ajouter
                          </button>
                        </div>
                        {dossierWhitelistError && (
                          <div className="text-sm text-rose-600">{dossierWhitelistError}</div>
                        )}
                      </div>
                      <div className="space-y-2">
                        {dossierWhitelistLoading && (
                          <div className="text-sm text-slate-500">Chargement de la whitelist…</div>
                        )}
                        {!dossierWhitelistLoading && dossierWhitelistEntries.length === 0 && (
                          <div className="text-sm text-slate-500">Aucune adresse whitelist pour le moment.</div>
                        )}
                        {!dossierWhitelistLoading && dossierWhitelistEntries.length > 0 && (
                          <div className="space-y-2">
                            {dossierWhitelistEntries.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{entry.email}</p>
                                  <p className="text-xs text-slate-500">Ajouté le {new Date(entry.created_at).toLocaleDateString()}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteWhitelistEntry(entry.id)}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-rose-200 text-xs text-rose-700 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Supprimer
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setDossierWhitelistModalOpen(false)}
                        className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              ), document.body)}
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="p-6">
              <div className="bg-white rounded-lg shadow-sm p-6 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Journal</h3>
                    <p className="text-sm text-gray-500">{`Historique des actions sur cette ${typeLabelLower}.`}</p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchActivityLogs}
                    className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                  >
                    Rafraîchir
                  </button>
                </div>
                {activityLogsError && (
                  <div className="text-sm text-red-600">{activityLogsError}</div>
                )}
                {loadingActivityLogs ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="text-sm text-gray-500">Aucun évènement enregistré pour le moment.</div>
                ) : (
                  <ul className="space-y-4">
                    {activityLogs.map((log, index) => {
                      const label = ACTIVITY_LABEL[log.action] || log.action;
                      const tone = ACTIVITY_TONE[log.action] || 'slate';
                      return (
                        <li key={log.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-blue-600' : 'bg-gray-300'}`} />
                            {index !== activityLogs.length - 1 && (
                              <span className="flex-1 w-px bg-gray-200 mt-1" />
                            )}
                          </div>
                          <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                              <span className="font-semibold text-gray-900">{log.actor_name || 'Système'}</span>
                              <StatusBadge tone={tone} size="sm">{label}</StatusBadge>
                              <span className="text-xs text-gray-400">{formatDateTimeDisplay(log.created_at)}</span>
                            </div>
                            {log.details && (
                              <div className="mt-1 text-sm text-gray-600">{log.details}</div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'returns' && (
            <div className="p-6">
              <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:justify-between">
                  <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 md:flex-1">
                    <h3 className="text-sm font-semibold text-orange-800">Suivi du retour</h3>
                    <p className="mt-1 text-sm text-orange-700">
                      Retour validé le {rental.return_info?.completed_at ? new Date(rental.return_info.completed_at).toLocaleString() : '—'}. {missingReturnCount > 0 ? `${missingReturnCount} article(s) manquant(s).` : 'Tous les équipements ont été restitués.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReturnMode('reopen');
                      setShowReturn(true);
                    }}
                    className="inline-flex items-center self-start rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 md:self-center"
                  >
                    Refaire un retour
                  </button>
                </div>
                {missingReturnItems.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-orange-200">
                    <table className="min-w-full divide-y divide-orange-100">
                      <thead className="bg-orange-50/90">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase tracking-wider">Équipement</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase tracking-wider">Attendu</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase tracking-wider">Revenu</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase tracking-wider">Manquant</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-orange-50">
                        {missingReturnItems.map((item) => {
                          const missing = item.expected_quantity - item.returned_quantity;
                          return (
                            <tr key={item.id} className="text-sm text-gray-700">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{item.equipment_name}</div>
                                <div className="text-xs text-gray-500">{item.equipment_type}</div>
                              </td>
                              <td className="px-4 py-3">{item.expected_quantity}</td>
                              <td className="px-4 py-3">{item.returned_quantity}</td>
                              <td className="px-4 py-3 text-orange-700 font-semibold">{missing}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Aucun élément manquant enregistré.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'portal_validation' && rental.portal_request_id && (
            <PortalValidationTab rental={rental} onValidated={() => window.location.reload()} userId={user?.id} />
          )}
          </div>
        )}
      </StepTransition>

      {showCancelModal && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!cancelling) setShowCancelModal(false);
            }}
          />
          <div className="relative w-full max-w-lg mx-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-medium text-gray-900">{`Annuler la ${typeLabelLower}`}</h3>
            <p className="mt-1 text-sm text-gray-600">
              {`Cette action annulera la ${typeLabelLower}. Vous pourrez gérer les paiements existants.`}
            </p>

            <div className="mt-4 space-y-4">
              {hasPayments ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Montant encaissé : <span className="font-semibold">{formatMoney(totalPaid)}</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Gestion des paiements</p>
                    <button
                      type="button"
                      onClick={() => setCancelPaymentMode('keep')}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        cancelPaymentMode === 'keep'
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Conserver les paiements encaissés (acompte ou totalité)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelPaymentMode('refund_full')}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        cancelPaymentMode === 'refund_full'
                          ? 'border-rose-400 bg-rose-50 text-rose-800'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Rembourser la totalité ({formatMoney(totalPaid)})
                    </button>
                    <div className={`rounded-md border px-3 py-2 ${cancelPaymentMode === 'refund_partial' ? 'border-rose-400 bg-rose-50' : 'border-gray-200'}`}>
                      <button
                        type="button"
                        onClick={() => setCancelPaymentMode('refund_partial')}
                        className={`w-full text-left text-sm ${
                          cancelPaymentMode === 'refund_partial' ? 'text-rose-800' : 'text-gray-700'
                        }`}
                      >
                        Rembourser partiellement
                      </button>
                      <div className="mt-2">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={cancelRefundAmount}
                          onChange={(event) => setCancelRefundAmount(event.target.value)}
                          disabled={cancelPaymentMode !== 'refund_partial'}
                          className="w-full"
                          placeholder="Montant à rembourser"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {`Aucun paiement enregistré pour cette ${typeLabelLower}.`}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motif (optionnel)</label>
                <Textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  placeholder="Indiquez un motif ou des précisions..."
                />
              </div>
              {cancelError && (
                <div className="text-sm text-red-600">{cancelError}</div>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                className="bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Fermer
              </Button>
              <Button
                type="button"
                onClick={handleCancelRental}
                disabled={cancelling}
                className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-300"
              >
                {cancelling ? 'Annulation...' : 'Confirmer l\'annulation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRestoreConfirm && (
        <ConfirmDialog
          isOpen={showRestoreConfirm}
          title={`Réactiver la ${typeLabelLower}`}
          message={`Cette action réactive la ${typeLabelLower}. Les paiements et remboursements existants restent dans l'historique.`}
          confirmLabel="Réactiver"
          cancelLabel="Annuler"
          onConfirm={handleRestoreRental}
          onCancel={() => setShowRestoreConfirm(false)}
        />
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={handleClosePaymentModal} />
          <div className="relative w-full max-w-md mx-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-medium text-gray-900">Enregistrer un paiement</h3>
            <p className="mt-1 text-sm text-gray-600">
              Total dû : <span className="font-semibold text-gray-900">{totalTTC.toFixed(2)}€</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Déjà encaissé : <span className="font-semibold text-gray-900">{totalPaid.toFixed(2)}€</span> • Reste à payer :{' '}
              <span className={`font-semibold ${remainingAmount === 0 ? 'text-green-700' : 'text-gray-900'}`}>
                {remainingAmount.toFixed(2)}€
              </span>
            </p>
            {isFreeRental && (
              <p className="mt-2 text-xs text-emerald-600">
                {formatRentalType(rental?.type)} gratuite : validez le paiement pour confirmer la clôture comptable.
              </p>
            )}
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Montant encaissé</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={isFreeRental ? '0' : Math.max(0, remainingAmount).toFixed(2)}
                value={paymentAmount}
                onChange={(e) => {
                  if (isFreeRental) return;
                  const nextValue = e.target.value;
                  setPaymentAmount(nextValue);
                  const numeric = parseLocalizedNumber(nextValue);
                  if (Number.isFinite(numeric) && numeric > remainingAmount + 0.009) {
                    setPaymentError('Le montant ne peut pas dépasser le reste à payer.');
                  } else if (paymentError) {
                    setPaymentError(null);
                  }
                }}
                disabled={isFreeRental}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
                placeholder="0,00"
                autoFocus
              />
              {paymentError && (
                <p className="mt-1 text-xs text-red-600">{paymentError}</p>
              )}
              {!isFreeRental && isPartialPayment && !paymentError && (
                <p className="mt-2 text-xs text-amber-600">
                  {willBeDeposit
                    ? `Le montant saisi sera enregistré comme un acompte. La ${typeLabelLower} restera marquée comme partiellement payée.`
                    : `Le montant saisi est inférieur au reste à payer. La ${typeLabelLower} restera marquée comme partiellement payée.`}
                </p>
              )}
              {!isFreeRental && willSettleAmount && !paymentError && (
                <p className="mt-2 text-xs text-green-600">{`Ce paiement règlera la ${typeLabelLower} en totalité.`}</p>
              )}
              {!isFreeRental && parsedPaymentAmount > 0 && parsedPaymentAmount <= remainingAmount + 0.009 && !paymentError && (
                <p className="mt-2 text-xs text-gray-500">
                  Type de paiement prévu :{' '}
                  <span className="font-semibold">
                    {willBeDeposit ? 'Acompte' : willSettleAmount ? 'Paiement final' : 'Paiement partiel'}
                  </span>
                  .
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                onClick={handleClosePaymentModal}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                disabled={savingPayment}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                disabled={savingPayment}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60"
              >
                {savingPayment ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteOptions && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={deleteBusy ? undefined : () => setShowDeleteOptions(false)} />
          <div className="relative w-full max-w-md mx-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-medium text-gray-900">{`Supprimer la ${typeLabelLower}`}</h3>
            <p className="mt-2 text-sm text-gray-600">
              {`Cette ${typeLabelLower} est déjà payée ou partiellement payée. Choisissez l'action souhaitée.`}
            </p>
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <p>
                <span className="font-medium text-gray-700">Supprimer toute trace</span> : supprime la {typeLabelLower}, les paiements, les documents et l&apos;historique lié.
              </p>
              <p>
                <span className="font-medium text-gray-700">Supprimer visuellement</span> : archive la {typeLabelLower} et la masque de la liste.
              </p>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteOptions(false)}
                disabled={deleteBusy}
                className={`px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 ${deleteBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={archiveService}
                disabled={deleteBusy}
                className={`px-4 py-2 rounded-md text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 inline-flex items-center justify-center gap-2 ${deleteBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {deleteAction === 'archive' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />}
                Supprimer visuellement
              </button>
              <button
                type="button"
                onClick={deleteServiceAllTraces}
                disabled={deleteBusy}
                className={`px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 inline-flex items-center justify-center gap-2 ${deleteBusy ? 'opacity-80 cursor-not-allowed hover:bg-red-600' : ''}`}
              >
                {deleteAction === 'purge' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                Supprimer toute trace
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentGeneratorModal
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
        rental={rental}
        onGenerateDocument={handleGenerateDocument}
      />

      {showSendDocModal && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeSendDocumentModal} />
          <div className="relative w-full max-w-md mx-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-medium text-gray-900">Envoyer le document</h3>
            <p className="mt-1 text-sm text-gray-600">
              {sendDocTarget
                ? `Le document ${docTitleMap.get(sendDocTarget.id) || sendDocTarget.title} sera envoyé en pièce jointe.`
                : 'Le document sera envoyé en pièce jointe.'}
            </p>
            {documentClient?.name && (
              <div className="mt-3 text-xs text-gray-500">Client : {documentClient.name}</div>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Adresse email
                </label>
                <Input
                  type="email"
                  value={sendDocEmail}
                  onChange={(event) => {
                    setSendDocEmail(event.target.value);
                    if (sendDocError) setSendDocError(null);
                  }}
                  placeholder="client@exemple.com"
                  disabled={Boolean(sendingDocId)}
                />
              </div>
              {sendDocError && (
                <div className="text-sm text-red-600">{sendDocError}</div>
              )}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeSendDocumentModal}
                disabled={Boolean(sendingDocId)}
                className={`px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 ${sendingDocId ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmSendDocument}
                disabled={Boolean(sendingDocId)}
                className={`px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 inline-flex items-center justify-center gap-2 ${sendingDocId ? 'opacity-80 cursor-not-allowed hover:bg-blue-600' : ''}`}
              >
                {sendingDocId ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup : modifications non vues (client ou app) */}
      {showModificationPopup && pendingModificationRequests.length > 0 && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModificationPopup} />
          <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl overflow-hidden border border-amber-200 dark:border-amber-700">
            <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-800 flex-shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                  {pendingModificationRequests.length > 1 ? `${pendingModificationRequests.length} demandes de modification` : 'Demande de modification'}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Reçue{pendingModificationRequests.length > 1 ? 's' : ''} sur ce projet</p>
              </div>
              <button onClick={closeModificationPopup} className="ml-auto text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 p-1 rounded">
                <span className="sr-only">Fermer</span>✕
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-72 overflow-y-auto">
              {pendingModificationRequests.map((req) => (
                <div key={req.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {req.signer_name || req.recipient_name || 'Client'}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      · {new Date(req.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {req.modification_comment ? (
                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{req.modification_comment}</p>
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500 italic">Aucun commentaire fourni.</p>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                onClick={closeModificationPopup}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                Compris, marquer comme vu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : envoyer une demande de modification (côté app) */}
      {showSendModificationModal && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !sendingModification && setShowSendModificationModal(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-800 flex-shrink-0">
                <MessageSquarePlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">Demande de modification</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Enregistrer une demande de modification sur ce projet</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description des modifications souhaitées
              </label>
              <textarea
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                rows={4}
                placeholder="Ex : Modifier le tarif du poste X, corriger les dates, ajouter un équipement..."
                value={modificationCommentInput}
                onChange={(e) => setModificationCommentInput(e.target.value)}
                disabled={sendingModification}
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setShowSendModificationModal(false)}
                disabled={sendingModification}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSendModificationFromApp}
                disabled={sendingModification}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {sendingModification ? <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <MessageSquarePlus className="h-3.5 w-3.5" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {showApprovalRequestModal && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeApprovalModal} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Demander la validation du devis</h3>
              <p className="mt-1 text-sm text-gray-500">
                Le client reçoit le devis par email avec un lien sécurisé et un code de vérification.
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                  Adresse email du destinataire
                </label>
                {documentClient?.name && (
                  <p className="text-xs text-gray-400 mb-1.5">Client : {documentClient.name}</p>
                )}
                <Input
                  type="email"
                  value={approvalRequestEmail}
                  onChange={(e) => {
                    setApprovalRequestEmail(e.target.value);
                    if (approvalRequestError) setApprovalRequestError(null);
                  }}
                  placeholder="client@exemple.com"
                  disabled={sendingApprovalRequest}
                />
              </div>

              {/* Password toggle */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setApprovalPasswordEnabled((v) => !v);
                    setApprovalPassword('');
                  }}
                  disabled={sendingApprovalRequest}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2 font-medium text-gray-700">
                    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Protéger par mot de passe
                  </span>
                  <div className={`relative w-9 h-5 rounded-full transition-colors ${approvalPasswordEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${approvalPasswordEnabled ? 'translate-x-4' : ''}`} />
                  </div>
                </button>
                {approvalPasswordEnabled && (
                  <div className="px-4 pb-3 pt-1 border-t border-gray-100 bg-gray-50">
                    <label className="block text-xs text-gray-500 mb-1.5">
                      Mot de passe — à communiquer au client en dehors de l'email
                    </label>
                    <Input
                      type="text"
                      value={approvalPassword}
                      onChange={(e) => setApprovalPassword(e.target.value)}
                      placeholder="Ex : OpenRIG2025"
                      disabled={sendingApprovalRequest}
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {approvalRequestError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {approvalRequestError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex flex-row justify-end gap-2">
              <button
                type="button"
                onClick={closeApprovalModal}
                disabled={sendingApprovalRequest}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmApprovalRequest}
                disabled={sendingApprovalRequest || (approvalPasswordEnabled && !approvalPassword.trim())}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendingApprovalRequest ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    Envoi…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Envoyer la demande
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDocShareModal && docShareTarget && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeDocShareModal} />
          <div className="relative w-full max-w-md mx-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-medium text-gray-900">Partager le document</h3>
            <p className="mt-1 text-sm text-gray-600">
              Le lien donne accès au PDF. Vous pouvez le révoquer à tout moment.
            </p>
            <div className="mt-3 text-xs text-gray-500">
              Document : {docTitleMap.get(docShareTarget.id) || docShareTarget.title}
            </div>
            <div className="mt-4 space-y-3">
              {docShareLoading ? (
                <div className="text-sm text-gray-500">Création du lien…</div>
              ) : docShareLink ? (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Lien public
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input value={docShareLink} readOnly />
                    <button
                      type="button"
                      onClick={() => handleCopyShareLink(docShareLink)}
                      className="px-3 py-2 rounded-md text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Copier
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">Aucun lien actif pour ce document.</div>
              )}
              {docShareError && (
                <div className="text-sm text-red-600">{docShareError}</div>
              )}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDocShareModal}
                disabled={docShareLoading}
                className={`px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 ${docShareLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                Fermer
              </button>
              {docShareLink ? (
                <>
                  <button
                    type="button"
                    onClick={() => window.open(docShareLink, '_blank', 'noreferrer')}
                    disabled={docShareLoading}
                    className={`px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 ${docShareLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    Ouvrir
                  </button>
                  <button
                    type="button"
                    onClick={handleRevokeDocShare}
                    disabled={docShareLoading}
                    className={`px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 ${docShareLoading ? 'opacity-80 cursor-not-allowed hover:bg-red-600' : ''}`}
                  >
                    Révoquer
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateDocShare}
                  disabled={docShareLoading}
                  className={`px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 ${docShareLoading ? 'opacity-80 cursor-not-allowed hover:bg-blue-600' : ''}`}
                >
                  Créer un lien
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showQuoteExpiredModal && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowQuoteExpiredModal(false)} />
          <div className="relative w-full max-w-md mx-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-medium text-gray-900">Devis expiré</h3>
            <p className="mt-2 text-sm text-gray-600">
              Le devis a dépassé 30 jours. Le projet est revenu en attente de validation du devis.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowQuoteExpiredModal(false)}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuoteInvalidatedModal && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowQuoteInvalidatedModal(false)} />
          <div className="relative w-full max-w-md mx-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-medium text-gray-900">Devis annulé</h3>
            <p className="mt-2 text-sm text-gray-600">
              Une modification a été effectuée. Le devis précédent est annulé et le projet repasse en attente de validation.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowQuoteInvalidatedModal(false)}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrep && (
        <PreparationModal
          isOpen={showPrep}
          onClose={() => setShowPrep(false)}
          rental={rental}
          onStatusChange={(status) => {
            setRental(prev => (prev ? { ...prev, status } : prev));
            if (status === 'preparing') {
              recordActivity('preparation_started', 'Préparation démarrée.');
            }
            if (status === 'delivered') {
              recordActivity('preparation_completed', 'Préparation terminée.');
            }
          }}
        />
      )}
      {showDeliveryConfirm && (
        <DeliveryConfirmModal
          isOpen={showDeliveryConfirm}
          onClose={() => setShowDeliveryConfirm(false)}
          rental={rental}
          onConfirmed={(updates) => {
            setRental(prev => (prev ? { ...prev, ...updates } : prev));
            const note = updates.delivery_confirmation_note?.trim();
            recordActivity('delivery_confirmed', note ? `Livraison confirmée — ${note}` : 'Livraison confirmée.');
          }}
        />
      )}
      {showReturnDeliveryConfirm && rental && (
        <ReturnDeliveryConfirmModal
          isOpen={showReturnDeliveryConfirm}
          onClose={() => setShowReturnDeliveryConfirm(false)}
          rental={rental}
          onConfirmed={(updates) => {
            setRental(prev => (prev ? { ...prev, ...updates } : prev));
            const note = updates.return_delivery_confirmation_note?.trim();
            recordActivity('return_delivery_confirmed', note ? `Livraison retour confirmée — ${note}` : 'Livraison retour confirmée.');
          }}
        />
      )}
      {showEarlyReturnConfirm && rental && (
        <ConfirmDialog
          isOpen={showEarlyReturnConfirm}
          title="Retour anticipé"
          message={`Attention vous allez valider le retour matériel d'une ${formatRentalTypeLower(rental.type)} qui n'est théoriquement pas terminée. Êtes-vous sûr de continuer ?`}
          confirmLabel="Continuer"
          cancelLabel="Annuler"
          onConfirm={() => {
            setShowEarlyReturnConfirm(false);
            setReturnMode('new');
            setShowReturn(true);
          }}
          onCancel={() => setShowEarlyReturnConfirm(false)}
        />
      )}
      {showReturn && (
        <ReturnModal
          isOpen={showReturn}
          rental={rental}
          mode={returnMode}
          onClose={() => {
            setShowReturn(false);
            setReturnMode('new');
          }}
          onCompleted={async ({ returnId, completedAt, missingCount }) => {
            setShowReturn(false);
            setReturnMode('new');
            try {
              const { data } = await supabase
                .from('rental_returns')
                .select(`
                  id,
                  status,
                  started_at,
                  completed_at,
                  rental_return_items(
                    id,
                    equipment_id,
                    equipment_name,
                    equipment_type,
                    expected_quantity,
                    returned_quantity,
                    notes
                  )
                `)
                .eq('id', returnId)
                .maybeSingle();
              setRental(prev => {
                if (!prev) return prev;
                const info = data ? {
                  id: data.id,
                  status: data.status,
                  started_at: data.started_at,
                  completed_at: data.completed_at,
                  items: (data.rental_return_items || []).map((row: any) => ({
                    id: row.id,
                    equipment_id: row.equipment_id,
                    equipment_name: row.equipment_name || 'Équipement',
                    equipment_type: row.equipment_type || 'Type',
                    expected_quantity: row.expected_quantity,
                    returned_quantity: row.returned_quantity,
                    notes: row.notes,
                  })),
                } : {
                  id: returnId,
                  status: 'completed',
                  started_at: prev.return_info?.started_at || null,
                  completed_at: completedAt,
                  items: prev.return_info?.items || [],
                };
                const updated: Rental = {
                  ...prev,
                  status: missingCount > 0 ? 'in_return' : 'returned',
                  returned_at: missingCount > 0 ? null : completedAt,
                  return_info: info,
                };
                return updated;
              });
              recordActivity(
                'return_confirmed',
                missingCount > 0
                  ? `Retour validé — ${missingCount} article(s) manquant(s).`
                  : 'Retour validé.'
              );
            } catch (err) {
              console.error('reload return info', err);
            }
          }}
        />
      )}
      {isService && isSavingOverlayVisible && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
          <div className="flex flex-col items-center space-y-3 rounded-lg bg-white/90 px-6 py-5 shadow-xl">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
            <p className="text-sm font-medium text-gray-700">Enregistrement...</p>
          </div>
        </div>
      )}
      {showFileExplorer && rental && (
        <RentalFileExplorerModal
          rentalId={rental.id}
          rentalTitle={rental.title || rental.client_name || 'Dossier'}
          onClose={() => setShowFileExplorer(false)}
        />
      )}
    </div>
  );
};

export default RentalDetail;
