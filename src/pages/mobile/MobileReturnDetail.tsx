import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MobileLayout from './MobileLayout';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Check, Scan, RefreshCcw, ShieldAlert } from 'lucide-react';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import jsQR from 'jsqr';
import {
  type EquipmentUnitRecord,
  fetchEquipmentUnitByCode,
  insertEquipmentUnitActivityLog,
  insertReturnUnitScanLog,
  loadCountedReturnUnitIds,
  loadSerialTrackingContextForReturn,
  parseEquipmentQrPayload,
} from '../../utils/equipmentUnitTracking';

type ReturnItem = {
  id?: string;
  equipment_id: string | null;
  equipment_name: string;
  equipment_type: string;
  expected_quantity: number;
  returned_quantity: number;
};

const MobileReturnDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useCompanySettings();
  const accent = useMemo(() => settings?.accent_color || '#2563eb', [settings]);

  const [loading, setLoading] = useState(true);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [finalizing, setFinalizing] = useState(false);

  const [serialEquipmentIds, setSerialEquipmentIds] = useState<Set<string>>(new Set());
  const [expectedUnitsById, setExpectedUnitsById] = useState<Record<string, EquipmentUnitRecord>>({});
  const [countedReturnUnitIds, setCountedReturnUnitIds] = useState<Set<string>>(new Set());

  const [scanPanelOpen, setScanPanelOpen] = useState(false);
  const [scannerRunning, setScannerRunning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scannedEquipmentId, setScannedEquipmentId] = useState<string | null>(null);
  const [scannedUnitId, setScannedUnitId] = useState<string | null>(null);
  const [scannedQuantity, setScannedQuantity] = useState<number>(0);
  const [isFallbackScanner, setIsFallbackScanner] = useState(false);

  const [forceAllowed, setForceAllowed] = useState(false);
  const [forceUnit, setForceUnit] = useState<EquipmentUnitRecord | null>(null);
  const [forceItemId, setForceItemId] = useState<string | null>(null);

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
          .select('status, type')
          .eq('id', id)
          .maybeSingle();

        const currentStatus = (rentalRow as any)?.status ?? null;
        const currentType = (rentalRow as any)?.type ?? null;

        if (currentStatus === 'delivered') {
          try {
            await supabase.from('rentals').update({ status: 'in_return' }).eq('id', id);
          } catch {
            // Non-blocking
          }
        }

        let retId: string | null = null;
        const { data: existingReturn } = await supabase
          .from('rental_returns')
          .select('id, status')
          .eq('rental_id', id)
          .maybeSingle();

        if (existingReturn && existingReturn.id) {
          retId = existingReturn.id;
          if (existingReturn.status !== 'in_progress') {
            await supabase.from('rental_returns').update({ status: 'in_progress', completed_at: null }).eq('id', retId);
          }
        } else {
          const { data: created } = await supabase
            .from('rental_returns')
            .insert([{ rental_id: id, status: 'in_progress' }])
            .select('id')
            .single();
          retId = created?.id ?? null;
        }

        setReturnId(retId);

        let resolvedItems: ReturnItem[] = [];
        const { data: existingItems } = await supabase
          .from('rental_return_items')
          .select('*')
          .eq('return_id', retId!);

        if (existingItems && existingItems.length) {
          resolvedItems = existingItems as ReturnItem[];
        } else {
          const externalLabel = currentType === 'sale' ? 'Achat matériel' : 'Sous-location';
          const { data: rentalItems } = await supabase
            .from('rental_items')
            .select('equipment_id, quantity, is_external, external_name, external_type, external_subtype, equipment:equipment(name, type)')
            .eq('rental_id', id);

          const seed = (rentalItems || []).map((ri: any) => ({
            return_id: retId!,
            equipment_id: ri.equipment_id,
            equipment_name: ri.is_external ? (ri.external_name || externalLabel) : (ri.equipment?.name || 'Équipement'),
            equipment_type: ri.is_external
              ? ([ri.external_type, ri.external_subtype].filter(Boolean).join(' / ') || externalLabel)
              : (ri.equipment?.type || '-'),
            expected_quantity: ri.quantity || 0,
            returned_quantity: 0,
          }));

          if (seed.length) {
            const { data: seeded } = await supabase.from('rental_return_items').insert(seed).select('*');
            resolvedItems = (seeded as ReturnItem[]) || [];
          }
        }

        setItems(resolvedItems);

        const equipmentIds = Array.from(
          new Set(
            resolvedItems
              .map((row) => row.equipment_id)
              .filter((equipmentId): equipmentId is string => typeof equipmentId === 'string' && equipmentId.length > 0),
          ),
        );

        const tracking = await loadSerialTrackingContextForReturn(id, equipmentIds);
        setSerialEquipmentIds(tracking.serialEquipmentIds);
        setExpectedUnitsById(tracking.expectedUnitsById);

        const countedSet = await loadCountedReturnUnitIds(retId);
        setCountedReturnUnitIds(countedSet);

        if (tracking.serialEquipmentIds.size > 0 && resolvedItems.length > 0) {
          const countedByEquipment = new Map<string, number>();
          countedSet.forEach((unitId) => {
            const unit = tracking.expectedUnitsById[unitId];
            if (!unit) return;
            countedByEquipment.set(unit.equipment_id, (countedByEquipment.get(unit.equipment_id) || 0) + 1);
          });

          const synced = resolvedItems.map((row) => {
            const equipmentId = row.equipment_id || '';
            if (!tracking.serialEquipmentIds.has(equipmentId)) return row;
            const counted = Math.min(row.expected_quantity, countedByEquipment.get(equipmentId) || 0);
            return {
              ...row,
              returned_quantity: counted,
            };
          });

          setItems(synced);

          await Promise.all(
            synced
              .filter((row) => !!row.id && row.equipment_id && tracking.serialEquipmentIds.has(row.equipment_id))
              .map((row) =>
                supabase
                  .from('rental_return_items')
                  .update({ returned_quantity: row.returned_quantity })
                  .eq('id', row.id as string),
              ),
          );
        }
      } catch (error) {
        console.error('mobile return init', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const pendingCount = useMemo(
    () => items.reduce((sum, row) => sum + Math.max(0, row.expected_quantity - row.returned_quantity), 0),
    [items],
  );

  const scannedItem = useMemo(
    () => items.find((item) => item.equipment_id && item.equipment_id === scannedEquipmentId) || null,
    [items, scannedEquipmentId],
  );

  const scannedUnit = scannedUnitId ? expectedUnitsById[scannedUnitId] ?? null : null;
  const isSerialScan = !!scannedItem?.equipment_id && serialEquipmentIds.has(scannedItem.equipment_id) && !!scannedUnitId;

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

  const logReturnScan = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!returnId || !id) return;
      await insertReturnUnitScanLog({
        return_id: returnId,
        rental_id: id,
        ...payload,
      });
    },
    [id, returnId],
  );

  const clearForceState = () => {
    setForceAllowed(false);
    setForceUnit(null);
    setForceItemId(null);
  };

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
      clearForceState();

      const parsed = parseEquipmentQrPayload(normalized);

      if (parsed.kind === 'equipment' && parsed.id) {
        const equipmentId = parsed.id;
        const match = items.find((item) => item.equipment_id === equipmentId) ?? null;

        if (!match) {
          setScanError('Matériel introuvable pour ce retour.');
          await logReturnScan({
            scan_result: 'unknown_code',
            scanned_code: normalized,
            counted: false,
            error_message: 'QR matériel absent du retour',
          });
          return;
        }

        if (serialEquipmentIds.has(equipmentId)) {
          setScanError('Retour précis requis: scannez le numéro de suivi unitaire exact.');
          await logReturnScan({
            scan_result: 'wrong_code_type',
            scanned_code: normalized,
            equipment_id: equipmentId,
            expected_equipment_id: equipmentId,
            counted: false,
            error_message: 'QR équipement scanné au lieu du QR unitaire',
          });
          return;
        }

        setScannedEquipmentId(match.equipment_id);
        return;
      }

      const unit = await fetchEquipmentUnitByCode(normalized);

      if (!unit) {
        setScanError('QR code unitaire inconnu.');
        await logReturnScan({
          scan_result: 'unknown_code',
          scanned_code: normalized,
          counted: false,
          error_message: 'QR unitaire introuvable',
        });
        return;
      }

      const matchingItem = items.find((row) => row.equipment_id === unit.equipment_id) || null;
      const expectedUnit = expectedUnitsById[unit.id] || null;

      if (matchingItem && matchingItem.equipment_id && serialEquipmentIds.has(matchingItem.equipment_id)) {
        if (!expectedUnit) {
          setScanError('Ce numéro de suivi n’est pas celui attendu pour cette prestation.');
          setScannedUnitId(unit.id);

          await logReturnScan({
            scan_result: 'not_prepared',
            scanned_code: normalized,
            equipment_id: unit.equipment_id,
            equipment_unit_id: unit.id,
            expected_equipment_id: matchingItem.equipment_id,
            return_item_id: matchingItem.id,
            counted: false,
            error_message: 'Numéro non préparé / non attendu au retour',
          });

          await insertEquipmentUnitActivityLog({
            equipment_unit_id: unit.id,
            equipment_id: unit.equipment_id,
            rental_id: id,
            event_type: 'return_scan_rejected',
            severity: 'warning',
            source: 'mobile_return',
            message: 'Scan retour rejeté: numéro non attendu',
            payload: {
              return_id: returnId,
              scanned_code: normalized,
            },
          });

          setForceAllowed(true);
          setForceUnit(unit);
          setForceItemId(matchingItem.id || null);
          return;
        }

        setScannedEquipmentId(matchingItem.equipment_id);
        setScannedUnitId(unit.id);

        if (countedReturnUnitIds.has(unit.id)) {
          await logReturnScan({
            scan_result: 'duplicate',
            scanned_code: normalized,
            equipment_id: unit.equipment_id,
            equipment_unit_id: unit.id,
            expected_equipment_id: matchingItem.equipment_id,
            return_item_id: matchingItem.id,
            counted: false,
            error_message: 'Unité déjà comptabilisée au retour',
          });
        }

        return;
      }

      if (matchingItem) {
        setScannedEquipmentId(matchingItem.equipment_id || null);
        setScannedUnitId(unit.id);
        return;
      }

      setScanError('Ce matériel ne fait pas partie de cette prestation.');
      setScannedUnitId(unit.id);

      await logReturnScan({
        scan_result: 'wrong_equipment',
        scanned_code: normalized,
        equipment_id: unit.equipment_id,
        equipment_unit_id: unit.id,
        counted: false,
        error_message: 'Matériel non présent sur ce retour',
      });
    },
    [countedReturnUnitIds, expectedUnitsById, id, items, logReturnScan, returnId, serialEquipmentIds, stopScanner],
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
            console.error('QR detect', error);
            runFallbackLoop();
          }
        };

        scanFrameRef.current = requestAnimationFrame(firstDetect);
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
    if (scanPanelOpen && !scannerRunning && !scannedEquipmentId && !scanError) {
      void startScanner();
    }
  }, [scanError, scanPanelOpen, scannedEquipmentId, scannerRunning, startScanner]);

  useEffect(() => {
    if (!scanPanelOpen) {
      stopScanner();
    }
  }, [scanPanelOpen, stopScanner]);

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  useEffect(() => {
    if (!scannedItem) {
      setScannedQuantity(0);
      return;
    }

    if (scannedItem.equipment_id && serialEquipmentIds.has(scannedItem.equipment_id)) {
      setScannedQuantity(1);
      return;
    }

    const nextValue = Math.min(scannedItem.expected_quantity, scannedItem.returned_quantity + 1);
    setScannedQuantity(nextValue);
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
    clearForceState();
  }, [stopScanner]);

  const handleScanToggle = () => {
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
    const clamped = Math.max(0, Math.min(scannedItem.expected_quantity, safe));
    setScannedQuantity(clamped);
  };

  const stepScannedQuantity = (delta: number) => {
    if (!scannedItem) return;
    handleScannedQuantityChange(scannedQuantity + delta);
  };

  const updateItem = async (row: ReturnItem, value: number, options?: { allowSerialManual?: boolean }) => {
    if (!returnId || !row.id) return;

    const equipmentId = row.equipment_id || '';
    if (serialEquipmentIds.has(equipmentId) && !options?.allowSerialManual) return;

    const returnedQuantity = Math.max(0, Math.min(row.expected_quantity, value));

    setItems((prev) => prev.map((item) => (item.id === row.id ? { ...item, returned_quantity: returnedQuantity } : item)));

    try {
      await supabase.from('rental_return_items').update({ returned_quantity: returnedQuantity }).eq('id', row.id);
    } catch (error) {
      console.error('mobile return update item', error);
    }
  };

  const handleConfirmScanned = async () => {
    if (!scannedItem || !id) return;

    if (isSerialScan) {
      if (!scannedUnitId) return;

      if (countedReturnUnitIds.has(scannedUnitId)) {
        setScanMessage('Ce numéro de suivi a déjà été comptabilisé.');
        setScannedEquipmentId(null);
        setScannedUnitId(null);
        setScannedCode(null);
        return;
      }

      const nextQuantity = Math.min(scannedItem.expected_quantity, scannedItem.returned_quantity + 1);
      if (nextQuantity <= scannedItem.returned_quantity) {
        setScanMessage('La ligne de retour est déjà complète.');
        return;
      }

      await updateItem(scannedItem, nextQuantity, { allowSerialManual: true });
      setCountedReturnUnitIds((prev) => {
        const next = new Set(prev);
        next.add(scannedUnitId);
        return next;
      });

      await logReturnScan({
        scan_result: 'accepted',
        scanned_code: scannedCode,
        equipment_id: scannedItem.equipment_id,
        equipment_unit_id: scannedUnitId,
        expected_equipment_id: scannedItem.equipment_id,
        return_item_id: scannedItem.id,
        counted: true,
        forced: false,
        metadata: {
          serial_number: scannedUnit?.serial_number || null,
          returned_quantity_before: scannedItem.returned_quantity,
          returned_quantity_after: nextQuantity,
        },
      });

      await insertEquipmentUnitActivityLog({
        equipment_unit_id: scannedUnitId,
        equipment_id: scannedItem.equipment_id,
        rental_id: id,
        event_type: 'return_scan_accepted',
        severity: 'info',
        source: 'mobile_return',
        message: 'Unité validée au retour (mobile)',
        payload: {
          return_id: returnId,
          return_item_id: scannedItem.id,
          scanned_code: scannedCode,
          serial_number: scannedUnit?.serial_number || null,
        },
      });

      setScanMessage(`Retour validé pour ${scannedUnit?.serial_number || scannedUnitId}.`);
      setScannedEquipmentId(null);
      setScannedUnitId(null);
      setScannedCode(null);
      setScannedQuantity(0);
      clearForceState();
      return;
    }

    await updateItem(scannedItem, scannedQuantity);

    await logReturnScan({
      scan_result: 'accepted',
      scanned_code: scannedCode,
      equipment_id: scannedItem.equipment_id,
      expected_equipment_id: scannedItem.equipment_id,
      return_item_id: scannedItem.id,
      counted: true,
      forced: false,
      metadata: {
        quantity_validated: scannedQuantity,
      },
    });

    setScanMessage('Quantité mise à jour. Prêt pour le prochain scan.');
    setScanError(null);
    setScannedEquipmentId(null);
    setScannedCode(null);
    setScannedQuantity(0);
    clearForceState();
  };

  const handleForceValidate = async () => {
    if (!forceAllowed || !forceUnit || !forceItemId || !id) return;

    const targetItem = items.find((item) => item.id === forceItemId) || null;
    if (!targetItem) {
      setScanError('Impossible de forcer: ligne de retour introuvable.');
      return;
    }

    const nextQuantity = Math.min(targetItem.expected_quantity, targetItem.returned_quantity + 1);
    const counted = nextQuantity > targetItem.returned_quantity;

    if (counted) {
      await updateItem(targetItem, nextQuantity, { allowSerialManual: true });
      setCountedReturnUnitIds((prev) => {
        const next = new Set(prev);
        next.add(forceUnit.id);
        return next;
      });
    }

    await logReturnScan({
      scan_result: 'forced_accept',
      scanned_code: scannedCode,
      equipment_id: targetItem.equipment_id,
      equipment_unit_id: forceUnit.id,
      expected_equipment_id: targetItem.equipment_id,
      return_item_id: targetItem.id,
      counted,
      forced: true,
      error_message: 'Validation forcée malgré numéro inattendu',
      metadata: {
        serial_number: forceUnit.serial_number,
        returned_quantity_before: targetItem.returned_quantity,
        returned_quantity_after: counted ? nextQuantity : targetItem.returned_quantity,
      },
    });

    await insertEquipmentUnitActivityLog({
      equipment_unit_id: forceUnit.id,
      equipment_id: forceUnit.equipment_id,
      rental_id: id,
      event_type: 'return_scan_forced',
      severity: 'warning',
      source: 'mobile_return',
      message: 'Validation forcée au retour',
      payload: {
        return_id: returnId,
        return_item_id: targetItem.id,
        scanned_code: scannedCode,
        serial_number: forceUnit.serial_number,
      },
    });

    setScanMessage('Retour validé en mode forcé.');
    setScanError(null);
    setScannedEquipmentId(null);
    setScannedUnitId(null);
    setScannedCode(null);
    setScannedQuantity(0);
    clearForceState();
  };

  const markAll = async () => {
    const next = items.map((row) => {
      if (row.equipment_id && serialEquipmentIds.has(row.equipment_id)) return row;
      return { ...row, returned_quantity: row.expected_quantity };
    });

    setItems(next);

    try {
      await Promise.all(
        next
          .filter((row) => !!row.id && (!row.equipment_id || !serialEquipmentIds.has(row.equipment_id)))
          .map((row) =>
            supabase
              .from('rental_return_items')
              .update({ returned_quantity: row.expected_quantity })
              .eq('id', row.id as string),
          ),
      );

      if (next.some((row) => row.equipment_id && serialEquipmentIds.has(row.equipment_id))) {
        setScanMessage('Les matériels suivis par numéro doivent être validés par scan.');
      }
    } catch (error) {
      console.error('mobile return markAll', error);
    }
  };

  const finalize = async () => {
    if (!returnId || finalizing || !id) return;

    const missing = pendingCount;
    if (missing > 0) {
      const confirm = window.confirm(`Il manque encore ${missing} article(s). Valider quand même le retour ?`);
      if (!confirm) return;
    }

    setFinalizing(true);

    try {
      const nowIso = new Date().toISOString();
      await supabase.from('rental_returns').update({ status: 'completed', completed_at: nowIso }).eq('id', returnId);
      await supabase
        .from('rentals')
        .update({
          status: missing > 0 ? 'in_return' : 'returned',
          returned_at: missing > 0 ? null : nowIso,
        })
        .eq('id', id);
      navigate('/m/retours');
    } catch (error) {
      console.error('mobile return finalize', error);
    } finally {
      setFinalizing(false);
    }
  };

  const scanState = useMemo(() => {
    if (scanError) return { status: 'error' as const, message: scanError };

    if (scannedItem) {
      if (isSerialScan && scannedUnitId && countedReturnUnitIds.has(scannedUnitId)) {
        return { status: 'complete' as const, message: 'Ce numéro de suivi est déjà comptabilisé au retour.' };
      }
      if (scannedItem.returned_quantity >= scannedItem.expected_quantity) {
        return { status: 'complete' as const, message: 'Matériel déjà revenu.' };
      }
      if (isSerialScan) {
        return { status: 'pending' as const, message: `Retour unitaire: ${scannedItem.equipment_name}` };
      }
      return { status: 'pending' as const, message: 'Quantité à enregistrer.' };
    }

    if (scannedCode && !scannedItem) {
      return { status: 'error' as const, message: 'Matériel non reconnu.' };
    }

    return { status: null, message: null } as const;
  }, [countedReturnUnitIds, isSerialScan, scanError, scannedCode, scannedItem, scannedUnitId]);

  const isOverlayActive = scanState.status !== null;
  const overlayBgByStatus: Record<'error' | 'complete' | 'pending', string> = {
    error: 'bg-red-600/70',
    complete: 'bg-amber-500/75',
    pending: 'bg-green-600/70',
  };
  const overlayBg = scanState.status ? overlayBgByStatus[scanState.status] : '';

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Retour</h1>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: accent }} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-600 dark:text-gray-300">
                {pendingCount > 0 ? `${pendingCount} article(s) manquant(s).` : 'Tout est revenu.'}
              </div>
              {items.length > 0 && (
                <button
                  onClick={markAll}
                  className="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800/70"
                >
                  Tout est revenu (hors suivi)
                </button>
              )}
            </div>

            <div className="flex items-center justify-end">
              <button
                onClick={handleScanToggle}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors dark:border-gray-700 ${
                  scanPanelOpen
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
                                Revenu&nbsp;: {scannedItem.returned_quantity} / {scannedItem.expected_quantity}
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
                                  disabled={scannedQuantity >= scannedItem.expected_quantity}
                                  className={`h-12 w-12 rounded-full border text-2xl font-semibold ${
                                    scannedQuantity >= scannedItem.expected_quantity
                                      ? 'border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600'
                                      : 'border-green-400 text-green-700 hover:bg-green-50 dark:border-green-400 dark:text-green-200 dark:hover:bg-green-900/30'
                                  }`}
                                >
                                  +
                                </button>
                              </div>
                              <p className="text-xs text-center text-gray-600 dark:text-blue-200/70">
                                Revenu&nbsp;: {scannedItem.returned_quantity} / {scannedItem.expected_quantity}
                              </p>
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <button
                                  onClick={() => handleScannedQuantityChange(scannedItem.expected_quantity)}
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
                          <p className="text-sm font-semibold">Déjà revenu</p>
                          <p className="text-xs text-gray-600 dark:text-blue-200/70">
                            {isSerialScan
                              ? `Le numéro ${scannedUnit?.serial_number || scannedUnitId} est déjà compté.`
                              : `${scannedItem.equipment_name} est déjà revenu (${scannedItem.returned_quantity}/${scannedItem.expected_quantity}).`}
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
                          <p className="text-sm font-semibold">QR en anomalie</p>
                          <p className="text-xs text-gray-600 dark:text-blue-200/70">{scanState.message}</p>
                          {scannedCode && (
                            <p className="break-all text-[11px] font-mono text-gray-500 dark:text-blue-200/70">{scannedCode}</p>
                          )}
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {forceAllowed && forceUnit && (
                              <button
                                onClick={handleForceValidate}
                                className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                              >
                                <ShieldAlert className="h-3.5 w-3.5" />
                                Valider quand même
                              </button>
                            )}
                            <button
                              onClick={handleResetScan}
                              className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-400 dark:text-red-200 dark:hover:bg-red-900/30"
                            >
                              Réessayer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isOverlayActive && scanMessage && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-600/50 dark:bg-green-950/40 dark:text-green-200">
                    {scanMessage}
                  </div>
                )}
              </div>
            )}

            {!scanPanelOpen && (
              <div className="space-y-2">
                {items.map((row) => {
                  const remaining = Math.max(0, row.expected_quantity - row.returned_quantity);
                  const serialTracked = !!row.equipment_id && serialEquipmentIds.has(row.equipment_id);
                  return (
                    <div key={row.id || row.equipment_id} className="p-3 flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{row.equipment_name}</div>
                        <div className="text-xs text-gray-500">{row.equipment_type}</div>
                        {remaining > 0 && <div className="text-xs text-orange-600 mt-1 dark:text-orange-300">Manque {remaining}</div>}
                        {serialTracked && (
                          <div className="mt-1 text-[11px] font-medium text-blue-700 dark:text-blue-200">
                            Suivi précis actif: scan QR unitaire obligatoire
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-2 py-1 rounded border dark:border-gray-700 dark:bg-gray-800/80 dark:text-white"
                          onClick={() => updateItem(row, row.returned_quantity - 1)}
                          disabled={serialTracked}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={row.returned_quantity}
                          min={0}
                          max={row.expected_quantity}
                          onChange={(event) => updateItem(row, Number(event.target.value))}
                          readOnly={serialTracked}
                          className="w-16 rounded-md border-gray-300 text-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-white"
                        />
                        <button
                          className="px-2 py-1 rounded border dark:border-gray-700 dark:bg-gray-800/80 dark:text-white"
                          onClick={() => updateItem(row, row.returned_quantity + 1)}
                          disabled={serialTracked}
                        >
                          +
                        </button>
                        <span className="text-sm text-gray-600 dark:text-gray-300">/ {row.expected_quantity}</span>
                        {row.returned_quantity >= row.expected_quantity && <Check className="h-4 w-4" style={{ color: accent }} />}
                      </div>
                    </div>
                  );
                })}

                {items.length === 0 && (
                  <div className="p-3 text-sm text-gray-500 rounded-lg border border-gray-200 dark:border-gray-700">Aucun matériel</div>
                )}
              </div>
            )}

            <button
              onClick={finalize}
              disabled={items.length === 0 || finalizing}
              className={`w-full py-3 rounded-md text-white ${items.length === 0 ? 'opacity-50' : ''}`}
              style={{ background: accent }}
            >
              {finalizing ? 'Validation...' : 'Valider le retour'}
            </button>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default MobileReturnDetail;
