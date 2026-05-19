import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Circle, SlidersHorizontal, Square } from 'lucide-react';
import { cn } from '../../utils/cn';

// ── Color utilities ────────────────────────────────────────────────────────────

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else                h = ((r - g) / d + 4) * 60;
  }
  return [h, s, v];
}

function hexToRgb(hex: string): [number, number, number] | null {
  const c = hex.replace('#', '');
  if (c.length !== 6) return null;
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return isNaN(r + g + b) ? null : [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── Layout constants ───────────────────────────────────────────────────────────

const SIZE     = 180;
const CX       = SIZE / 2;
const RING_OUT = 90;
const RING_IN  = 72;
const RING_MID = 81;
const INNER_R  = 66;
const PREV_R   = 20;
// Minimum saturation to keep the dot outside the preview circle (+ 6px dot half-size)
const MIN_SAT_DIST = PREV_R + 8;   // px from center

// Arc for the brightness ring:
// gap is centered at atan2 90° (screen bottom), ±15° → 30° gap total → 330° arc
const GAP_HALF      = 15;                              // degrees, each side
const GAP_CENTER    = 90;                              // atan2° = screen bottom
const ARC_START     = (GAP_CENTER + GAP_HALF + 360) % 360;  // 105° (just after gap end)
const ARC_LENGTH    = 360 - GAP_HALF * 2;              // 330°
// CSS conic-gradient 'from X': offset so that gradient 0° = atan2 ARC_START
// CSS angle = atan2 angle + 90°
const RING_FROM_DEG = (ARC_START + 90) % 360;          // 195°

// Pure-hue conic. 'from 90deg' aligns hue 0° with east (atan2 convention).
const HUE_WHEEL = [
  0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
].map(h => `hsl(${h},100%,50%) ${h}deg`).join(', ');

// ── Brightness ring helpers ────────────────────────────────────────────────────

// atan2 angle (deg) → brightness value 0–1 (with gap snapping)
function angleToVal(atan2Deg: number): number {
  const rel = (atan2Deg - ARC_START + 360) % 360;
  if (rel <= ARC_LENGTH) return rel / ARC_LENGTH;
  // In gap zone → snap to nearest end
  return (rel - ARC_LENGTH) < (360 - rel) ? 1 : 0;
}

// brightness value 0–1 → atan2 angle (rad)
function valToRingRad(val: number): number {
  return ((ARC_START + val * ARC_LENGTH) % 360) * (Math.PI / 180);
}

// ── Config ─────────────────────────────────────────────────────────────────────

const RECENT_KEY     = 'openrig_recent_colors';
const DEFAULT_RECENT = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'];
const MAX_RECENT     = 6;

const BUTTON_RING  = 'conic-gradient(#ef4444 0deg 45deg,#f97316 45deg 90deg,#facc15 90deg 135deg,#22c55e 135deg 180deg,#06b6d4 180deg 225deg,#3b82f6 225deg 270deg,#8b5cf6 270deg 315deg,#ec4899 315deg 360deg)';
const HUE_LINEAR   = 'linear-gradient(to right,hsl(0,100%,50%),hsl(30,100%,50%),hsl(60,100%,50%),hsl(90,100%,50%),hsl(120,100%,50%),hsl(150,100%,50%),hsl(180,100%,50%),hsl(210,100%,50%),hsl(240,100%,50%),hsl(270,100%,50%),hsl(300,100%,50%),hsl(330,100%,50%),hsl(360,100%,50%))';

const sizeClasses = {
  sm: { outer: 'h-10 w-10', ring: 'h-7 w-7',   white: 'h-5 w-5', inner: 'h-3 w-3' },
  md: { outer: 'h-12 w-12', ring: 'h-9 w-9',   white: 'h-7 w-7', inner: 'h-5 w-5' },
  lg: { outer: 'h-14 w-14', ring: 'h-11 w-11', white: 'h-9 w-9', inner: 'h-7 w-7' },
} as const;

type ColorPickerButtonProps = {
  value?: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

// ── Component ──────────────────────────────────────────────────────────────────

const ColorPickerButton: React.FC<ColorPickerButtonProps> = ({
  value = '#111827',
  onChange,
  ariaLabel = 'Choisir une couleur',
  size = 'md',
  className,
}) => {
  const [open, setOpen]         = useState(false);
  const [mode, setMode]         = useState<'wheel' | 'sliders' | 'classic'>('wheel');
  const [hue, setHue]           = useState(0);
  const [sat, setSat]           = useState(1);
  const [val, setVal]           = useState(1);
  const [hexInput, setHexInput] = useState(value.replace('#', '').toUpperCase());
  const [recent, setRecent]     = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || 'null') ?? DEFAULT_RECENT; }
    catch { return DEFAULT_RECENT; }
  });

  const wrapperRef    = useRef<HTMLDivElement>(null);
  const panelRef      = useRef<HTMLDivElement>(null);
  const wheelRef      = useRef<HTMLDivElement>(null);
  const classicSvRef  = useRef<HTMLDivElement>(null);
  const dragging      = useRef<'ring' | 'sv' | null>(null);
  const skipSync      = useRef(false);
  const sizes       = sizeClasses[size];
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return; }
    const rgb = hexToRgb(value);
    if (!rgb) return;
    const [h, s, v] = rgbToHsv(...rgb);
    if (v > 0 && s > 0) setHue(h);
    if (v > 0) setSat(s);
    setVal(v);
    setHexInput(value.replace('#', '').toUpperCase());
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const inside = wrapperRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node);
      if (!inside) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Compute fixed position for portal panel (escapes any stacking context)
  useEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect    = wrapperRef.current.getBoundingClientRect();
    const PANEL   = 224;
    const PANEL_H = 420; // estimated panel height
    const MARGIN  = 8;
    const vw      = window.innerWidth;
    const vh      = window.innerHeight;
    // Horizontal: center on button, clamp to viewport
    let left = rect.left + rect.width / 2 - PANEL / 2 + window.scrollX;
    left = Math.max(MARGIN, Math.min(left, vw - PANEL - MARGIN));
    // Vertical: below by default, above if not enough space below
    const spaceBelow = vh - rect.bottom - MARGIN;
    const top = spaceBelow >= PANEL_H ? rect.bottom + 8 : rect.top - PANEL_H - 8;
    setPanelStyle({ position: 'fixed', top, left, width: PANEL, zIndex: 2147483647 });
  }, [open]);

  const pushRecent = useCallback((hex: string) => {
    setRecent(prev => {
      const next = [hex, ...prev.filter(c => c.toLowerCase() !== hex.toLowerCase())].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const emitColor = useCallback((h: number, s: number, v: number, addRecent = false) => {
    skipSync.current = true;
    const hex = rgbToHex(...hsvToRgb(h, s, v));
    setHexInput(hex.replace('#', '').toUpperCase());
    onChange(hex);
    if (addRecent) pushRecent(hex);
  }, [onChange, pushRecent]);

  // Classic SV square handler
  const handleClassicSv = useCallback((clientX: number, clientY: number, finish = false) => {
    const rect = classicSvRef.current?.getBoundingClientRect();
    if (!rect) return;
    const newSat = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newVal = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    setSat(newSat); setVal(newVal);
    emitColor(hue, newSat, newVal, finish);
  }, [hue, emitColor]);

  const onClassicSvDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleClassicSv(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => handleClassicSv(ev.clientX, ev.clientY);
    const onUp   = (ev: PointerEvent) => { handleClassicSv(ev.clientX, ev.clientY, true); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const handleWheel = useCallback((clientX: number, clientY: number, finish = false) => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    const lx = (clientX - rect.left) * scaleX;
    const ly = (clientY - rect.top)  * scaleY;
    const dx = lx - CX, dy = ly - CX;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mode = dragging.current;

    if (mode === 'ring' || (!mode && dist >= RING_IN - 6 && dist <= RING_OUT + 6)) {
      // Outer arc ring → brightness (0=black, 1=vivid)
      dragging.current = 'ring';
      const angle  = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const newVal = angleToVal(angle);
      setVal(newVal);
      emitColor(hue, sat, newVal, finish);

    } else if (mode === 'sv' || (!mode && dist < RING_IN)) {
      // Inner disc → hue (angle) + saturation (radius, 0=white at center, 1=vivid at edge)
      dragging.current = 'sv';
      const angle  = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const newHue = angle;
      const clampedDist = Math.min(INNER_R, Math.max(MIN_SAT_DIST, dist));
      // Linear remap: MIN_SAT_DIST → sat=0 (blanc), INNER_R → sat=1 (vif)
      const newSat = (clampedDist - MIN_SAT_DIST) / (INNER_R - MIN_SAT_DIST);
      setHue(newHue);
      setSat(newSat);
      emitColor(newHue, newSat, val, finish);
    }

    if (finish) dragging.current = null;
  }, [hue, sat, val, emitColor]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = null;
    handleWheel(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => handleWheel(ev.clientX, ev.clientY);
    const onUp   = (ev: PointerEvent) => {
      handleWheel(ev.clientX, ev.clientY, true);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const handleHexChange = (raw: string) => {
    const clean = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    setHexInput(clean.toUpperCase());
    if (clean.length === 6) {
      const rgb = hexToRgb('#' + clean);
      if (!rgb) return;
      const [h, s, v] = rgbToHsv(...rgb);
      setHue(h); setSat(s); setVal(v);
      onChange('#' + clean);
      pushRecent('#' + clean);
    }
  };

  // ── Dot positions ────────────────────────────────────────────────────────────

  // Ring dot: follows the arc (brightness)
  const ringRad  = valToRingRad(val);
  const ringDotX = CX + RING_MID * Math.cos(ringRad);
  const ringDotY = CX + RING_MID * Math.sin(ringRad);

  // Inner dot: hue (angle) + saturation (radius)
  const hueRad    = hue * Math.PI / 180;
  // Reverse-map sat back to pixel distance for dot position
  const innerDotDist = MIN_SAT_DIST + sat * (INNER_R - MIN_SAT_DIST);
  const innerDotX = CX + innerDotDist * Math.cos(hueRad);
  const innerDotY = CX + innerDotDist * Math.sin(hueRad);

  // Ring arc gradient: black (arc start, val=0) → vivid hue (arc end, val=1) → transparent (gap)
  const arcGradient = `conic-gradient(from ${RING_FROM_DEG}deg, #000 0deg, hsl(${hue},100%,50%) ${ARC_LENGTH}deg, transparent ${ARC_LENGTH}deg 360deg)`;

  return (
    <div ref={wrapperRef} className={cn('relative inline-flex', className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative inline-flex items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:border-gray-300 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100',
          sizes.outer,
        )}
        aria-label={ariaLabel}
      >
        <span className={cn('flex items-center justify-center rounded-full', sizes.ring)} style={{ background: BUTTON_RING }}>
          <span className={cn('flex items-center justify-center rounded-full bg-white', sizes.white)}>
            <span className={cn('rounded-full shadow-inner', sizes.inner)} style={{ backgroundColor: value }} />
          </span>
        </span>
      </button>

      {/* Panel */}
      {open && createPortal(
        <div
          ref={panelRef}
          className="rounded-xl border border-gray-200 bg-white shadow-2xl p-4"
          style={panelStyle}
        >
          {/* Header + toggle */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 leading-none">
              Choisir une couleur
            </p>
            <div className="flex shrink-0 rounded-md border border-gray-200 overflow-hidden ml-2">
              <button
                type="button"
                onClick={() => setMode('wheel')}
                className={cn('p-1 transition', mode === 'wheel' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50')}
                title="Roue chromatique"
              >
                <Circle className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMode('sliders')}
                className={cn('p-1 transition border-l border-gray-200', mode === 'sliders' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50')}
                title="Curseurs HSB"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMode('classic')}
                className={cn('p-1 transition border-l border-gray-200', mode === 'classic' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50')}
                title="Classique"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* ── Sliders mode ── */}
          {mode === 'sliders' && (() => {
            const hueRainbow = HUE_LINEAR;
            const satGrad    = `linear-gradient(to right,#fff,hsl(${hue},100%,50%))`;
            const valGrad    = `linear-gradient(to right,#000,hsl(${hue},100%,50%))`;
            const rows: { label: string; v: number; max: number; bg: string; thumb: string; onCh: (n: number) => void }[] = [
              { label: 'H', v: Math.round(hue),       max: 360, bg: hueRainbow, thumb: `hsl(${hue},100%,50%)`,                        onCh: n => { setHue(n);      emitColor(n, sat, val); } },
              { label: 'S', v: Math.round(sat * 100), max: 100, bg: satGrad,    thumb: `hsl(${hue},${Math.round(sat*100)}%,${Math.round(50+val*0)}%)`, onCh: n => { const s=n/100; setSat(s); emitColor(hue, s, val); } },
              { label: 'B', v: Math.round(val * 100), max: 100, bg: valGrad,    thumb: `hsl(${hue},100%,${Math.round(val*50)}%)`,      onCh: n => { const b=n/100; setVal(b); emitColor(hue, sat, b); } },
            ];
            return (
              <div className="mb-3 space-y-2.5">
                {rows.map(({ label, v, max, bg, thumb, onCh }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 w-3 shrink-0">{label}</span>
                    <div className="relative flex-1 h-3 rounded-full" style={{ background: bg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}>
                      <input
                        type="range" min={0} max={max} value={v}
                        onChange={e => onCh(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white pointer-events-none"
                        style={{ left: `calc(${(v/max)*100}% - 8px)`, backgroundColor: thumb, boxShadow: '0 0 0 1px rgba(0,0,0,0.2),0 1px 4px rgba(0,0,0,0.3)' }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 w-7 text-right shrink-0">{v}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Classic mode ── */}
          {mode === 'classic' && (
            <div className="mb-3">
              {/* SV square */}
              <div
                ref={classicSvRef}
                className="relative w-full rounded-lg mb-2 cursor-crosshair overflow-hidden select-none"
                style={{
                  height: 140,
                  background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, hsl(${hue},100%,50%))`,
                }}
                onPointerDown={onClassicSvDown}
              >
                <div
                  className="absolute w-3.5 h-3.5 rounded-full border-2 border-white pointer-events-none"
                  style={{
                    left: `${sat * 100}%`, top: `${(1 - val) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: value,
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.3)',
                  }}
                />
              </div>
              {/* Hue slider */}
              <div className="relative h-3 rounded-full" style={{ background: HUE_LINEAR, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}>
                <input
                  type="range" min={0} max={360} value={Math.round(hue)}
                  onChange={e => { const h = Number(e.target.value); setHue(h); emitColor(h, sat, val); }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white pointer-events-none"
                  style={{ left: `calc(${(hue / 360) * 100}% - 8px)`, backgroundColor: `hsl(${hue},100%,50%)`, boxShadow: '0 0 0 1px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.3)' }}
                />
              </div>
            </div>
          )}

          {/* ── Color wheel ── */}
          {mode === 'wheel' && <div className="flex justify-center mb-3">
            <div
              ref={wheelRef}
              className="relative cursor-crosshair select-none"
              style={{ width: SIZE, height: SIZE }}
              onPointerDown={onPointerDown}
            >
              {/* Outer arc brightness ring: black → vivid hue, transparent gap at bottom */}
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: arcGradient }}
              />

              {/* White donut mask — covers inner disc area */}
              <div
                className="absolute rounded-full bg-white pointer-events-none"
                style={{
                  width: RING_IN * 2, height: RING_IN * 2,
                  left: CX - RING_IN, top: CX - RING_IN,
                }}
              />

              {/* Inner disc: hue (angle) + saturation (radius)
                  Layer 1: rainbow conic (vivid colors at edge)
                  Layer 2: white radial overlay (white at center → transparent at edge)
                  → center = white (sat=0), edge = vivid hue (sat=1) */}
              <div
                className="absolute rounded-full overflow-hidden pointer-events-none"
                style={{
                  width: INNER_R * 2, height: INNER_R * 2,
                  left: CX - INNER_R, top: CX - INNER_R,
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{ background: `conic-gradient(from 90deg, ${HUE_WHEEL})` }}
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'radial-gradient(circle, #fff 0%, transparent 100%)' }}
                />
              </div>

              {/* Center preview circle */}
              <div
                className="absolute rounded-full border-[3px] border-white pointer-events-none"
                style={{
                  width: PREV_R * 2, height: PREV_R * 2,
                  left: CX - PREV_R, top: CX - PREV_R,
                  backgroundColor: value,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.2)',
                }}
              />

              {/* Brightness ring selector dot */}
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 14, height: 14,
                  left: ringDotX - 7, top: ringDotY - 7,
                  backgroundColor: `hsl(${hue},100%,${Math.round(val * 50)}%)`,
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 1.5px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.3)',
                }}
              />

              {/* Inner disc selector dot */}
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 13, height: 13,
                  left: innerDotX - 6.5, top: innerDotY - 6.5,
                  backgroundColor: value,
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 1.5px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.3)',
                }}
              />
            </div>
          </div>}

          {/* Hex input + preview */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className="h-8 w-8 flex-shrink-0 rounded-md border border-gray-200"
              style={{ backgroundColor: value }}
            />
            <div className="flex min-w-0 flex-1 items-center rounded-md border border-gray-300 px-2 py-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition">
              <span className="text-gray-400 text-sm select-none">#</span>
              <input
                type="text"
                value={hexInput}
                onChange={e => handleHexChange(e.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none text-gray-900 font-mono text-sm uppercase tracking-wider"
                maxLength={6}
                spellCheck={false}
              />
            </div>
          </div>

          {/* Recent colors — single row */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1.5">Couleurs récentes</p>
            <div className="flex items-center gap-1">
              {recent.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  title={c}
                  onClick={() => {
                    const rgb = hexToRgb(c);
                    if (!rgb) return;
                    const [h, s, v] = rgbToHsv(...rgb);
                    setHue(h); setSat(s); setVal(v);
                    setHexInput(c.replace('#', '').toUpperCase());
                    onChange(c);
                    pushRecent(c);
                  }}
                  className={cn(
                    'h-7 w-7 flex-shrink-0 rounded-md border-2 transition-transform hover:scale-110',
                    value.toLowerCase() === c.toLowerCase()
                      ? 'border-blue-500 shadow scale-110'
                      : 'border-transparent hover:border-gray-300',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ColorPickerButton;
