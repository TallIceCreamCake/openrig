import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MobileLayout from './MobileLayout';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Check, Scan, RefreshCcw } from 'lucide-react';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import jsQR from 'jsqr';
import {
  type EquipmentUnitRecord,
  fetchEquipmentUnitByCode,
  insertEquipmentUnitActivityLog,
  insertPreparationUnitScanLog,
  loadCountedPreparationUnitIds,
  loadSerialTrackingContextForPreparation,
  parseEquipmentQrPayload,
} from '../../utils/equipmentUnitTracking';
import {
  getOrCreateRentalPreparation,
  loadPreparationItemsForRental,
  type PreparationItem as RentalPreparationItem,
} from '../../utils/rentalPreparation';

type Prep = { id: string; rental_id: string; status: string };

type PrepItem = RentalPreparationItem & {
  equipment_id: string;
  equipment_name: string;
  equipment_type: string;
  quantity: number;
  prepared_quantity: number;
  completed: boolean;
};

const MobilePreparationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useCompanySettings();
  const accent = useMemo(() => settings?.accent_color || '#2563eb', [settings]);

  const [loading, setLoading] = useState(true);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [items, setItems] = useState<PrepItem[]>([]);
  const [rentalStatus, setRentalStatus] = useState<string | null>(null);

  const [serialEquipmentIds, setSerialEquipmentIds] = useState<Set<string>>(new Set());
  const [expectedUnitsById, setExpectedUnitsById] = useState<Record<string, EquipmentUnitRecord>>({});
  const [countedPrepUnitIds, setCountedPrepUnitIds] = useState<Set<string>>(new Set());

  const [scanPanelOpen, setScanPanelOpen] = useState(false);
  const [scannerRunning, setScannerRunning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scannedEquipmentId, setScannedEquipmentId] = useState<string | null>(null);
  const [scannedUnitId, setScannedUnitId] = useState<string | null>(null);
  const [scannedQuantity, setScannedQuantity] = useState<number>(0);
  const [isFallbackScanner, setIsFallbackScanner] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        setLoading(true);

        const { data: rentalRow } = await supabase
          .from('rentals')
          .select('type, status')
          .eq('id', id)
          .maybeSingle();

        const externalLabel = (rentalRow as any)?.type === 'sale' ? 'Achat matériel' : 'Sous-location';
        setRentalStatus((rentalRow as any)?.status ?? null);

        const prepRow = (await getOrCreateRentalPreparation(id)) as Prep;

        setPrep(prepRow);

        const resolvedItems = (await loadPreparationItemsForRental(id, prepRow.id, externalLabel)) as PrepItem[];

        setItems(resolvedItems);

        const equipmentIds = Array.from(
          new Set(
            resolvedItems
              .map((row) => row.equipment_id)
              .filter((equipmentId): equipmentId is string => typeof equipmentId === 'string' && equipmentId.length > 0),
          ),
        );

        const tracking = await loadSerialTrackingContextForPreparation(id, equipmentIds);
        setSerialEquipmentIds(tracking.serialEquipmentIds);
        setExpectedUnitsById(tracking.expectedUnitsById);

        const countedSet = await loadCountedPreparationUnitIds(prepRow.id);
        setCountedPrepUnitIds(countedSet);

        if (tracking.serialEquipmentIds.size > 0 && resolvedItems.length > 0) {
          const countedByEquipment = new Map<string, number>();
          countedSet.forEach((unitId) => {
            const unit = tracking.expectedUnitsById[unitId];
            if (!unit) return;
            countedByEquipment.set(unit.equipment_id, (countedByEquipment.get(unit.equipment_id) || 0) + 1);
          });

          const synced = resolvedItems.map((row) => {
            if (!tracking.serialEquipmentIds.has(row.equipment_id)) return row;
            const counted = Math.min(row.quantity, countedByEquipment.get(row.equipment_id) || 0);
            return {
              ...row,
              prepared_quantity: counted,
              completed: counted >= row.quantity,
            };
          });

          setItems(synced);

          await Promise.all(
            synced
              .filter((row) => !!row.id && tracking.serialEquipmentIds.has(row.equipment_id))
              .map((row) =>
                supabase
                  .from('rental_preparation_items')
                  .update({ prepared_quantity: row.prepared_quantity, completed: row.completed })
                  .eq('id', row.id),
              ),
          );
        }

        if ((rentalRow as any)?.status === 'confirmed') {
          try {
            await supabase.from('rentals').update({ status: 'preparing' }).eq('id', id);
          } catch {
            // Non-blocking
          }
        }
      } catch (error) {
        console.error('mobile prep init', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const allDone = items.length === 0 || items.every((item) => item.prepared_quantity >= item.quantity);
  const isAwaitingApproval = rentalStatus === 'pending';

  const stopScanner = useCallback(() => {
    setScannerRunning(false);
    setIsFallbackScanner(false);

    if (scanFrameRef.current !== null) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    if (videoRef.current) {
      const video = videoRef.current;
      video.pause();
      video.srcObject = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const logPreparationScan = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!prep?.id || !id) return;
      await insertPreparationUnitScanLog({
        preparation_id: prep.id,
        rental_id: id,
        ...payload,
      });
    },
    [id, prep?.id],
  );

  const handleScanResult = useCallback(
    async (rawValue: string | null | undefined) => {
      if (!rawValue) return;

      stopScanner();

      const normalized = rawValue.trim();
      setScannedCode(normalized);
      setScannedEquipmentId(null);
      setScannedUnitId(null);
      setScanError(null);
      setScanMessage(null);

      const parsed = parseEquipmentQrPayload(normalized);

      if (parsed.kind === 'equipment' && parsed.id) {
        const equipmentId = parsed.id;
        const match = items.find((item) => item.equipment_id === equipmentId) ?? null;

        if (!match) {
          setScanError('Matériel introuvable pour ce QR code.');
          await logPreparationScan({
            scan_result: 'unknown_code',
            scanned_code: normalized,
            counted: false,
            error_message: 'QR matériel introuvable dans la préparation',
          });
          return;
        }

        if (serialEquipmentIds.has(equipmentId)) {
          setScanError('Ce matériel est suivi par numéro: scannez le QR du numéro de suivi exact.');
          await logPreparationScan({
            scan_result: 'wrong_code_type',
            scanned_code: normalized,
            equipment_id: equipmentId,
            expected_equipment_id: equipmentId,
            counted: false,
            error_message: 'QR équipement scanné au lieu d\'un QR unitaire',
          });
          return;
        }

        setScannedEquipmentId(match.equipment_id);
        return;
      }

      const unit = await fetchEquipmentUnitByCode(normalized);

      if (!unit) {
        setScanError('QR code non reconnu pour cette préparation.');
        await logPreparationScan({
          scan_result: 'unknown_code',
          scanned_code: normalized,
          counted: false,
          error_message: 'QR unitaire inconnu',
        });
        return;
      }

      const expectedUnit = expectedUnitsById[unit.id] || null;
      const item = items.find((row) => row.equipment_id === unit.equipment_id) || null;

      if (!expectedUnit || !item || !serialEquipmentIds.has(item.equipment_id)) {
        setScanError('Ce numéro de suivi n’est pas prévu sur cette préparation.');
        setScannedUnitId(unit.id);

        await logPreparationScan({
          scan_result: 'wrong_equipment',
          scanned_code: normalized,
          equipment_id: unit.equipment_id,
          equipment_unit_id: unit.id,
          counted: false,
          error_message: 'Numéro de suivi hors périmètre de préparation',
        });

        await insertEquipmentUnitActivityLog({
          equipment_unit_id: unit.id,
          equipment_id: unit.equipment_id,
          rental_id: id,
          event_type: 'prep_scan_rejected',
          severity: 'warning',
          source: 'mobile_preparation',
          message: 'Scan rejeté: unité non prévue sur cette préparation',
          payload: {
            scanned_code: normalized,
            preparation_id: prep?.id,
          },
        });

        return;
      }

      setScannedEquipmentId(item.equipment_id);
      setScannedUnitId(unit.id);

      if (countedPrepUnitIds.has(unit.id)) {
        await logPreparationScan({
          scan_result: 'duplicate',
          scanned_code: normalized,
          equipment_id: unit.equipment_id,
          equipment_unit_id: unit.id,
          expected_equipment_id: item.equipment_id,
          counted: false,
          error_message: 'Unité déjà scannée sur cette préparation',
        });
      } else if (item.prepared_quantity >= item.quantity) {
        await logPreparationScan({
          scan_result: 'already_completed',
          scanned_code: normalized,
          equipment_id: unit.equipment_id,
          equipment_unit_id: unit.id,
          expected_equipment_id: item.equipment_id,
          counted: false,
          error_message: 'Ligne de préparation déjà complète',
        });
      }
    },
    [countedPrepUnitIds, expectedUnitsById, id, items, logPreparationScan, prep?.id, serialEquipmentIds, stopScanner],
  );

  const startScanner = useCallback(async () => {
    if (!scanPanelOpen) return;
    setScanError(null);

    if (!window.isSecureContext) {
      setScanError('Le scan nécessite une connexion sécurisée (HTTPS ou localhost).');
      return;
    }

    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      setScanError('Votre navigateur ne permet pas d’utiliser la caméra.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      const videoElement = videoRef.current;
      if (!videoElement) return;

      videoElement.setAttribute('playsinline', 'true');
      videoElement.setAttribute('muted', 'true');
      videoElement.setAttribute('autoplay', 'true');
      videoElement.srcObject = stream;
      await videoElement.play();

      setScannerRunning(true);

      const runFallbackLoop = () => {
        setIsFallbackScanner(true);

        const fallback = () => {
          if (!videoRef.current) return;
          const video = videoRef.current;

          if (video.readyState < 2) {
            scanFrameRef.current = requestAnimationFrame(fallback);
            return;
          }

          const canvas =
            canvasRef.current ||
            (() => {
              const newCanvas = document.createElement('canvas');
              canvasRef.current = newCanvas;
              return newCanvas;
            })();

          const width = video.videoWidth;
          const height = video.videoHeight;
          if (width === 0 || height === 0) {
            scanFrameRef.current = requestAnimationFrame(fallback);
            return;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
          if (!ctx) {
            scanFrameRef.current = requestAnimationFrame(fallback);
            return;
          }

          ctx.drawImage(video, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            void handleScanResult(code.data);
            return;
          }

          scanFrameRef.current = requestAnimationFrame(fallback);
        };

        scanFrameRef.current = requestAnimationFrame(fallback);
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
          console.warn('BarcodeDetector creation failed, fallback enabled', error);
          detector = null;
        }
      }

      if (detector) {
        const detectLoop = async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector!.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              void handleScanResult(barcodes[0].rawValue);
              return;
            }
          } catch (error) {
            console.error('QR detect', error);
            if (error instanceof Error && error.name === 'NotSupportedError') {
              runFallbackLoop();
              return;
            }
          }

          scanFrameRef.current = requestAnimationFrame(detectLoop);
        };

        const firstDetect = async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector!.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              void handleScanResult(barcodes[0].rawValue);
              return;
            }
            scanFrameRef.current = requestAnimationFrame(detectLoop);
          } catch (error) {
            console.warn('BarcodeDetector detect failed on first attempt, fallback enabled', error);
            runFallbackLoop();
          }
        };

        void firstDetect();
      } else {
        runFallbackLoop();
      }
    } catch (error) {
      console.error('startScanner', error);
      setScanError('Impossible d’accéder à la caméra.');
      stopScanner();
    }
  }, [handleScanResult, scanPanelOpen, stopScanner]);

  useEffect(() => {
    if (!scanPanelOpen) return;
    if (scannerRunning) return;
    if (scannedEquipmentId) return;
    if (scanError) return;
    void startScanner();
  }, [scanError, scanPanelOpen, scannedEquipmentId, scannerRunning, startScanner]);

  useEffect(() => {
    if (!scanPanelOpen) {
      stopScanner();
    }
  }, [scanPanelOpen, stopScanner]);

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  const scannedItem = scannedEquipmentId
    ? items.find((item) => item.equipment_id === scannedEquipmentId) ?? null
    : null;
  const scannedUnit = scannedUnitId ? expectedUnitsById[scannedUnitId] ?? null : null;
  const isSerialScan = !!scannedItem && serialEquipmentIds.has(scannedItem.equipment_id) && !!scannedUnitId;

  const scanState = useMemo(() => {
    if (scanError) return { status: 'error' as const, message: scanError };

    if (scannedItem) {
      if (isSerialScan && scannedUnitId && countedPrepUnitIds.has(scannedUnitId)) {
        return { status: 'complete' as const, message: 'Ce numéro de suivi est déjà comptabilisé.' };
      }
      if (scannedItem.prepared_quantity >= scannedItem.quantity) {
        return { status: 'complete' as const, message: 'Ce matériel est déjà entièrement préparé.' };
      }
      if (isSerialScan) {
        return { status: 'pending' as const, message: `Préparation unitaire: ${scannedItem.equipment_name}` };
      }
      return { status: 'pending' as const, message: `Préparation de ${scannedItem.equipment_name}` };
    }

    if (scannedCode) {
      return { status: 'error' as const, message: 'QR code non reconnu pour cette préparation.' };
    }

    return { status: null, message: null } as const;
  }, [countedPrepUnitIds, isSerialScan, scanError, scannedCode, scannedItem, scannedUnitId]);

  const isOverlayActive = scanState.status !== null;
  const overlayBgByStatus: Record<'error' | 'complete' | 'pending', string> = {
    error: 'bg-red-600/70',
    complete: 'bg-amber-500/75',
    pending: 'bg-green-600/70',
  };
  const overlayBg = scanState.status ? overlayBgByStatus[scanState.status] : '';

  useEffect(() => {
    if (!scannedItem) {
      setScannedQuantity(0);
      return;
    }

    if (serialEquipmentIds.has(scannedItem.equipment_id)) {
      setScannedQuantity(1);
      return;
    }

    const defaultQuantity =
      scannedItem.prepared_quantity > 0
        ? Math.min(scannedItem.quantity, scannedItem.prepared_quantity)
        : scannedItem.quantity;
    setScannedQuantity(defaultQuantity);
  }, [scannedItem, serialEquipmentIds]);

  const handleResetScan = useCallback(() => {
    stopScanner();
    setScannerRunning(false);
    setScanError(null);
    setScanMessage(null);
    setScannedCode(null);
    setScannedEquipmentId(null);
    setScannedUnitId(null);
    setScannedQuantity(0);
  }, [stopScanner]);

  const handleScanToggle = () => {
    if (isAwaitingApproval) return;
    if (scanPanelOpen) {
      handleResetScan();
      setScanPanelOpen(false);
    } else {
      handleResetScan();
      setScanPanelOpen(true);
    }
  };

  const handleScannedQuantityChange = (next: number) => {
    if (!scannedItem) return;
    const safe = Number.isNaN(next) ? 0 : next;
    const clamped = Math.max(0, Math.min(scannedItem.quantity, safe));
    setScannedQuantity(clamped);
  };

  const stepScannedQuantity = (delta: number) => {
    if (!scannedItem) return;
    handleScannedQuantityChange(scannedQuantity + delta);
  };

  const updateItem = async (row: PrepItem, value: number, _options?: { allowSerialManual?: boolean }) => {
    if (isAwaitingApproval) return;

    const preparedQuantity = Math.max(0, Math.min(row.quantity, value));
    const completed = preparedQuantity >= row.quantity;

    setItems((prev) => prev.map((item) => (item.id === row.id ? { ...item, prepared_quantity: preparedQuantity, completed } : item)));

    try {
      await supabase
        .from('rental_preparation_items')
        .update({ prepared_quantity: preparedQuantity, completed })
        .eq('id', row.id);
    } catch (error) {
      console.error('mobile prep update item', error);
    }
  };

  const handleConfirmScanned = async () => {
    if (!scannedItem || !id) return;

    if (isSerialScan) {
      if (!scannedUnitId) return;

      if (countedPrepUnitIds.has(scannedUnitId)) {
        setScanMessage('Ce numéro de suivi a déjà été validé.');
        setScannedEquipmentId(null);
        setScannedUnitId(null);
        setScannedCode(null);
        return;
      }

      const nextQuantity = Math.min(scannedItem.quantity, scannedItem.prepared_quantity + 1);
      if (nextQuantity <= scannedItem.prepared_quantity) {
        setScanMessage('La ligne est déjà complète.');
        return;
      }

      await updateItem(scannedItem, nextQuantity, { allowSerialManual: true });
      setCountedPrepUnitIds((prev) => {
        const next = new Set(prev);
        next.add(scannedUnitId);
        return next;
      });

      await logPreparationScan({
        scan_result: 'accepted',
        scanned_code: scannedCode,
        equipment_id: scannedItem.equipment_id,
        equipment_unit_id: scannedUnitId,
        expected_equipment_id: scannedItem.equipment_id,
        preparation_item_id: scannedItem.id,
        counted: true,
        forced: false,
        metadata: {
          serial_number: scannedUnit?.serial_number || null,
          prepared_quantity_before: scannedItem.prepared_quantity,
          prepared_quantity_after: nextQuantity,
        },
      });

      await insertEquipmentUnitActivityLog({
        equipment_unit_id: scannedUnitId,
        equipment_id: scannedItem.equipment_id,
        rental_id: id,
        event_type: 'prep_scan_accepted',
        severity: 'info',
        source: 'mobile_preparation',
        message: 'Unité validée en préparation (mobile)',
        payload: {
          preparation_id: prep?.id,
          preparation_item_id: scannedItem.id,
          scanned_code: scannedCode,
          serial_number: scannedUnit?.serial_number || null,
        },
      });

      setScanMessage(`Numéro ${scannedUnit?.serial_number || scannedUnitId} validé.`);
      setScannedEquipmentId(null);
      setScannedUnitId(null);
      setScannedCode(null);
      setScannedQuantity(0);
      return;
    }

    await updateItem(scannedItem, scannedQuantity);

    await logPreparationScan({
      scan_result: 'accepted',
      scanned_code: scannedCode,
      equipment_id: scannedItem.equipment_id,
      expected_equipment_id: scannedItem.equipment_id,
      preparation_item_id: scannedItem.id,
      counted: true,
      forced: false,
      metadata: {
        quantity_validated: scannedQuantity,
      },
    });

    setScanMessage('Quantité mise à jour. Prêt pour le prochain scan.');
    setScannedEquipmentId(null);
    setScannedCode(null);
    setScannedQuantity(0);
  };

  const markAll = async () => {
    if (isAwaitingApproval) return;

    const next = items.map((item) => ({ ...item, prepared_quantity: item.quantity, completed: true }));

    setItems(next);

    try {
      await Promise.all(
        next
          .filter((row) => !!row.id)
          .map((row) =>
            supabase
              .from('rental_preparation_items')
              .update({ prepared_quantity: row.quantity, completed: true })
              .eq('id', row.id),
          ),
      );
    } catch (error) {
      console.error('mobile prep markAll', error);
    }
  };

  const finalize = async () => {
    if (isAwaitingApproval) return;
    if (!prep) return;

    try {
      await supabase.from('rental_preparation').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', prep.id);
      await supabase.from('rentals').update({ status: 'in_progress' }).eq('id', prep.rental_id);
      navigate('/m/preparations');
    } catch (error) {
      console.error('mobile prep finalize', error);
    }
  };

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Préparation</h1>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: accent }} />
          </div>
        ) : (
          <div className="space-y-3">
            {isAwaitingApproval && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
                Prestation en attente de validation. La préparation est verrouillée.
              </div>
            )}

            <div className="flex items-center justify-end">
              <button
                onClick={handleScanToggle}
                disabled={isAwaitingApproval}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors dark:border-gray-700 ${
                  isAwaitingApproval
                    ? 'border-gray-200 text-gray-400 cursor-not-allowed dark:border-gray-700 dark:text-gray-500'
                    : scanPanelOpen
                      ? 'border-blue-500 text-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-100'
                      : 'border-blue-300 text-blue-600 active:bg-blue-100 dark:border-blue-600/70 dark:text-blue-200 dark:active:bg-blue-950/60'
                }`}
              >
                <Scan className="h-4 w-4" />
                Scan
              </button>
            </div>

            {scanPanelOpen && (
              <div className="space-y-4 rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-slate-900/70">
                <div className="space-y-2">
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Scanner un QR code matériel</h4>
                    <p className="text-xs text-blue-700 dark:text-blue-200">
                      {isOverlayActive && scanState.message ? scanState.message : 'Placez le QR code dans le cadre carré.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {scannerRunning ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
                        <span className="inline-flex h-2 w-2 animate-ping rounded-full bg-blue-600" />
                        Scan en cours
                      </span>
                    ) : (
                      <button
                        onClick={handleResetScan}
                        disabled={isOverlayActive && scanState.status === 'pending'}
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium ${
                          isOverlayActive && scanState.status === 'pending'
                            ? 'border-gray-200 text-gray-400 cursor-not-allowed dark:border-gray-700 dark:text-gray-500'
                            : 'border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-900/40'
                        }`}
                      >
                        <RefreshCcw className="h-4 w-4" />
                        Relancer
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
                  <video ref={videoRef} className="h-full w-full object-cover opacity-80" playsInline autoPlay muted />
                  <div className="pointer-events-none absolute inset-[12%] rounded-xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />

                  {isOverlayActive && (
                    <div className={`absolute inset-0 flex items-center justify-center px-4 text-white ${overlayBg} backdrop-blur-sm`}>
                      {scanState.status === 'pending' && scannedItem ? (
                        <div className="w-full max-w-sm rounded-2xl bg-white/95 p-5 text-gray-900 shadow-xl space-y-4 dark:bg-slate-900/95 dark:text-blue-50">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-blue-200/70">Matériel</p>
                            <p className="text-lg font-semibold">{scannedItem.equipment_name}</p>
                            <p className="text-xs text-gray-500 dark:text-blue-200/70">{scannedItem.equipment_type}</p>
                          </div>

                          {isSerialScan ? (
                            <>
                              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-500/40 dark:bg-green-900/20">
                                <p className="text-xs uppercase tracking-wide text-green-700 dark:text-green-200">Numéro de suivi</p>
                                <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                                  {scannedUnit?.serial_number || scannedUnitId || 'Inconnu'}
                                </p>
                              </div>
                              <p className="text-xs text-center text-gray-600 dark:text-blue-200/70">
                                Préparé&nbsp;: {scannedItem.prepared_quantity} / {scannedItem.quantity}
                              </p>
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <button
                                  onClick={handleConfirmScanned}
                                  className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-green-700"
                                >
                                  Valider ce numéro
                                </button>
                                <button
                                  onClick={handleResetScan}
                                  className="rounded-full border border-green-200 px-4 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-400 dark:text-green-200 dark:hover:bg-green-900/30"
                                >
                                  Scanner un autre
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-center gap-4">
                                <button
                                  onClick={() => stepScannedQuantity(-1)}
                                  disabled={scannedQuantity <= 0}
                                  className={`h-12 w-12 rounded-full border text-2xl font-semibold ${
                                    scannedQuantity <= 0
                                      ? 'border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600'
                                      : 'border-green-400 text-green-700 hover:bg-green-50 dark:border-green-400 dark:text-green-200 dark:hover:bg-green-900/30'
                                  }`}
                                >
                                  –
                                </button>
                                <div className="text-4xl font-bold tabular-nums text-gray-900">{scannedQuantity}</div>
                                <button
                                  onClick={() => stepScannedQuantity(1)}
                                  disabled={scannedQuantity >= scannedItem.quantity}
                                  className={`h-12 w-12 rounded-full border text-2xl font-semibold ${
                                    scannedQuantity >= scannedItem.quantity
                                      ? 'border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600'
                                      : 'border-green-400 text-green-700 hover:bg-green-50 dark:border-green-400 dark:text-green-200 dark:hover:bg-green-900/30'
                                  }`}
                                >
                                  +
                                </button>
                              </div>
                              <p className="text-xs text-center text-gray-600 dark:text-blue-200/70">
                                Préparé&nbsp;: {scannedItem.prepared_quantity} / {scannedItem.quantity}
                              </p>
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <button
                                  onClick={() => handleScannedQuantityChange(scannedItem.quantity)}
                                  className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-blue-100 dark:hover:bg-gray-800"
                                >
                                  Quantité complète
                                </button>
                                <button
                                  onClick={handleConfirmScanned}
                                  className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-green-700"
                                >
                                  Valider
                                </button>
                                <button
                                  onClick={handleResetScan}
                                  className="rounded-full border border-green-200 px-4 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-400 dark:text-green-200 dark:hover:bg-green-900/30"
                                >
                                  Scanner un autre
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : scanState.status === 'complete' && scannedItem ? (
                        <div className="w-full max-w-xs rounded-2xl bg-white/95 p-5 text-center text-gray-900 shadow-xl space-y-3 dark:bg-slate-900/95 dark:text-blue-50">
                          <p className="text-sm font-semibold">Déjà validé</p>
                          <p className="text-xs text-gray-600 dark:text-blue-200/70">
                            {isSerialScan
                              ? `Le numéro ${scannedUnit?.serial_number || scannedUnitId} est déjà compté.`
                              : `${scannedItem.equipment_name} est déjà préparé (${scannedItem.prepared_quantity}/${scannedItem.quantity}).`}
                          </p>
                          <button
                            onClick={handleResetScan}
                            className="rounded-full border border-amber-300 px-4 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-400 dark:text-amber-200 dark:hover:bg-amber-900/30"
                          >
                            Scanner un autre matériel
                          </button>
                        </div>
                      ) : (
                        <div className="w-full max-w-xs rounded-2xl bg-white/95 p-5 text-center text-gray-900 shadow-xl space-y-3 dark:bg-slate-900/95 dark:text-blue-50">
                          <p className="text-sm font-semibold">QR non reconnu</p>
                          <p className="text-xs text-gray-600 dark:text-blue-200/70">{scanState.message}</p>
                          {scannedCode && (
                            <p className="break-all text-[11px] font-mono text-gray-500 dark:text-blue-200/70">{scannedCode}</p>
                          )}
                          <button
                            onClick={handleResetScan}
                            className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-400 dark:text-red-200 dark:hover:bg-red-900/30"
                          >
                            Réessayer
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isOverlayActive && scanMessage && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {scanMessage}
                  </div>
                )}
              </div>
            )}

            {!scanPanelOpen && (
              <div className={`${isAwaitingApproval ? 'opacity-50 pointer-events-none' : ''} space-y-2`}>
                {items.map((row) => {
                  const serialTracked = serialEquipmentIds.has(row.equipment_id);
                  return (
                    <div
                      key={row.id}
                      className="p-3 flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">{row.equipment_name}</div>
                        <div className="text-xs text-gray-500">{row.equipment_type}</div>
                        {serialTracked && (
                          <div className="mt-1 text-[11px] font-medium text-blue-700 dark:text-blue-200">
                            Suivi précis actif: scan QR unitaire optionnel
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-2 py-1 rounded border dark:border-gray-700 dark:bg-gray-800/80 dark:text-white"
                          onClick={() => updateItem(row, row.prepared_quantity - 1)}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={row.prepared_quantity}
                          min={0}
                          max={row.quantity}
                          onChange={(event) => updateItem(row, Number(event.target.value))}
                          className="w-16 rounded-md border-gray-300 text-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-white"
                        />
                        <button
                          className="px-2 py-1 rounded border dark:border-gray-700 dark:bg-gray-800/80 dark:text-white"
                          onClick={() => updateItem(row, row.prepared_quantity + 1)}
                        >
                          +
                        </button>
                        <span className="text-sm text-gray-600">/ {row.quantity}</span>
                        {row.completed && <Check className="h-4 w-4" style={{ color: accent }} />}
                      </div>
                    </div>
                  );
                })}

                {items.length === 0 && (
                  <div className="p-3 text-sm text-gray-500 rounded-lg border border-gray-200 dark:border-gray-700">Aucun matériel</div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={markAll}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800/70"
                    disabled={isAwaitingApproval}
                  >
                    Tout préparer
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={finalize}
              disabled={!allDone || isAwaitingApproval}
              className={`w-full py-3 rounded-md text-white ${allDone && !isAwaitingApproval ? '' : 'opacity-50'}`}
              style={{ background: accent }}
            >
              Valider
            </button>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default MobilePreparationDetail;
