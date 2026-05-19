import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, QrCode, RefreshCcw, Search } from 'lucide-react';
import jsQR from 'jsqr';
import { supabase } from '../../lib/supabase';
import { StatusBadge, type BadgeTone } from '../../components/ui-kit';
import {
  fetchEquipmentUnitByCode,
  insertEquipmentUnitActivityLog,
  parseEquipmentQrPayload,
} from '../../utils/equipmentUnitTracking';

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

type RentalSummary = {
  id: string;
  reference_code: string | null;
  title: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  client_name: string | null;
};

type UnitHistoryEvent = {
  source_id: string;
  event_type: string;
  event_at: string;
  scan_result: string | null;
  forced: boolean;
  rental_id: string | null;
  reference_code: string | null;
  rental_title: string | null;
  client_name: string | null;
};

type ScannedUnitResult = {
  kind: 'equipment_unit';
  code: string;
  unit: {
    id: string;
    serial_number: string | null;
    qr_code_value: string | null;
    qr_code_url: string | null;
    status: string | null;
    warehouse_name: string | null;
  };
  equipment: {
    id: string;
    name: string | null;
    type: string | null;
    subtype: string | null;
    description: string | null;
    image_url: string | null;
    status: string | null;
  } | null;
  history: UnitHistoryEvent[];
  latestRentals: RentalSummary[];
};

type ScannedEquipmentResult = {
  kind: 'equipment';
  code: string;
  equipment: {
    id: string;
    name: string | null;
    type: string | null;
    subtype: string | null;
    description: string | null;
    image_url: string | null;
    status: string | null;
  };
  latestRentals: RentalSummary[];
};

type RentalItemDetail = {
  key: string;
  label: string;
  typeLabel: string;
  quantity: number;
  serials: Array<{
    id: string;
    serial_number: string | null;
    status: string | null;
  }>;
};

type ScannedRentalResult = {
  kind: 'rental';
  code: string;
  rental: {
    id: string;
    reference_code: string | null;
    title: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    location: string | null;
    delivery_address: string | null;
    pickup_address: string | null;
    description: string | null;
    notes: string | null;
    total_price: number | null;
    client_name: string | null;
    client_email: string | null;
    client_phone: string | null;
  };
  items: RentalItemDetail[];
};

type ScannedUnknownResult = {
  kind: 'unknown';
  code: string;
};

type ScanResult = ScannedUnitResult | ScannedEquipmentResult | ScannedRentalResult | ScannedUnknownResult;

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
};

const parseRentalIdCandidate = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('rental:')) {
    const fromPrefix = trimmed.slice('rental:'.length).trim();
    return fromPrefix || null;
  }
  const fromPath = trimmed.match(/\/rentals\/([0-9a-fA-F-]{36})/);
  if (fromPath?.[1]) return fromPath[1];
  const uuidMatch = trimmed.match(UUID_PATTERN);
  if (uuidMatch?.[0]) return uuidMatch[0];
  return null;
};

const statusBadgeTone = (status: string | null): BadgeTone => {
  switch ((status || '').toLowerCase()) {
    case 'preparing':
      return 'orange';
    case 'confirmed':
      return 'emerald';
    case 'pending':
      return 'amber';
    case 'in_progress':
      return 'blue';
    case 'delivered':
      return 'sky';
    case 'in_return':
      return 'purple';
    case 'returned':
    case 'paid':
    case 'completed':
      return 'gray';
    case 'cancelled':
      return 'red';
    default:
      return 'slate';
  }
};

const DepotScan: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [manualCode, setManualCode] = useState('');
  const [scannerRunning, setScannerRunning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isFallbackScanner, setIsFallbackScanner] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [resolving, setResolving] = useState(false);
  const [scanEnabled, setScanEnabled] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastQueryCodeRef = useRef<string | null>(null);

  const stopScanner = useCallback(() => {
    setScannerRunning(false);
    setIsFallbackScanner(false);
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const fetchRentalsByIds = useCallback(async (rentalIds: string[]) => {
    if (!rentalIds.length) return [] as RentalSummary[];
    const { data, error } = await supabase
      .from('rentals')
      .select('id, reference_code, title, status, start_date, end_date, location, clients(name)')
      .in('id', rentalIds);
    if (error) throw error;
    const orderMap = new Map(rentalIds.map((id, idx) => [id, idx]));
    return ((data || []) as any[])
      .map((row) => ({
        id: row.id as string,
        reference_code: (row.reference_code as string | null) ?? null,
        title: (row.title as string | null) ?? null,
        status: (row.status as string | null) ?? null,
        start_date: (row.start_date as string | null) ?? null,
        end_date: (row.end_date as string | null) ?? null,
        location: (row.location as string | null) ?? null,
        client_name: (row.clients?.name as string | null) ?? null,
      }))
      .sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
  }, []);

  const resolveScannedCode = useCallback(async (rawCode: string) => {
    const normalized = rawCode.trim();
    if (!normalized) {
      setScanError('Code vide.');
      return;
    }

    setResolving(true);
    setScanError(null);
    setResult(null);
    stopScanner();
    setScanEnabled(false);

    try {
      const parsed = parseEquipmentQrPayload(normalized);
      const sb: any = supabase;

      if (parsed.kind === 'equipment_unit' || parsed.kind === 'unknown') {
        const unit = await fetchEquipmentUnitByCode(normalized);
        if (unit) {
          const [{ data: unitMeta }, { data: equipmentRow }, { data: historyRows }] = await Promise.all([
            sb
              .from('equipment_units')
              .select('id, status, warehouse:warehouse_id(name)')
              .eq('id', unit.id)
              .maybeSingle(),
            supabase
              .from('equipment')
              .select('id, name, type, subtype, description, image_url, status')
              .eq('id', unit.equipment_id)
              .maybeSingle(),
            sb
              .from('equipment_unit_rental_history')
              .select('source_id, event_type, event_at, scan_result, forced, rental_id, reference_code, rental_title, client_name')
              .eq('equipment_unit_id', unit.id)
              .order('event_at', { ascending: false })
              .limit(12),
          ]);

          const history = ((historyRows || []) as any[]).map((row) => ({
            source_id: row.source_id as string,
            event_type: row.event_type as string,
            event_at: row.event_at as string,
            scan_result: (row.scan_result as string | null) ?? null,
            forced: row.forced === true,
            rental_id: (row.rental_id as string | null) ?? null,
            reference_code: (row.reference_code as string | null) ?? null,
            rental_title: (row.rental_title as string | null) ?? null,
            client_name: (row.client_name as string | null) ?? null,
          }));

          const rentalIds = Array.from(new Set(history.map((entry) => entry.rental_id).filter(Boolean))) as string[];
          const latestRentals = await fetchRentalsByIds(rentalIds.slice(0, 8));

          const resolved: ScannedUnitResult = {
            kind: 'equipment_unit',
            code: normalized,
            unit: {
              id: unit.id,
              serial_number: unit.serial_number,
              qr_code_value: unit.qr_code_value,
              qr_code_url: unit.qr_code_url,
              status: (unitMeta?.status as string | null) ?? null,
              warehouse_name: (unitMeta?.warehouse?.name as string | null) ?? null,
            },
            equipment: equipmentRow
              ? {
                  id: equipmentRow.id as string,
                  name: (equipmentRow.name as string | null) ?? null,
                  type: (equipmentRow.type as string | null) ?? null,
                  subtype: (equipmentRow.subtype as string | null) ?? null,
                  description: (equipmentRow.description as string | null) ?? null,
                  image_url: (equipmentRow.image_url as string | null) ?? null,
                  status: (equipmentRow.status as string | null) ?? null,
                }
              : null,
            history,
            latestRentals,
          };

          setResult(resolved);
          void insertEquipmentUnitActivityLog({
            equipment_unit_id: unit.id,
            equipment_id: unit.equipment_id,
            event_type: 'depot_scan_lookup',
            severity: 'info',
            source: 'depot_scan',
            message: 'Scan dépôt: unité résolue',
            payload: {
              scanned_code: normalized,
              result_kind: 'equipment_unit',
            },
          });
          return;
        }
      }

      let equipmentId: string | null = null;
      if (parsed.kind === 'equipment' && parsed.id) {
        equipmentId = parsed.id;
      } else {
        const uuidCandidate = normalized.match(UUID_PATTERN)?.[0] ?? null;
        if (uuidCandidate) equipmentId = uuidCandidate;
      }

      if (equipmentId) {
        const { data: equipmentRow, error: equipmentError } = await supabase
          .from('equipment')
          .select('id, name, type, subtype, description, image_url, status')
          .eq('id', equipmentId)
          .maybeSingle();
        if (equipmentError) throw equipmentError;

        if (equipmentRow?.id) {
          const { data: itemRows } = await supabase
            .from('rental_items')
            .select('rental_id')
            .eq('equipment_id', equipmentId)
            .order('created_at', { ascending: false })
            .limit(12);
          const rentalIds = Array.from(
            new Set(((itemRows || []) as any[]).map((row) => row.rental_id).filter(Boolean)),
          ) as string[];
          const latestRentals = await fetchRentalsByIds(rentalIds.slice(0, 8));

          const resolved: ScannedEquipmentResult = {
            kind: 'equipment',
            code: normalized,
            equipment: {
              id: equipmentRow.id as string,
              name: (equipmentRow.name as string | null) ?? null,
              type: (equipmentRow.type as string | null) ?? null,
              subtype: (equipmentRow.subtype as string | null) ?? null,
              description: (equipmentRow.description as string | null) ?? null,
              image_url: (equipmentRow.image_url as string | null) ?? null,
              status: (equipmentRow.status as string | null) ?? null,
            },
            latestRentals,
          };

          setResult(resolved);
          void insertEquipmentUnitActivityLog({
            equipment_id: equipmentRow.id,
            event_type: 'depot_scan_lookup',
            severity: 'info',
            source: 'depot_scan',
            message: 'Scan dépôt: matériel résolu',
            payload: {
              scanned_code: normalized,
              result_kind: 'equipment',
            },
          });
          return;
        }
      }

      const rentalIdCandidate = parseRentalIdCandidate(normalized);
      let rentalRow: any | null = null;

      if (rentalIdCandidate) {
        const { data } = await supabase
          .from('rentals')
          .select('id, reference_code, title, status, start_date, end_date, location, delivery_address, pickup_address, description, notes, total_price, clients(name, email, phone)')
          .eq('id', rentalIdCandidate)
          .maybeSingle();
        rentalRow = data || null;
      }

      if (!rentalRow) {
        const { data } = await supabase
          .from('rentals')
          .select('id, reference_code, title, status, start_date, end_date, location, delivery_address, pickup_address, description, notes, total_price, clients(name, email, phone)')
          .ilike('reference_code', normalized)
          .limit(1)
          .maybeSingle();
        rentalRow = data || null;
      }

      if (rentalRow?.id) {
        const [itemsRes, reservationsRes] = await Promise.all([
          supabase
            .from('rental_items')
            .select('id, equipment_id, quantity, is_external, external_name, external_type, external_subtype, equipment:equipment_id(id, name, type)')
            .eq('rental_id', rentalRow.id),
          (supabase as any)
            .from('rental_unit_reservations')
            .select('equipment_id, equipment_unit_id, equipment_unit:equipment_unit_id(id, serial_number, status)')
            .eq('rental_id', rentalRow.id),
        ]);

        if (itemsRes.error) throw itemsRes.error;
        if (reservationsRes.error) throw reservationsRes.error;

        const serialsByEquipmentId: Record<string, Array<{ id: string; serial_number: string | null; status: string | null }>> = {};
        ((reservationsRes.data || []) as any[]).forEach((row) => {
          const equipmentIdForRow = (row.equipment_id as string | null) ?? null;
          if (!equipmentIdForRow) return;
          if (!serialsByEquipmentId[equipmentIdForRow]) serialsByEquipmentId[equipmentIdForRow] = [];
          serialsByEquipmentId[equipmentIdForRow].push({
            id: (row.equipment_unit?.id as string) || (row.equipment_unit_id as string),
            serial_number: (row.equipment_unit?.serial_number as string | null) ?? null,
            status: (row.equipment_unit?.status as string | null) ?? null,
          });
        });

        const items = ((itemsRes.data || []) as any[]).map((row) => {
          const equipmentIdForRow = (row.equipment_id as string | null) ?? null;
          const isExternal = row.is_external === true;
          const externalLabel = [row.external_type, row.external_subtype].filter(Boolean).join(' / ');
          return {
            key: (row.id as string) || `${equipmentIdForRow || 'external'}-${Math.random().toString(36).slice(2, 8)}`,
            label: isExternal
              ? ((row.external_name as string | null) || 'Matériel externe')
              : (((row.equipment as any)?.name as string | null) || 'Matériel'),
            typeLabel: isExternal
              ? (externalLabel || 'Externe')
              : ((((row.equipment as any)?.type as string | null) || 'Type —')),
            quantity: Number(row.quantity || 0),
            serials: equipmentIdForRow ? (serialsByEquipmentId[equipmentIdForRow] || []) : [],
          } as RentalItemDetail;
        });

        const resolved: ScannedRentalResult = {
          kind: 'rental',
          code: normalized,
          rental: {
            id: rentalRow.id as string,
            reference_code: (rentalRow.reference_code as string | null) ?? null,
            title: (rentalRow.title as string | null) ?? null,
            status: (rentalRow.status as string | null) ?? null,
            start_date: (rentalRow.start_date as string | null) ?? null,
            end_date: (rentalRow.end_date as string | null) ?? null,
            location: (rentalRow.location as string | null) ?? null,
            delivery_address: (rentalRow.delivery_address as string | null) ?? null,
            pickup_address: (rentalRow.pickup_address as string | null) ?? null,
            description: (rentalRow.description as string | null) ?? null,
            notes: (rentalRow.notes as string | null) ?? null,
            total_price: typeof rentalRow.total_price === 'number' ? rentalRow.total_price : null,
            client_name: (rentalRow.clients?.name as string | null) ?? null,
            client_email: (rentalRow.clients?.email as string | null) ?? null,
            client_phone: (rentalRow.clients?.phone as string | null) ?? null,
          },
          items,
        };

        setResult(resolved);
        void insertEquipmentUnitActivityLog({
          rental_id: rentalRow.id,
          event_type: 'depot_scan_lookup',
          severity: 'info',
          source: 'depot_scan',
          message: 'Scan dépôt: prestation résolue',
          payload: {
            scanned_code: normalized,
            result_kind: 'rental',
          },
        });
        return;
      }

      setResult({
        kind: 'unknown',
        code: normalized,
      });

      void insertEquipmentUnitActivityLog({
        event_type: 'depot_scan_unknown',
        severity: 'warning',
        source: 'depot_scan',
        message: 'Scan dépôt: code inconnu',
        payload: {
          scanned_code: normalized,
        },
      });
    } catch (error) {
      console.error('depot scan resolve', error);
      setScanError('Impossible d’analyser ce code.');
    } finally {
      setResolving(false);
    }
  }, [fetchRentalsByIds, stopScanner]);

  const handleReset = useCallback(() => {
    setResult(null);
    setScanError(null);
    setManualCode('');
    setScanEnabled(true);
    lastQueryCodeRef.current = null;
    setSearchParams({});
  }, [setSearchParams]);

  const startScanner = useCallback(async () => {
    if (!scanEnabled) return;
    setScanError(null);

    if (!window.isSecureContext) {
      setScanError('Le scan nécessite une connexion sécurisée (HTTPS ou localhost).');
      return;
    }
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      setScanError('Caméra indisponible sur ce navigateur.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.setAttribute('autoplay', 'true');
      video.srcObject = stream;
      await video.play();
      setScannerRunning(true);

      const runFallbackLoop = () => {
        setIsFallbackScanner(true);
        const fallback = () => {
          if (!videoRef.current) return;
          const currentVideo = videoRef.current;
          if (currentVideo.readyState < 2) {
            frameRef.current = requestAnimationFrame(fallback);
            return;
          }

          const canvas =
            canvasRef.current ||
            (() => {
              const newCanvas = document.createElement('canvas');
              canvasRef.current = newCanvas;
              return newCanvas;
            })();

          const width = currentVideo.videoWidth;
          const height = currentVideo.videoHeight;
          if (width === 0 || height === 0) {
            frameRef.current = requestAnimationFrame(fallback);
            return;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
          if (!ctx) {
            frameRef.current = requestAnimationFrame(fallback);
            return;
          }

          ctx.drawImage(currentVideo, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code?.data) {
            void resolveScannedCode(code.data);
            return;
          }
          frameRef.current = requestAnimationFrame(fallback);
        };

        frameRef.current = requestAnimationFrame(fallback);
      };

      const detectorCtor = (window as unknown as {
        BarcodeDetector?: new (config: { formats: string[] }) => {
          detect: (source: CanvasImageSource | HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
        };
      }).BarcodeDetector;

      let detector: InstanceType<NonNullable<typeof detectorCtor>> | null = null;
      if (detectorCtor) {
        try {
          detector = new detectorCtor({ formats: ['qr_code'] });
        } catch (error) {
          console.warn('BarcodeDetector init failed, fallback scan enabled', error);
          detector = null;
        }
      }

      if (detector) {
        const detectLoop = async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector!.detect(videoRef.current);
            if (barcodes?.length) {
              void resolveScannedCode(barcodes[0].rawValue);
              return;
            }
          } catch (error) {
            console.error('Barcode detect error', error);
            runFallbackLoop();
            return;
          }
          frameRef.current = requestAnimationFrame(detectLoop);
        };
        frameRef.current = requestAnimationFrame(detectLoop);
      } else {
        runFallbackLoop();
      }
    } catch (error) {
      console.error('depot scan start camera', error);
      setScanError('Impossible d’accéder à la caméra.');
      stopScanner();
    }
  }, [resolveScannedCode, scanEnabled, stopScanner]);

  useEffect(() => {
    if (scanEnabled && !result && !resolving && !scanError && !scannerRunning) {
      void startScanner();
    }
  }, [result, resolving, scanEnabled, scanError, scannerRunning, startScanner]);

  useEffect(() => () => stopScanner(), [stopScanner]);

  useEffect(() => {
    const codeFromQuery = searchParams.get('code');
    if (!codeFromQuery) return;
    if (codeFromQuery === lastQueryCodeRef.current) return;
    lastQueryCodeRef.current = codeFromQuery;
    setManualCode(codeFromQuery);
    void resolveScannedCode(codeFromQuery);
  }, [resolveScannedCode, searchParams]);

  const resultTitle = useMemo(() => {
    if (!result) return null;
    if (result.kind === 'equipment_unit') {
      return `Numéro ${result.unit.serial_number || result.unit.id.slice(0, 8)}`;
    }
    if (result.kind === 'equipment') return result.equipment.name || 'Matériel';
    if (result.kind === 'rental') return `${result.rental.reference_code || result.rental.id.slice(0, 8)} · ${result.rental.title || 'Prestation'}`;
    return 'Code inconnu';
  }, [result]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Scanner universel</h2>
        <p className="mt-1 text-sm text-gray-600">
          Scanne n&apos;importe quel QR. Si c&apos;est un matériel, affiche les dernières prestations. Si c&apos;est une prestation, affiche le matériel détaillé.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="Coller un code QR, référence prestation, UUID..."
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const code = manualCode.trim();
                if (!code) return;
                lastQueryCodeRef.current = code;
                setSearchParams({ code });
                void resolveScannedCode(code);
              }}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Analyser
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Caméra</h3>
            {scannerRunning ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                <span className="inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-green-600" />
                active
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setScanEnabled(true);
                  setScanError(null);
                }}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Relancer
              </button>
            )}
          </div>

          <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="h-full w-full object-cover opacity-85" playsInline autoPlay muted />
            <div className="pointer-events-none absolute inset-[12%] rounded-xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
          </div>

          {isFallbackScanner && (
            <p className="mt-2 text-[11px] font-medium text-gray-500">Mode compatibilité scan actif.</p>
          )}
          {scanError && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">{scanError}</p>
          )}
          {resolving && (
            <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs text-blue-700">
              Analyse du code en cours...
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {!result ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
              <QrCode className="h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">Aucun résultat pour l&apos;instant</p>
              <p className="mt-1 max-w-lg text-xs text-gray-500">
                Scanne un QR matériel ou prestation, ou colle un code manuellement.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-blue-900">{resultTitle}</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    reconnu
                  </span>
                </div>
                <p className="mt-1 break-all text-[11px] font-mono text-blue-700/80">{result.code}</p>
              </div>

              {result.kind === 'unknown' && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                  Aucun matériel ou prestation reconnu avec ce code.
                </div>
              )}

              {result.kind === 'equipment_unit' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_220px]">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <h4 className="text-sm font-semibold text-gray-900">Matériel scanné (unité)</h4>
                      <p className="mt-1 text-sm text-gray-700">
                        {result.unit.serial_number || result.unit.id.slice(0, 8)} · {result.equipment?.name || 'Matériel'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {result.equipment?.type || 'Type —'} {result.equipment?.subtype ? `· ${result.equipment.subtype}` : ''}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Statut unité: {result.unit.status || '—'}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Entrepôt: {result.unit.warehouse_name || '—'}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Statut matériel: {result.equipment?.status || '—'}</span>
                      </div>
                      {result.equipment?.description && (
                        <p className="mt-3 text-sm text-gray-600">{result.equipment.description}</p>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      {result.unit.qr_code_url ? (
                        <img
                          src={result.unit.qr_code_url}
                          alt={result.unit.serial_number || result.unit.id}
                          className="mx-auto w-full max-w-[180px] rounded-md border border-gray-200 bg-white p-1.5"
                        />
                      ) : (
                        <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-gray-300 bg-white text-xs text-gray-400">
                          QR indisponible
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h4 className="text-sm font-semibold text-gray-900">Dernières prestations du numéro</h4>
                    {result.latestRentals.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">Aucun projet récent.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {result.latestRentals.map((rental) => (
                          <Link
                            key={rental.id}
                            to={`/depot/scan?code=${encodeURIComponent(`rental:${rental.id}`)}`}
                            className="block rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 hover:bg-gray-100"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900">
                                {rental.reference_code || rental.id.slice(0, 8)} · {rental.title || 'Prestation'}
                              </p>
                              <StatusBadge tone={statusBadgeTone(rental.status)} size="sm">
                                {rental.status || '—'}
                              </StatusBadge>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {rental.client_name || 'Client'} · {formatDateTime(rental.start_date)} → {formatDateTime(rental.end_date)}
                            </p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h4 className="text-sm font-semibold text-gray-900">Historique de scan du numéro</h4>
                    {result.history.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">Aucun historique de scan.</p>
                    ) : (
                      <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                        {result.history.map((entry) => (
                          <div key={entry.source_id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-gray-800">{entry.event_type}</p>
                              {entry.forced && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                                  forcé
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {formatDateTime(entry.event_at)} · {entry.scan_result || '—'}
                            </p>
                            {(entry.reference_code || entry.rental_id) && (
                              entry.rental_id ? (
                                <Link
                                  to={`/depot/scan?code=${encodeURIComponent(`rental:${entry.rental_id}`)}`}
                                  className="mt-1 inline-block text-xs text-blue-700 hover:underline"
                                >
                                  {entry.reference_code || entry.rental_title || entry.rental_id}
                                </Link>
                              ) : (
                                <span className="mt-1 inline-block text-xs text-gray-500">
                                  {entry.reference_code || entry.rental_title || 'Prestation'}
                                </span>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {result.kind === 'equipment' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h4 className="text-sm font-semibold text-gray-900">Matériel</h4>
                    <p className="mt-1 text-sm text-gray-800">{result.equipment.name || 'Matériel'}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {result.equipment.type || 'Type —'} {result.equipment.subtype ? `· ${result.equipment.subtype}` : ''}
                    </p>
                    <div className="mt-3 text-xs text-gray-600">
                      Statut: <span className="font-medium text-gray-800">{result.equipment.status || '—'}</span>
                    </div>
                    {result.equipment.description && (
                      <p className="mt-3 text-sm text-gray-600">{result.equipment.description}</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h4 className="text-sm font-semibold text-gray-900">Dernières prestations</h4>
                    {result.latestRentals.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">Aucun projet récent.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {result.latestRentals.map((rental) => (
                          <Link
                            key={rental.id}
                            to={`/depot/scan?code=${encodeURIComponent(`rental:${rental.id}`)}`}
                            className="block rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 hover:bg-gray-100"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900">
                                {rental.reference_code || rental.id.slice(0, 8)} · {rental.title || 'Prestation'}
                              </p>
                              <StatusBadge tone={statusBadgeTone(rental.status)} size="sm">
                                {rental.status || '—'}
                              </StatusBadge>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {rental.client_name || 'Client'} · {formatDateTime(rental.start_date)} → {formatDateTime(rental.end_date)}
                            </p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {result.kind === 'rental' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h4 className="text-sm font-semibold text-gray-900">Infos prestation</h4>
                    <p className="mt-1 text-sm text-gray-900">
                      {result.rental.reference_code || result.rental.id.slice(0, 8)} · {result.rental.title || 'Prestation'}
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-600 md:grid-cols-2">
                      <p>Statut: <span className="font-medium text-gray-800">{result.rental.status || '—'}</span></p>
                      <p>Client: <span className="font-medium text-gray-800">{result.rental.client_name || '—'}</span></p>
                      <p>Début: <span className="font-medium text-gray-800">{formatDateTime(result.rental.start_date)}</span></p>
                      <p>Fin: <span className="font-medium text-gray-800">{formatDateTime(result.rental.end_date)}</span></p>
                      <p>Lieu: <span className="font-medium text-gray-800">{result.rental.location || result.rental.delivery_address || result.rental.pickup_address || '—'}</span></p>
                      <p>Total: <span className="font-medium text-gray-800">{result.rental.total_price !== null ? `${result.rental.total_price.toFixed(2)} €` : '—'}</span></p>
                    </div>
                    {result.rental.description && (
                      <p className="mt-3 text-sm text-gray-600">{result.rental.description}</p>
                    )}
                    {result.rental.notes && (
                      <p className="mt-2 text-sm text-gray-500">Notes: {result.rental.notes}</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h4 className="text-sm font-semibold text-gray-900">Matériel précis de la prestation</h4>
                    {result.items.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">Aucune ligne matériel.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {result.items.map((item) => (
                          <div key={item.key} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900">{item.label}</p>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                                x{item.quantity}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-gray-500">{item.typeLabel}</p>
                            {item.serials.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {item.serials.map((serial) => (
                                  <Link
                                    key={serial.id}
                                    to={`/depot/scan?code=${encodeURIComponent(`equipment_unit:${serial.id}`)}`}
                                    className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                                  >
                                    {serial.serial_number || serial.id.slice(0, 8)} ({serial.status || '—'})
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DepotScan;
