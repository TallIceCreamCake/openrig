import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Eye, ClipboardList, Undo2, X, ScanLine,
  Truck, CheckCircle2, Package,
} from 'lucide-react';
import jsQR from 'jsqr';
import {
  fetchEquipmentUnitByCode,
  parseEquipmentQrPayload,
} from '../../utils/equipmentUnitTracking';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanMode  = 'info' | 'preparation' | 'return';
type SheetSnap = 'hidden' | 'mini' | 'peek' | 'full';
type ScanStatus = 'to_prepare' | 'prepared' | 'out' | 'to_return' | 'returned';

type ActiveRental = {
  rentalId: string;
  rentalTitle: string | null;
  rentalStatus: string;
  scanStatus: ScanStatus;
};

type ScannedEquipment = {
  equipmentId: string;
  unitId: string | null;
  name: string;
  type: string | null;
  subtype: string | null;
  status: string | null;
  serialNumber: string | null;
  imageUrl: string | null;
  rentals: ActiveRental[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  available: 'Disponible', in_use: 'En utilisation', maintenance: 'Maintenance', broken: 'Hors service',
};
const STATUS_COLOR: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700', in_use: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-amber-100 text-amber-700',   broken: 'bg-red-100 text-red-700',
};

const SCAN_STATUS_META: Record<ScanStatus, { label: string; color: string; icon: React.FC<any> }> = {
  to_prepare: { label: 'À préparer',  color: 'bg-orange-100 text-orange-700',   icon: ClipboardList },
  prepared:   { label: 'Préparé ✓',   color: 'bg-blue-100 text-blue-700',       icon: CheckCircle2  },
  out:        { label: 'Sorti',        color: 'bg-violet-100 text-violet-700',   icon: Truck         },
  to_return:  { label: 'À rentrer',    color: 'bg-amber-100 text-amber-700',     icon: Undo2         },
  returned:   { label: 'Rendu ✓',      color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2  },
};

const MODES: { id: ScanMode; label: string; icon: React.FC<any>; pill: string; frame: string }[] = [
  { id: 'info',        label: 'Voir les infos', icon: Eye,           pill: 'bg-violet-500/30 border border-violet-400/50 text-white', frame: '#a78bfa' },
  { id: 'preparation', label: 'Préparer',        icon: ClipboardList, pill: 'bg-blue-500/30 border border-blue-400/50 text-white',   frame: '#60a5fa' },
  { id: 'return',      label: 'Retour',           icon: Undo2,         pill: 'bg-teal-500/30 border border-teal-400/50 text-white',   frame: '#2dd4bf' },
];

const PEEK_HEIGHT = 210;
const MINI_HEIGHT = 76;
const SPRING      = 'transform 0.38s cubic-bezier(0.32,0.72,0,1)';

const ACTIVE_STATUSES = new Set(['pending','confirmed','preparing','in_progress','delivered','in_return']);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const parseRentalQrId = (raw: string): string | null => {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('rental:')) {
    const id = trimmed.slice(7).trim();
    return id || null;
  }
  const fromUrl = trimmed.match(/\/rentals\/([0-9a-fA-F-]{36})/);
  if (fromUrl?.[1]) return fromUrl[1];
  const uuid = trimmed.match(UUID_RE);
  return uuid?.[0] ?? null;
};

const MODE_HINT: Record<string, string> = {
  info:        'Scannez le QR code du matériel',
  preparation: 'Scannez le QR code du projet à préparer',
  return:      'Scannez le QR code du projet en retour',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getScanStatus = async (rentalStatus: string, rentalId: string, unitId: string | null): Promise<ScanStatus> => {
  const sb = supabase as any;

  if (['in_progress','delivered'].includes(rentalStatus)) return 'out';

  if (rentalStatus === 'in_return') {
    if (!unitId) return 'to_return';
    const { data: returns } = await sb.from('rental_returns').select('id').eq('rental_id', rentalId);
    if (returns?.length) {
      const { data: scans } = await sb
        .from('rental_return_unit_scans')
        .select('equipment_unit_id')
        .in('return_id', returns.map((r: any) => r.id))
        .eq('equipment_unit_id', unitId)
        .eq('counted', true)
        .limit(1);
      if (scans?.length) return 'returned';
    }
    return 'to_return';
  }

  // pending / confirmed / preparing
  if (!unitId) return 'to_prepare';
  const { data: prepScans } = await sb
    .from('rental_preparation_unit_scans')
    .select('equipment_unit_id')
    .eq('rental_id', rentalId)
    .eq('equipment_unit_id', unitId)
    .eq('counted', true)
    .limit(1);
  return prepScans?.length ? 'prepared' : 'to_prepare';
};

const findAllActiveRentals = async (equipmentId: string, unitId: string | null): Promise<ActiveRental[]> => {
  const { data } = await (supabase as any)
    .from('rental_items')
    .select('rental_id, rentals(id, title, reference_code, status)')
    .eq('equipment_id', equipmentId)
    .limit(20);

  if (!data?.length) return [];

  const seen = new Set<string>();
  const active = (data as any[])
    .map((row: any) => row.rentals)
    .filter((r: any) => r && ACTIVE_STATUSES.has(r.status) && !seen.has(r.id) && seen.add(r.id));

  return Promise.all(
    active.map(async (r: any) => ({
      rentalId: r.id as string,
      rentalTitle: (r.title || r.reference_code || null) as string | null,
      rentalStatus: r.status as string,
      scanStatus: await getScanStatus(r.status, r.id, unitId),
    }))
  );
};

const rentalNav = (rental: ActiveRental): string => {
  if (rental.scanStatus === 'to_return' || rental.scanStatus === 'returned')
    return `/m/retours/${rental.rentalId}`;
  if (rental.scanStatus === 'to_prepare' || rental.scanStatus === 'prepared')
    return `/m/preparations/${rental.rentalId}`;
  return `/m/projets/${rental.rentalId}`;
};

// ─── Component ────────────────────────────────────────────────────────────────

const MobileScanner: React.FC = () => {
  const navigate = useNavigate();

  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef  = useRef<number | null>(null);
  const modeRef   = useRef<ScanMode>('info');

  const sheetRef       = useRef<HTMLDivElement | null>(null);
  const snapRef        = useRef<SheetSnap>('hidden');
  const translateRef   = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartTRef = useRef(0);

  const [mode, setMode]               = useState<ScanMode>('info');
  const [scanning, setScanning]       = useState(false);
  const [result, setResult]           = useState<ScannedEquipment | null>(null);
  const [notFound, setNotFound]       = useState(false);
  const [notFoundReason, setNFReason] = useState<'unknown' | 'not_rental'>('unknown');
  const [loading, setLoading]         = useState(false);
  const [snap, setSnap]               = useState<SheetSnap>('hidden');

  const activeMeta = MODES.find((m) => m.id === mode)!;

  // ── Sheet helpers ──────────────────────────────────────────────────────────

  const sheetH  = () => sheetRef.current?.offsetHeight ?? 700;
  const peekT   = () => sheetH() - PEEK_HEIGHT;
  const miniT   = () => sheetH() - MINI_HEIGHT;
  const hiddenT = () => sheetH() + 40;

  const setTranslate = (y: number, animated: boolean) => {
    if (!sheetRef.current) return;
    sheetRef.current.style.transition = animated ? SPRING : 'none';
    sheetRef.current.style.transform  = `translateY(${y}px)`;
    translateRef.current = y;
  };

  const snapTo = useCallback((target: SheetSnap, onDone?: () => void) => {
    const y = target === 'full' ? 0 : target === 'peek' ? peekT() : target === 'mini' ? miniT() : hiddenT();
    snapRef.current = target;
    setTranslate(y, true);
    setSnap(target);
    if (onDone) setTimeout(onDone, 380);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera helpers ─────────────────────────────────────────────────────────

  const pauseScan = useCallback(() => {
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    setScanning(false);
  }, []);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setScanning(false);
  }, []);

  const makeTick = () => {
    const tick = () => {
      const video = videoRef.current, canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) { frameRef.current = requestAnimationFrame(tick); return; }
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { frameRef.current = requestAnimationFrame(tick); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code?.data) handleDetected(code.data);
      else frameRef.current = requestAnimationFrame(tick);
    };
    return tick;
  };

  const startCamera = useCallback(async () => {
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    setResult(null); setNotFound(false); setNFReason('unknown'); setLoading(false);
    snapRef.current = 'hidden'; setSnap('hidden');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setScanning(true);
      frameRef.current = requestAnimationFrame(makeTick());
    } catch { setNotFound(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resumeScan = useCallback(async () => {
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    setNotFound(false); setNFReason('unknown');
    try {
      if (!streamRef.current || !streamRef.current.active) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; }
      }
      if (videoRef.current) await videoRef.current.play();
      setScanning(true);
      frameRef.current = requestAnimationFrame(makeTick());
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resumeStream = useCallback(async () => {
    try {
      if (!streamRef.current || !streamRef.current.active) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; }
      }
      if (videoRef.current) await videoRef.current.play();
    } catch {}
  }, []);

  useEffect(() => { startCamera(); return () => stopCamera(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!result || !sheetRef.current) return;
    if (snapRef.current === 'mini') {
      snapTo('peek');
    } else {
      setTranslate(hiddenT(), false);
      requestAnimationFrame(() => requestAnimationFrame(() => snapTo('peek')));
    }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── QR detection ───────────────────────────────────────────────────────────

  const handleDetected = useCallback(async (raw: string) => {
    pauseScan();
    setLoading(true);
    try {
      const m = modeRef.current;

      // ── Preparation / Return mode: only accept rental QR codes ────────────
      if (m === 'preparation' || m === 'return') {
        const rentalId = parseRentalQrId(raw);
        if (!rentalId) { setNFReason('not_rental'); setNotFound(true); return; }

        const { data: rental } = await (supabase as any)
          .from('rentals')
          .select('id')
          .eq('id', rentalId)
          .single();
        if (!rental) { setNFReason('not_rental'); setNotFound(true); return; }

        navigate(m === 'preparation' ? `/m/preparations/${rentalId}` : `/m/retours/${rentalId}`);
        return;
      }

      // ── Info mode: equipment QR codes ──────────────────────────────────────
      const parsed = parseEquipmentQrPayload(raw);
      if (parsed.kind === 'unknown') { setNotFound(true); return; }

      const unit = await fetchEquipmentUnitByCode(raw);
      let equipmentId: string | null = null;
      let unitId: string | null = null;
      let serialNumber: string | null = null;
      if (unit) { equipmentId = unit.equipment_id; unitId = unit.id ?? null; serialNumber = unit.serial_number ?? null; }
      else if (parsed.kind === 'equipment' && parsed.id) equipmentId = parsed.id;
      if (!equipmentId) { setNotFound(true); return; }

      const { data: eq } = await (supabase as any)
        .from('equipment')
        .select('name,type,subtype,status,image_url')
        .eq('id', equipmentId)
        .single();
      if (!eq) { setNotFound(true); return; }

      const rentals = await findAllActiveRentals(equipmentId, unitId);

      setResult({
        equipmentId,
        unitId,
        name: eq.name ?? 'Équipement',
        type: eq.type ?? null,
        subtype: eq.subtype ?? null,
        status: eq.status ?? null,
        serialNumber,
        imageUrl: eq.image_url ?? null,
        rentals,
      });
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [pauseScan, navigate]);

  // ── Mode change ────────────────────────────────────────────────────────────

  const handleModeChange = (newMode: ScanMode) => {
    modeRef.current = newMode;
    setMode(newMode);
  };

  // ── Touch handlers ─────────────────────────────────────────────────────────

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTRef.current = translateRef.current;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dy      = e.touches[0].clientY - touchStartYRef.current;
    const raw     = touchStartTRef.current + dy;
    const clamped = Math.max(0, Math.min(hiddenT(), raw));
    translateRef.current = clamped;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${clamped}px)`;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onTouchEnd = useCallback(() => {
    const dy = translateRef.current - touchStartTRef.current;
    if (snapRef.current === 'peek') {
      if (dy < -70)     snapTo('full', () => stopCamera());
      else if (dy > 70) snapTo('mini', () => resumeScan());
      else              snapTo('peek');
    } else if (snapRef.current === 'full') {
      if (dy > 90) snapTo('peek', () => resumeStream());
      else         snapTo('full');
    } else if (snapRef.current === 'mini') {
      if (dy < -70) snapTo('peek');
      else          snapTo('mini');
    }
  }, [snapTo, stopCamera, resumeScan, resumeStream]);

  // ── UI ─────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden">
      <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 pointer-events-none bg-black/20" />

      {/* ── Back + mode selector ── */}
      <div className={`absolute top-3 inset-x-3 z-30 flex items-center gap-2 transition-opacity duration-300 ${snap === 'full' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <button type="button" onClick={() => { stopCamera(); navigate(-1); }}
          className="h-9 w-9 shrink-0 rounded-xl backdrop-blur-md bg-black/40 flex items-center justify-center text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button key={m.id} type="button" onClick={() => handleModeChange(m.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all duration-200 ${active ? m.pill : 'bg-black/25 border border-white/10 text-white/40'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[9px] font-semibold leading-none">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── QR frame ── */}
      {scanning && snap !== 'full' && (
        <>
          <div className="absolute pointer-events-none" style={{
            width: 232, height: 232,
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%) translateY(20px)',
            borderRadius: 20,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.52)',
          }}>
            {[
              { top: 0,    left: 0,    borderTop: true,    borderLeft: true,  borderRadius: '14px 0 0 0' },
              { top: 0,    right: 0,   borderTop: true,    borderRight: true, borderRadius: '0 14px 0 0' },
              { bottom: 0, left: 0,    borderBottom: true, borderLeft: true,  borderRadius: '0 0 0 14px' },
              { bottom: 0, right: 0,   borderBottom: true, borderRight: true, borderRadius: '0 0 14px 0' },
            ].map((c, i) => (
              <span key={i} style={{
                position: 'absolute', width: 30, height: 30, ...c,
                borderStyle: 'solid', borderColor: 'transparent', borderWidth: 3,
                borderTopColor:    c.borderTop    ? activeMeta.frame : 'transparent',
                borderBottomColor: c.borderBottom ? activeMeta.frame : 'transparent',
                borderLeftColor:   c.borderLeft   ? activeMeta.frame : 'transparent',
                borderRightColor:  c.borderRight  ? activeMeta.frame : 'transparent',
                filter: `drop-shadow(0 0 4px ${activeMeta.frame}99)`,
              }} />
            ))}
          </div>
          {snap === 'hidden' && (
            <p className="absolute inset-x-0 text-center text-white/60 text-xs font-medium pointer-events-none" style={{ top: 'calc(50% + 140px)' }}>
              {MODE_HINT[mode]}
            </p>
          )}
        </>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="backdrop-blur-md bg-black/50 rounded-2xl px-6 py-4 flex items-center gap-3">
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-sm font-medium">Identification...</span>
          </div>
        </div>
      )}

      {/* ── Bottom sheet ── */}
      {result && (
        <div
          ref={sheetRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="absolute bottom-0 inset-x-0 z-20 bg-white rounded-t-3xl shadow-2xl"
          style={{ height: '88vh', willChange: 'transform', touchAction: 'none' }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* ── Mini / Peek header — always visible ── */}
          <div className="px-4 flex items-center gap-3" style={{ height: MINI_HEIGHT - 20 }}>
            {/* Thumbnail */}
            <div className="shrink-0 h-10 w-10 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
              {result.imageUrl
                ? <img src={result.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <Package className="h-5 w-5 text-gray-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate leading-tight">{result.name}</p>
              {(result.type || result.subtype) && (
                <p className="text-xs text-gray-400 truncate leading-tight mt-0.5">
                  {[result.type, result.subtype].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            {result.status && (
              <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[result.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABEL[result.status] ?? result.status}
              </span>
            )}
          </div>

          {snap === 'peek' && (
            <p className="text-center text-[10px] text-gray-400 pb-1">
              Glissez vers le haut pour les détails · vers le bas pour rescanner
            </p>
          )}

          {/* ── Full content ── */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(88vh - 110px)' }}>

            {/* Equipment image — large */}
            {result.imageUrl && (
              <div className="mx-4 mb-4 rounded-2xl overflow-hidden bg-gray-100" style={{ height: 180 }}>
                <img src={result.imageUrl} alt={result.name} className="w-full h-full object-cover" />
              </div>
            )}

            {/* Info grid */}
            <div className="px-4 mb-4 grid grid-cols-2 gap-2">
              {result.serialNumber && (
                <div className="col-span-2 bg-gray-50 rounded-2xl px-4 py-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Numéro de série</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5 font-mono">{result.serialNumber}</p>
                </div>
              )}
              {result.type && (
                <div className="bg-gray-50 rounded-2xl px-4 py-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Type</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{result.type}</p>
                </div>
              )}
              {result.subtype && (
                <div className="bg-gray-50 rounded-2xl px-4 py-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Sous-type</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{result.subtype}</p>
                </div>
              )}
            </div>

            {/* Rentals */}
            <div className="px-4 mb-6">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2">
                {result.rentals.length > 0 ? `Projets actifs (${result.rentals.length})` : 'Projets actifs'}
              </p>

              {result.rentals.length === 0 ? (
                <div className="bg-gray-50 rounded-2xl px-4 py-4 text-center">
                  <p className="text-sm text-gray-400">Aucun projet actif pour ce matériel</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {result.rentals.map((rental) => {
                    const meta = SCAN_STATUS_META[rental.scanStatus];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={rental.rentalId}
                        type="button"
                        onClick={() => navigate(rentalNav(rental))}
                        className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 active:scale-[.98] transition-transform text-left w-full"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {rental.rentalTitle ?? 'Projet sans nom'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.color}`}>
                              <Icon className="h-2.5 w-2.5" />
                              {meta.label}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rescan */}
            <div className="px-4 pb-8">
              <button type="button" onClick={() => { setResult(null); setNotFound(false); startCamera(); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-100 text-gray-500 text-sm font-medium active:scale-95 transition-transform"
              >
                <ScanLine className="h-4 w-4" /> Scanner un autre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Not found ── */}
      {notFound && !loading && (
        <div className="absolute bottom-8 inset-x-4 z-20">
          <div className="backdrop-blur-md bg-white/90 rounded-3xl p-5 shadow-xl text-center">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
              <X className="h-6 w-6 text-red-500" />
            </div>
            {notFoundReason === 'not_rental' ? (
              <>
                <p className="font-semibold text-gray-900 mb-1">QR projet attendu</p>
                <p className="text-xs text-gray-500 mb-4">
                  En mode {mode === 'preparation' ? 'préparation' : 'retour'}, scannez uniquement le QR code du projet, pas du matériel.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-900 mb-1">QR non reconnu</p>
                <p className="text-xs text-gray-500 mb-4">Ce code QR ne correspond à aucun élément enregistré.</p>
              </>
            )}
            <button type="button" onClick={() => { setNotFound(false); setNFReason('unknown'); startCamera(); }}
              className="w-full py-3 bg-blue-600 text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
            >
              <ScanLine className="h-4 w-4" /> Réessayer
            </button>
          </div>
        </div>
      )}

      {/* ── Camera error ── */}
      {!scanning && !loading && !result && !notFound && (
        <div className="absolute bottom-8 inset-x-4 z-20">
          <div className="backdrop-blur-md bg-white/90 rounded-3xl p-5 shadow-xl text-center">
            <p className="font-semibold text-gray-900 mb-1">Caméra indisponible</p>
            <p className="text-xs text-gray-500 mb-4">Autorisez l'accès à la caméra dans les réglages.</p>
            <button type="button" onClick={startCamera} className="w-full py-3 bg-blue-600 text-white rounded-2xl font-semibold text-sm">
              Réessayer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileScanner;
