import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Scan, RefreshCcw, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { Rental } from '../../types/rental';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
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

type ReturnMode = 'new' | 'reopen';

type ReturnModalProps = {
  isOpen: boolean;
  rental: Rental;
  onClose: () => void;
  onCompleted?: (payload: { returnId: string; completedAt: string; items: ReturnItemState[]; missingCount: number }) => Promise<void> | void;
  mode?: ReturnMode;
};

type ReturnItemState = {
  id?: string;
  equipment_id: string | null;
  equipment_name: string;
  equipment_type: string;
  expected_quantity: number;
  returned_quantity: number;
  notes?: string | null;
};

// ─── helpers ────────────────────────────────────────────────────────────────

async function loadFallbackUnitsForEquipment(
  equipmentIds: string[],
): Promise<EquipmentUnitRecord[]> {
  if (equipmentIds.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from('equipment_units')
    .select('id, equipment_id, serial_number, qr_code_value, qr_code_url, status')
    .in('equipment_id', equipmentIds);
  if (error) {
    console.error('loadFallbackUnitsForEquipment', error);
    return [];
  }
  return (data || []) as EquipmentUnitRecord[];
}

// ─── component ───────────────────────────────────────────────────────────────

const ReturnModal: React.FC<ReturnModalProps> = ({ isOpen, rental, onClose, onCompleted, mode = 'new' }) => {
  const [loading, setLoading] = useState(true);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [items, setItems] = useState<ReturnItemState[]>([]);
  const [finalizing, setFinalizing] = useState(false);

  // serial tracking
  const [serialEquipmentIds, setSerialEquipmentIds] = useState<Set<string>>(new Set());
  const [expectedUnitsById, setExpectedUnitsById] = useState<Record<string, EquipmentUnitRecord>>({});
  const [unitsByEquipmentId, setUnitsByEquipmentId] = useState<Record<string, EquipmentUnitRecord[]>>({});
  const [countedReturnUnitIds, setCountedReturnUnitIds] = useState<Set<string>>(new Set());
  // which serial items have their unit list expanded
  const [expandedSerialItems, setExpandedSerialItems] = useState<Set<string>>(new Set());

  // scanner
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

  // ── init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      setLoading(true);
      try {
        // push rental status to in_return if needed
        if (['delivered', 'in_progress', 'completed'].includes(rental.status)) {
          await (supabase as any).from('rentals').update({ status: 'in_return' }).eq('id', rental.id);
        }

        // create or reopen return record
        let retId: string | null = null;
        const { data: existingReturn, error: existingError } = await (supabase as any)
          .from('rental_returns')
          .select('id, status')
          .eq('rental_id', rental.id)
          .maybeSingle();
        if (existingError) throw existingError;

        if (existingReturn?.id) {
          retId = existingReturn.id;
          const reopenNeeded =
            mode === 'reopen' && existingReturn.status === 'completed';
          if (reopenNeeded || existingReturn.status === 'pending') {
            await (supabase as any)
              .from('rental_returns')
              .update({ status: 'in_progress', completed_at: null })
              .eq('id', existingReturn.id);
          }
        } else {
          const { data: created, error: createError } = await (supabase as any)
            .from('rental_returns')
            .insert([{ rental_id: rental.id, status: 'in_progress' }])
            .select('id')
            .single();
          if (createError) throw createError;
          retId = created.id;
        }

        setReturnId(retId);

        // load / seed return items
        let resolvedItems: ReturnItemState[] = [];
        const { data: existingItems, error: existingItemsError } = await (supabase as any)
          .from('rental_return_items')
          .select('*')
          .eq('return_id', retId!);
        if (existingItemsError) throw existingItemsError;

        if (existingItems && existingItems.length) {
          resolvedItems = existingItems as ReturnItemState[];
        } else {
          const seed = (rental.items || []).map((item) => ({
            return_id: retId!,
            equipment_id: item.equipment_id,
            equipment_name: item.equipment_name,
            equipment_type: item.equipment_type,
            expected_quantity: item.quantity,
            returned_quantity: 0,
          }));
          if (seed.length > 0) {
            const { data: seeded, error: seedError } = await (supabase as any)
              .from('rental_return_items')
              .insert(seed)
              .select('*');
            if (seedError) throw seedError;
            resolvedItems = (seeded as ReturnItemState[]) || [];
          }
        }

        setItems(resolvedItems);

        const equipmentIds = Array.from(
          new Set(
            resolvedItems
              .map((r) => r.equipment_id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
          ),
        );

        // load serial tracking context (from prep scans)
        const tracking = await loadSerialTrackingContextForReturn(rental.id, equipmentIds);
        const serialIds = tracking.serialEquipmentIds;
        setSerialEquipmentIds(serialIds);

        // Build a merged expectedUnitsById:
        // 1. Start from prep-scan-based expected units
        const mergedById: Record<string, EquipmentUnitRecord> = { ...tracking.expectedUnitsById };
        const mergedByEquipment: Record<string, EquipmentUnitRecord[]> = { ...tracking.expectedUnitsByEquipmentId };

        // 2. For serial equipment that has NO expected units from prep scans,
        //    fall back to all equipment_units of that equipment.
        const missingPrepEquipIds = Array.from(serialIds).filter(
          (id) => !mergedByEquipment[id] || mergedByEquipment[id].length === 0,
        );
        if (missingPrepEquipIds.length > 0) {
          const fallbackUnits = await loadFallbackUnitsForEquipment(missingPrepEquipIds);
          fallbackUnits.forEach((u) => {
            mergedById[u.id] = u;
            if (!mergedByEquipment[u.equipment_id]) mergedByEquipment[u.equipment_id] = [];
            if (!mergedByEquipment[u.equipment_id].some((x) => x.id === u.id)) {
              mergedByEquipment[u.equipment_id].push(u);
            }
          });
        }

        setExpectedUnitsById(mergedById);
        setUnitsByEquipmentId(mergedByEquipment);

        // load already-counted units for this return
        const countedSet = await loadCountedReturnUnitIds(retId);
        setCountedReturnUnitIds(countedSet);

        // sync returned_quantity from counted scans
        if (serialIds.size > 0 && resolvedItems.length > 0) {
          const countedByEquipment = new Map<string, number>();
          countedSet.forEach((unitId) => {
            const unit = mergedById[unitId];
            if (!unit) return;
            countedByEquipment.set(unit.equipment_id, (countedByEquipment.get(unit.equipment_id) || 0) + 1);
          });

          const synced = resolvedItems.map((row) => {
            const eqId = row.equipment_id || '';
            if (!serialIds.has(eqId)) return row;
            const counted = Math.min(row.expected_quantity, countedByEquipment.get(eqId) || 0);
            return { ...row, returned_quantity: counted };
          });
          setItems(synced);

          await Promise.all(
            synced
              .filter((row) => !!row.id && row.equipment_id && serialIds.has(row.equipment_id))
              .map((row) =>
                (supabase as any)
                  .from('rental_return_items')
                  .update({ returned_quantity: row.returned_quantity })
                  .eq('id', row.id as string),
              ),
          );
        }
      } catch (error) {
        console.error('return init', error);
        toast.error('Impossible de charger le retour');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, mode, rental.id, rental.items, rental.status]);

  // ── derived ───────────────────────────────────────────────────────────────

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

  // ── scanner ───────────────────────────────────────────────────────────────

  const stopScanner = useCallback(() => {
    setScannerRunning(false);
    setIsFallbackScanner(false);
    if (scanFrameRef.current !== null) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const logReturnScan = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!returnId) return;
      await insertReturnUnitScanLog({ return_id: returnId, rental_id: rental.id, ...payload });
    },
    [rental.id, returnId],
  );

  const clearForceState = () => {
    setForceAllowed(false);
    setForceUnit(null);
    setForceItemId(null);
  };

  const updateItem = useCallback(
    async (row: ReturnItemState, value: number, opts?: { allowSerialManual?: boolean }) => {
      if (!returnId || !row.id) return;
      const eqId = row.equipment_id || '';
      if (serialEquipmentIds.has(eqId) && !opts?.allowSerialManual) return;
      const qty = Math.max(0, Math.min(row.expected_quantity, value));
      setItems((prev) => prev.map((item) => (item.id === row.id ? { ...item, returned_quantity: qty } : item)));
      await (supabase as any).from('rental_return_items').update({ returned_quantity: qty }).eq('id', row.id);
    },
    [returnId, serialEquipmentIds],
  );

  // Force a specific unit as returned (no QR scan needed)
  const handleForceUnitReturn = useCallback(
    async (unit: EquipmentUnitRecord, item: ReturnItemState) => {
      if (!returnId || countedReturnUnitIds.has(unit.id)) return;

      const nextQty = Math.min(item.expected_quantity, item.returned_quantity + 1);
      if (nextQty <= item.returned_quantity) return; // already at max

      await updateItem(item, nextQty, { allowSerialManual: true });
      setCountedReturnUnitIds((prev) => {
        const next = new Set(prev);
        next.add(unit.id);
        return next;
      });

      await logReturnScan({
        scan_result: 'forced_accept',
        scanned_code: unit.qr_code_value || unit.id,
        equipment_id: unit.equipment_id,
        equipment_unit_id: unit.id,
        expected_equipment_id: item.equipment_id,
        return_item_id: item.id,
        counted: true,
        forced: true,
        error_message: 'Validation forcée sans scan QR',
        metadata: { serial_number: unit.serial_number, via: 'force_button' },
      });

      await insertEquipmentUnitActivityLog({
        equipment_unit_id: unit.id,
        equipment_id: unit.equipment_id,
        rental_id: rental.id,
        event_type: 'return_scan_forced',
        severity: 'warning',
        source: 'ui_return',
        message: 'Retour validé manuellement sans scan QR',
        payload: { return_id: returnId, return_item_id: item.id },
      });
    },
    [returnId, countedReturnUnitIds, updateItem, logReturnScan, rental.id],
  );

  // Force all units of a serial item as returned
  const handleForceAllUnitsForItem = useCallback(
    async (item: ReturnItemState) => {
      if (!item.equipment_id) return;
      const units = unitsByEquipmentId[item.equipment_id] || [];
      const remaining = units.filter((u) => !countedReturnUnitIds.has(u.id));
      const needed = item.expected_quantity - item.returned_quantity;
      const toForce = remaining.slice(0, needed);
      for (const unit of toForce) {
        await handleForceUnitReturn(unit, item);
        // re-read item after each update from state
        item = { ...item, returned_quantity: item.returned_quantity + 1 };
      }
    },
    [unitsByEquipmentId, countedReturnUnitIds, handleForceUnitReturn],
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
      clearForceState();

      const parsed = parseEquipmentQrPayload(normalized);

      if (parsed.kind === 'equipment' && parsed.id) {
        const equipmentId = parsed.id;
        const match = items.find((item) => item.equipment_id === equipmentId) ?? null;

        if (!match) {
          setScanError('Matériel introuvable pour ce retour.');
          await logReturnScan({ scan_result: 'unknown_code', scanned_code: normalized, counted: false, error_message: 'QR matériel absent du retour' });
          return;
        }

        if (serialEquipmentIds.has(equipmentId)) {
          setScanError('Retour précis requis : scannez le QR unitaire (numéro de série).');
          await logReturnScan({ scan_result: 'wrong_code_type', scanned_code: normalized, equipment_id: equipmentId, expected_equipment_id: equipmentId, counted: false, error_message: 'QR équipement au lieu du QR unitaire' });
          return;
        }

        setScannedEquipmentId(match.equipment_id);
        return;
      }

      const unit = await fetchEquipmentUnitByCode(normalized);

      if (!unit) {
        setScanError('QR code unitaire inconnu.');
        await logReturnScan({ scan_result: 'unknown_code', scanned_code: normalized, counted: false, error_message: 'QR unitaire introuvable' });
        return;
      }

      const matchingItem = items.find((row) => row.equipment_id === unit.equipment_id) || null;

      if (!matchingItem) {
        setScanError('Ce matériel ne fait pas partie de cette prestation.');
        await logReturnScan({ scan_result: 'wrong_equipment', scanned_code: normalized, equipment_id: unit.equipment_id, equipment_unit_id: unit.id, counted: false, error_message: 'Matériel non présent sur ce retour' });
        return;
      }

      if (matchingItem.equipment_id && serialEquipmentIds.has(matchingItem.equipment_id)) {
        setScannedEquipmentId(matchingItem.equipment_id);
        setScannedUnitId(unit.id);

        // Accept even if not in expectedUnitsById (prep may have been skipped)
        const isExpected = !!expectedUnitsById[unit.id];

        if (countedReturnUnitIds.has(unit.id)) {
          await logReturnScan({ scan_result: 'duplicate', scanned_code: normalized, equipment_id: unit.equipment_id, equipment_unit_id: unit.id, expected_equipment_id: matchingItem.equipment_id, return_item_id: matchingItem.id, counted: false, error_message: 'Unité déjà comptabilisée' });
        }

        if (!isExpected) {
          // Allow but flag as forced
          setForceAllowed(true);
          setForceUnit(unit);
          setForceItemId(matchingItem.id || null);
          setScanError('Numéro non préparé — vous pouvez quand même valider ce retour.');
          await logReturnScan({ scan_result: 'not_prepared', scanned_code: normalized, equipment_id: unit.equipment_id, equipment_unit_id: unit.id, expected_equipment_id: matchingItem.equipment_id, return_item_id: matchingItem.id, counted: false, error_message: 'Numéro non préparé / non attendu' });
          await insertEquipmentUnitActivityLog({ equipment_unit_id: unit.id, equipment_id: unit.equipment_id, rental_id: rental.id, event_type: 'return_scan_rejected', severity: 'warning', source: 'ui_return', message: 'Scan retour rejeté: numéro non attendu', payload: { return_id: returnId, scanned_code: normalized } });
        }

        return;
      }

      setScannedEquipmentId(matchingItem.equipment_id || null);
      setScannedUnitId(unit.id);
    },
    [countedReturnUnitIds, expectedUnitsById, items, logReturnScan, rental.id, returnId, serialEquipmentIds, stopScanner],
  );

  const startScanner = useCallback(async () => {
    if (!scanPanelOpen) return;
    setScanError(null);

    if (!window.isSecureContext) { setScanError('Le scan nécessite HTTPS ou localhost.'); return; }
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { setScanError('Caméra inaccessible sur ce navigateur.'); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
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
          if (video.readyState < 2) { scanFrameRef.current = requestAnimationFrame(fallback); return; }
          const canvas = canvasRef.current || (() => { const c = document.createElement('canvas'); canvasRef.current = c; return c; })();
          const w = video.videoWidth; const h = video.videoHeight;
          if (w === 0 || h === 0) { scanFrameRef.current = requestAnimationFrame(fallback); return; }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
          if (!ctx) { scanFrameRef.current = requestAnimationFrame(fallback); return; }
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) { void handleScanResult(code.data); return; }
          scanFrameRef.current = requestAnimationFrame(fallback);
        };
        scanFrameRef.current = requestAnimationFrame(fallback);
      };

      const detectorCtor = (window as any).BarcodeDetector as any;
      let detector: any = null;
      if (detectorCtor) {
        try { detector = new detectorCtor({ formats: ['qr_code'] }); } catch { detector = null; }
      }

      if (detector) {
        const detectLoop = async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes?.length) { void handleScanResult(barcodes[0].rawValue); return; }
          } catch (e: any) {
            if (e?.name === 'NotSupportedError') { runFallbackLoop(); return; }
          }
          scanFrameRef.current = requestAnimationFrame(detectLoop);
        };
        scanFrameRef.current = requestAnimationFrame(detectLoop);
      } else {
        runFallbackLoop();
      }
    } catch (e) {
      setScanError("Impossible d'accéder à la caméra.");
      stopScanner();
    }
  }, [handleScanResult, scanPanelOpen, stopScanner]);

  useEffect(() => {
    if (scanPanelOpen && !scannerRunning && !scannedEquipmentId && !scanError) void startScanner();
  }, [scanError, scanPanelOpen, scannedEquipmentId, scannerRunning, startScanner]);

  useEffect(() => { if (!scanPanelOpen) stopScanner(); }, [scanPanelOpen, stopScanner]);
  useEffect(() => () => stopScanner(), [stopScanner]);

  useEffect(() => {
    if (!scannedItem) { setScannedQuantity(0); return; }
    if (scannedItem.equipment_id && serialEquipmentIds.has(scannedItem.equipment_id)) { setScannedQuantity(1); return; }
    setScannedQuantity(Math.min(scannedItem.expected_quantity, scannedItem.returned_quantity + 1));
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
    handleResetScan();
    setScanPanelOpen((v) => !v);
  };

  const handleConfirmScanned = async () => {
    if (!scannedItem) return;

    if (isSerialScan) {
      if (!scannedUnitId) return;
      if (countedReturnUnitIds.has(scannedUnitId)) {
        setScanMessage('Ce numéro de suivi a déjà été comptabilisé.');
        setScannedEquipmentId(null); setScannedUnitId(null); setScannedCode(null);
        return;
      }
      const nextQty = Math.min(scannedItem.expected_quantity, scannedItem.returned_quantity + 1);
      await updateItem(scannedItem, nextQty, { allowSerialManual: true });
      setCountedReturnUnitIds((prev) => { const n = new Set(prev); n.add(scannedUnitId); return n; });
      await logReturnScan({ scan_result: 'accepted', scanned_code: scannedCode, equipment_id: scannedItem.equipment_id, equipment_unit_id: scannedUnitId, expected_equipment_id: scannedItem.equipment_id, return_item_id: scannedItem.id, counted: true, forced: false, metadata: { serial_number: scannedUnit?.serial_number || null } });
      await insertEquipmentUnitActivityLog({ equipment_unit_id: scannedUnitId, equipment_id: scannedItem.equipment_id, rental_id: rental.id, event_type: 'return_scan_accepted', severity: 'info', source: 'ui_return', message: 'Unité validée au retour', payload: { return_id: returnId, return_item_id: scannedItem.id, scanned_code: scannedCode } });
      setScanMessage(`Retour validé : ${scannedUnit?.serial_number || scannedUnitId}.`);
      setScanError(null); setScannedEquipmentId(null); setScannedUnitId(null); setScannedCode(null); setScannedQuantity(0); clearForceState();
      return;
    }

    await updateItem(scannedItem, scannedQuantity);
    await logReturnScan({ scan_result: 'accepted', scanned_code: scannedCode, equipment_id: scannedItem.equipment_id, expected_equipment_id: scannedItem.equipment_id, return_item_id: scannedItem.id, counted: true, forced: false, metadata: { quantity_validated: scannedQuantity } });
    setScanMessage('Quantité mise à jour.');
    setScanError(null); setScannedEquipmentId(null); setScannedCode(null); setScannedQuantity(0); clearForceState();
  };

  const handleForceValidateFromScan = async () => {
    if (!forceAllowed || !forceUnit || !forceItemId) return;
    const targetItem = items.find((item) => item.id === forceItemId) || null;
    if (!targetItem) { setScanError('Ligne de retour introuvable.'); return; }
    await handleForceUnitReturn(forceUnit, targetItem);
    setScanMessage('Retour validé en mode forcé.');
    setScanError(null); setScannedEquipmentId(null); setScannedUnitId(null); setScannedCode(null); setScannedQuantity(0); clearForceState();
  };

  const markAllNonSerial = async () => {
    const next = items.map((row) => {
      if (row.equipment_id && serialEquipmentIds.has(row.equipment_id)) return row;
      return { ...row, returned_quantity: row.expected_quantity };
    });
    setItems(next);
    try {
      await Promise.all(
        next
          .filter((row) => !!row.id && (!row.equipment_id || !serialEquipmentIds.has(row.equipment_id)))
          .map((row) => (supabase as any).from('rental_return_items').update({ returned_quantity: row.expected_quantity }).eq('id', row.id as string)),
      );
    } catch {
      toast.error('Impossible de marquer tout revenu');
    }
  };

  const finalize = async () => {
    if (!returnId) return;
    const missing = pendingCount;
    if (missing > 0) {
      if (!window.confirm(`Il manque encore ${missing} article(s). Valider quand même le retour ?`)) return;
    }
    setFinalizing(true);
    try {
      const nowIso = new Date().toISOString();
      await (supabase as any).from('rental_returns').update({ status: 'completed', completed_at: nowIso }).eq('id', returnId);
      await (supabase as any).from('rentals').update({ status: missing > 0 ? 'in_return' : 'returned', returned_at: missing > 0 ? null : nowIso }).eq('id', rental.id);
      toast.success('Retour validé');
      if (onCompleted) await onCompleted({ returnId, completedAt: nowIso, items, missingCount: missing });
      onClose();
    } catch {
      toast.error('Validation impossible');
    } finally {
      setFinalizing(false);
    }
  };

  // ── scan overlay state ────────────────────────────────────────────────────

  const scanState = useMemo(() => {
    if (scanError) return { status: 'error' as const, message: scanError };
    if (scannedItem) {
      if (isSerialScan && scannedUnitId && countedReturnUnitIds.has(scannedUnitId))
        return { status: 'complete' as const, message: 'Déjà comptabilisé.' };
      if (scannedItem.returned_quantity >= scannedItem.expected_quantity)
        return { status: 'complete' as const, message: 'Déjà revenu.' };
      if (isSerialScan)
        return { status: 'pending' as const, message: `Retour unitaire : ${scannedItem.equipment_name}` };
      return { status: 'pending' as const, message: 'Quantité à enregistrer.' };
    }
    if (scannedCode && !scannedItem) return { status: 'error' as const, message: 'Matériel non reconnu.' };
    return { status: null, message: null } as const;
  }, [countedReturnUnitIds, isSerialScan, scanError, scannedCode, scannedItem, scannedUnitId]);

  const isOverlayActive = scanState.status !== null;
  const overlayBg = scanState.status === 'error' ? 'bg-red-600/70' : scanState.status === 'complete' ? 'bg-amber-500/75' : 'bg-green-600/70';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Retour matériel</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {pendingCount > 0 ? `${pendingCount} article(s) en attente` : 'Tout est revenu ✓'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleScanToggle}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    scanPanelOpen
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Scan className="h-4 w-4" />
                  {scanPanelOpen ? 'Fermer le scanner' : 'Scanner QR'}
                </button>
                {items.some((r) => !r.equipment_id || !serialEquipmentIds.has(r.equipment_id)) && (
                  <button
                    onClick={markAllNonSerial}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Check className="h-4 w-4" />
                    Tout revenu (hors série)
                  </button>
                )}
              </div>

              {/* Scanner panel */}
              {scanPanelOpen && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Scanner un QR code</p>
                      <p className="text-xs text-blue-600">{isOverlayActive && scanState.message ? scanState.message : 'Placez le QR dans le cadre.'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {scannerRunning ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-blue-600 inline-block" />
                          En cours
                        </span>
                      ) : (
                        <button
                          onClick={handleResetScan}
                          className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Relancer
                        </button>
                      )}
                      {isFallbackScanner && <span className="text-[10px] text-blue-600">Mode Safari</span>}
                    </div>
                  </div>

                  <div className="relative aspect-square overflow-hidden rounded-xl bg-black max-h-64 w-full">
                    <video ref={videoRef} className="h-full w-full object-cover opacity-80" playsInline autoPlay muted />
                    <div className="pointer-events-none absolute inset-[15%] rounded-xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />

                    {isOverlayActive && (
                      <div className={`absolute inset-0 flex items-center justify-center px-4 ${overlayBg} backdrop-blur-sm`}>
                        {scanState.status === 'pending' && scannedItem ? (
                          <div className="w-full max-w-xs rounded-2xl bg-white/95 p-4 text-gray-900 shadow-xl space-y-3">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-500">Matériel</p>
                              <p className="text-sm font-semibold">{scannedItem.equipment_name}</p>
                            </div>

                            {isSerialScan ? (
                              <>
                                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                                  <p className="text-xs text-green-700">Numéro de série</p>
                                  <p className="text-sm font-semibold text-green-900">{scannedUnit?.serial_number || scannedUnitId}</p>
                                </div>
                                <p className="text-xs text-center text-gray-500">
                                  {scannedItem.returned_quantity} / {scannedItem.expected_quantity} revenu(s)
                                </p>
                                <div className="flex gap-2 justify-center flex-wrap">
                                  <button onClick={handleConfirmScanned} className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                                    Valider
                                  </button>
                                  <button onClick={handleResetScan} className="rounded-full border border-gray-300 px-4 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                                    Annuler
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center justify-center gap-3">
                                  <button onClick={() => setScannedQuantity((v) => Math.max(0, v - 1))} disabled={scannedQuantity <= 0} className="h-10 w-10 rounded-full border text-xl font-bold disabled:opacity-30 border-green-400 text-green-700 hover:bg-green-50">–</button>
                                  <span className="text-3xl font-bold tabular-nums">{scannedQuantity}</span>
                                  <button onClick={() => setScannedQuantity((v) => Math.min(scannedItem.expected_quantity, v + 1))} disabled={scannedQuantity >= scannedItem.expected_quantity} className="h-10 w-10 rounded-full border text-xl font-bold disabled:opacity-30 border-green-400 text-green-700 hover:bg-green-50">+</button>
                                </div>
                                <div className="flex gap-2 justify-center flex-wrap">
                                  <button onClick={() => setScannedQuantity(scannedItem.expected_quantity)} className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">Tout</button>
                                  <button onClick={handleConfirmScanned} className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700">Valider</button>
                                  <button onClick={handleResetScan} className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">Annuler</button>
                                </div>
                              </>
                            )}
                          </div>
                        ) : scanState.status === 'complete' ? (
                          <div className="rounded-2xl bg-white/95 p-4 text-center shadow-xl space-y-2">
                            <p className="text-sm font-semibold">Déjà comptabilisé</p>
                            <p className="text-xs text-gray-500">{scanState.message}</p>
                            <button onClick={handleResetScan} className="rounded-full border border-amber-300 px-4 py-1 text-xs text-amber-700 hover:bg-amber-50">
                              Scanner un autre
                            </button>
                          </div>
                        ) : (
                          <div className="w-full max-w-xs rounded-2xl bg-white/95 p-4 text-center shadow-xl space-y-2">
                            <p className="text-sm font-semibold text-red-700">QR en anomalie</p>
                            <p className="text-xs text-gray-600">{scanState.message}</p>
                            {scannedCode && <p className="text-[10px] font-mono text-gray-400 break-all">{scannedCode}</p>}
                            <div className="flex gap-2 justify-center flex-wrap">
                              {forceAllowed && forceUnit && (
                                <button onClick={handleForceValidateFromScan} className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">
                                  <ShieldAlert className="h-3.5 w-3.5" />
                                  Forcer quand même
                                </button>
                              )}
                              <button onClick={handleResetScan} className="rounded-full border border-red-300 px-4 py-1.5 text-xs text-red-600 hover:bg-red-50">
                                Réessayer
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {!isOverlayActive && scanMessage && (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{scanMessage}</div>
                  )}
                </div>
              )}

              {/* Items list — always visible */}
              <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
                {items.length === 0 && (
                  <div className="p-4 text-sm text-gray-500">Aucun matériel enregistré sur ce projet.</div>
                )}
                {items.map((row) => {
                  const remaining = Math.max(0, row.expected_quantity - row.returned_quantity);
                  const isSerial = !!row.equipment_id && serialEquipmentIds.has(row.equipment_id);
                  const units = (row.equipment_id && unitsByEquipmentId[row.equipment_id]) || [];
                  const isExpanded = !!row.equipment_id && expandedSerialItems.has(row.equipment_id);
                  const done = remaining === 0;

                  return (
                    <div key={row.id || row.equipment_id || row.equipment_name}>
                      {/* Main row */}
                      <div className={`flex items-center gap-3 px-4 py-3 ${done ? 'bg-green-50/50' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">{row.equipment_name}</span>
                            {done && <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">{row.equipment_type}</span>
                            {isSerial && (
                              <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                Suivi unitaire
                              </span>
                            )}
                            {remaining > 0 && (
                              <span className="text-[10px] font-medium text-orange-600">
                                {remaining} manquant{remaining > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Controls */}
                        {isSerial ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-medium tabular-nums text-gray-700">
                              {row.returned_quantity} / {row.expected_quantity}
                            </span>
                            {/* Force all button */}
                            {remaining > 0 && (
                              <button
                                onClick={() => handleForceAllUnitsForItem(row)}
                                title="Forcer tout revenu sans scan"
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                              >
                                <ShieldAlert className="h-3.5 w-3.5" />
                                Forcer tout
                              </button>
                            )}
                            {/* Expand toggle to show individual units */}
                            {units.length > 0 && (
                              <button
                                onClick={() => setExpandedSerialItems((prev) => {
                                  const next = new Set(prev);
                                  if (isExpanded) next.delete(row.equipment_id!);
                                  else next.add(row.equipment_id!);
                                  return next;
                                })}
                                className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                                title={isExpanded ? 'Masquer les unités' : 'Voir les unités'}
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => updateItem(row, row.returned_quantity - 1)}
                              className="h-7 w-7 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center text-base font-semibold disabled:opacity-30"
                              disabled={row.returned_quantity <= 0}
                            >
                              –
                            </button>
                            <span className="text-sm font-medium tabular-nums w-8 text-center">
                              {row.returned_quantity}
                            </span>
                            <button
                              onClick={() => updateItem(row, row.returned_quantity + 1)}
                              className="h-7 w-7 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center text-base font-semibold disabled:opacity-30"
                              disabled={row.returned_quantity >= row.expected_quantity}
                            >
                              +
                            </button>
                            <span className="text-xs text-gray-500 w-8">/ {row.expected_quantity}</span>
                          </div>
                        )}
                      </div>

                      {/* Expanded unit list for serial items */}
                      {isSerial && isExpanded && units.length > 0 && (
                        <div className="border-t border-gray-100 bg-gray-50 divide-y divide-gray-100">
                          {units.map((unit) => {
                            const isCounted = countedReturnUnitIds.has(unit.id);
                            return (
                              <div key={unit.id} className="flex items-center justify-between px-5 py-2">
                                <div>
                                  <span className="text-xs font-medium text-gray-700">
                                    {unit.serial_number || unit.id.slice(0, 8)}
                                  </span>
                                  {isCounted && (
                                    <span className="ml-2 text-[10px] text-green-600 font-medium">✓ Revenu</span>
                                  )}
                                </div>
                                {!isCounted && (
                                  <button
                                    onClick={() => handleForceUnitReturn(unit, row)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                                  >
                                    <ShieldAlert className="h-3 w-3" />
                                    Forcer
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {pendingCount > 0 ? `${pendingCount} article(s) non revenu(s)` : 'Tous les articles sont revenus'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
              Fermer
            </button>
            <button
              onClick={finalize}
              disabled={finalizing || loading || items.length === 0}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {finalizing ? 'Validation…' : 'Valider le retour'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnModal;
