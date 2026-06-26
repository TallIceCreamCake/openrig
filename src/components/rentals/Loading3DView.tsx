import React from 'react';
import { Orbit, Hand, ZoomIn, Move3d, Rotate3d } from 'lucide-react';
import type { VehiclePreset } from '../../constants/truckPresets';

/**
 * Dependency-free 3D viewport (2D-canvas projection) with mouse manipulation
 * tools: orbit / pan / zoom the camera, and move / rotate the loaded objects.
 * Wheel always zooms and never scrolls the page.
 */

type Vec3 = { x: number; y: number; z: number };
type Tool = 'orbit' | 'pan' | 'zoom' | 'move' | 'rotate';

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

export interface LoadBox {
  id: string;
  name?: string;
  length: number; // metres
  width: number;
  height: number;
  x?: number;        // centre position on the floor (metres)
  y?: number;        // base height (for stacking), metres
  z?: number;
  rotation?: number; // yaw, radians
  color?: string;    // hex fill colour
}

interface PlacedVehicle {
  preset: VehiclePreset;
  ox: number;
}

interface Loading3DViewProps {
  className?: string;
  vehicles?: VehiclePreset[];
  items?: LoadBox[];
  onItemTransform?: (id: string, t: { x?: number; y?: number; z?: number; rotation?: number }) => void;
  /** Preview mode: only camera tools, no object manipulation. */
  readOnly?: boolean;
}

const NEAR = 0.05;
const GAP = 0.6;
const FOV = (50 * Math.PI) / 180;

// Magnetic snapping + containment helpers.
const SNAP_POS = 0.05;            // 5 cm grid
const SNAP_ANG = Math.PI / 12;    // 15° (→ 90 / 180 reachable)
const snapPos = (v: number) => Math.round(v / SNAP_POS) * SNAP_POS;
const snapAng = (a: number) => Math.round(a / SNAP_ANG) * SNAP_ANG;
const clampN = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
/** Half-extents of a yaw-rotated footprint (axis-aligned bounding box). */
const footprintHalf = (w: number, l: number, rot: number) => {
  const c = Math.abs(Math.cos(rot)); const s = Math.abs(Math.sin(rot));
  return { hx: (c * w + s * l) / 2, hz: (s * w + c * l) / 2 };
};
const hexToRgb = (hex: string): [number, number, number] | null => {
  const h = hex.replace('#', '').trim();
  const n = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  if (n.length !== 6) return null;
  const int = Number.parseInt(n, 16);
  if (Number.isNaN(int)) return null;
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
};

const TOOLS: { id: Tool; icon: typeof Orbit; label: string }[] = [
  { id: 'orbit', icon: Orbit, label: 'Orbit caméra' },
  { id: 'pan', icon: Hand, label: 'Déplacer caméra' },
  { id: 'zoom', icon: ZoomIn, label: 'Zoom' },
  { id: 'move', icon: Move3d, label: 'Déplacer objet' },
  { id: 'rotate', icon: Rotate3d, label: 'Tourner objet' },
];

const Loading3DView: React.FC<Loading3DViewProps> = ({ className = '', vehicles = [], items = [], onItemTransform, readOnly = false }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const camRef = React.useRef({ theta: Math.PI * 0.25, phi: Math.PI * 0.28, dist: 24 });
  const targetRef = React.useRef({ x: 0, y: 0, z: 0 });
  const sizeRef = React.useRef({ w: 0, h: 0 });
  const itemsRef = React.useRef<LoadBox[]>(items);
  itemsRef.current = items;
  const labelCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = React.useState<Tool>('orbit');
  const toolRef = React.useRef<Tool>('orbit');
  toolRef.current = tool;
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selectedIdRef = React.useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // Preview mode keeps camera tools only.
  React.useEffect(() => {
    if (readOnly && (tool === 'move' || tool === 'rotate')) setTool('orbit');
  }, [readOnly, tool]);
  const visibleTools = readOnly ? TOOLS.filter((t) => t.id === 'orbit' || t.id === 'pan' || t.id === 'zoom') : TOOLS;

  // Drag state
  const dragRef = React.useRef<{ x: number; y: number } | null>(null);
  const objDragRef = React.useRef<{ id: string; gx: number; gz: number; startRot: number; startX: number } | null>(null);
  const axisDragRef = React.useRef<{
    id: string; axis: 'x' | 'y' | 'z'; sx: number; sy: number;
    startX: number; startY: number; startZ: number; dirSx: number; dirSy: number; pxPerWorld: number;
  } | null>(null);

  const layout = React.useMemo(() => {
    const totalWidth = vehicles.reduce((s, v) => s + v.width, 0) + GAP * Math.max(0, vehicles.length - 1);
    let cursor = -totalWidth / 2;
    const placed: PlacedVehicle[] = vehicles.map((preset) => {
      const ox = cursor + preset.width / 2;
      cursor += preset.width + GAP;
      return { preset, ox };
    });
    const maxLength = vehicles.reduce((m, v) => Math.max(m, v.length), 0);
    const maxHeight = vehicles.reduce((m, v) => Math.max(m, v.height), 0);
    const fitDist = Math.hypot(totalWidth, maxLength) * 1.1 + maxHeight * 1.5 + 6;
    const gridHalf = Math.min(40, Math.max(6, Math.ceil(Math.max(totalWidth, maxLength, 4) / 2) + 2));
    return { placed, gridHalf, fitDist };
  }, [vehicles]);

  const signature = vehicles.map((v) => v.id).join('|') + `#${vehicles.length}`;
  React.useEffect(() => {
    camRef.current.dist = layout.fitDist;
    targetRef.current = { x: 0, y: 0, z: 0 };
    requestAnimationFrame(() => drawRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const drawRef = React.useRef<() => void>(() => {});

  // Camera basis + projection helpers, computed from the current refs.
  const getView = React.useCallback(() => {
    const { w, h } = sizeRef.current;
    const { theta, phi, dist } = camRef.current;
    const target: Vec3 = { x: targetRef.current.x, y: targetRef.current.y, z: targetRef.current.z };
    const camPos: Vec3 = {
      x: target.x + dist * Math.cos(phi) * Math.sin(theta),
      y: dist * Math.sin(phi),
      z: target.z + dist * Math.cos(phi) * Math.cos(theta),
    };
    const forward = norm(sub(target, camPos));
    const right = norm(cross(forward, { x: 0, y: 1, z: 0 }));
    const up = cross(right, forward);
    const focal = (h * 0.5) / Math.tan(FOV / 2);
    const cx = w / 2;
    const cy = h / 2;
    const toCam = (p: Vec3): Vec3 => {
      const v = sub(p, camPos);
      return { x: dot(v, right), y: dot(v, up), z: dot(v, forward) };
    };
    const project = (c: Vec3) => ({ x: cx + (c.x / c.z) * focal, y: cy - (c.y / c.z) * focal });
    const unprojectFloor = (sx: number, sy: number): { x: number; z: number } | null => {
      const cxs = (sx - cx) / focal;
      const cys = (cy - sy) / focal;
      const dir = norm({
        x: right.x * cxs + up.x * cys + forward.x,
        y: right.y * cxs + up.y * cys + forward.y,
        z: right.z * cxs + up.z * cys + forward.z,
      });
      if (Math.abs(dir.y) < 1e-6) return null;
      const t = -camPos.y / dir.y;
      if (t <= 0) return null;
      return { x: camPos.x + dir.x * t, z: camPos.z + dir.z * t };
    };
    return { camPos, right, up, forward, focal, cx, cy, toCam, project, unprojectFloor };
  }, []);

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w, h } = sizeRef.current;
    const view = getView();
    const { toCam, project } = view;

    const drawSeg = (a: Vec3, b: Vec3, color: string, width: number) => {
      let ca = toCam(a);
      let cb = toCam(b);
      if (ca.z < NEAR && cb.z < NEAR) return;
      if (ca.z < NEAR) {
        const t = (NEAR - ca.z) / (cb.z - ca.z);
        ca = { x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t, z: NEAR };
      } else if (cb.z < NEAR) {
        const t = (NEAR - cb.z) / (ca.z - cb.z);
        cb = { x: cb.x + (ca.x - cb.x) * t, y: cb.y + (ca.y - cb.y) * t, z: NEAR };
      }
      const pa = project(ca);
      const pb = project(cb);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    const fillQuad = (pts: Vec3[], color: string) => {
      const cs = pts.map(toCam);
      if (cs.some((c) => c.z < NEAR)) return;
      ctx.beginPath();
      cs.forEach((c, i) => { const p = project(c); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    const polyline = (pts: Vec3[], color: string, width: number) => {
      for (let i = 0; i < pts.length - 1; i += 1) drawSeg(pts[i], pts[i + 1], color, width);
    };

    ctx.clearRect(0, 0, w, h);

    // Ground grid (offset by the pan target so it scrolls with the camera).
    const n = layout.gridHalf;
    const tx = Math.round(targetRef.current.x);
    const tz = Math.round(targetRef.current.z);
    for (let i = -n; i <= n; i += 1) {
      const gx = i + tx;
      const gz = i + tz;
      const axisX = gx === 0;
      const axisZ = gz === 0;
      drawSeg({ x: gx, y: 0, z: tz - n }, { x: gx, y: 0, z: tz + n }, axisX ? 'rgba(148,163,184,0.9)' : 'rgba(203,213,225,0.55)', axisX ? 1.4 : 1);
      drawSeg({ x: tx - n, y: 0, z: gz }, { x: tx + n, y: 0, z: gz }, axisZ ? 'rgba(148,163,184,0.9)' : 'rgba(203,213,225,0.55)', axisZ ? 1.4 : 1);
    }

    const EDGE = 'rgba(234,88,12,0.95)';
    const SOFT = 'rgba(249,115,22,0.45)';
    const ARCH = 'rgba(100,116,139,0.9)';

    layout.placed.forEach(({ preset, ox }) => {
      const W = preset.width; const H = preset.height; const L = preset.length;
      const x0 = ox - W / 2; const x1 = ox + W / 2; const z0 = -L / 2; const z1 = L / 2;
      const curve = preset.roofCurve || 0;
      const Hs = Math.max(0.05, H - curve);
      const curveY = (xl: number) => { const t = (2 * xl) / W; return Hs + (H - Hs) * (1 - t * t); };

      fillQuad([{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }, { x: x0, y: 0, z: z1 }], 'rgba(249,115,22,0.06)');
      polyline([{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }, { x: x0, y: 0, z: z1 }, { x: x0, y: 0, z: z0 }], EDGE, 1.6);
      drawSeg({ x: x0, y: 0, z: z0 }, { x: x0, y: Hs, z: z0 }, EDGE, 1.4);
      drawSeg({ x: x1, y: 0, z: z0 }, { x: x1, y: Hs, z: z0 }, EDGE, 1.4);
      drawSeg({ x: x0, y: 0, z: z1 }, { x: x0, y: Hs, z: z1 }, EDGE, 1.4);
      drawSeg({ x: x1, y: 0, z: z1 }, { x: x1, y: Hs, z: z1 }, EDGE, 1.4);
      drawSeg({ x: x0, y: Hs, z: z0 }, { x: x0, y: Hs, z: z1 }, EDGE, 1.4);
      drawSeg({ x: x1, y: Hs, z: z0 }, { x: x1, y: Hs, z: z1 }, EDGE, 1.4);
      const SAMPLES = 10; const frontArc: Vec3[] = []; const backArc: Vec3[] = [];
      for (let s = 0; s <= SAMPLES; s += 1) {
        const xl = -W / 2 + (W * s) / SAMPLES; const y = curveY(xl);
        frontArc.push({ x: ox + xl, y, z: z1 }); backArc.push({ x: ox + xl, y, z: z0 });
      }
      polyline(frontArc, EDGE, 1.4); polyline(backArc, EDGE, 1.4);
      for (let s = 0; s <= 4; s += 1) {
        const xl = -W / 2 + (W * s) / 4; const y = curveY(xl);
        drawSeg({ x: ox + xl, y, z: z0 }, { x: ox + xl, y, z: z1 }, s === 0 || s === 4 ? EDGE : SOFT, s === 0 || s === 4 ? 1.4 : 1);
      }
      (preset.wheelArches || []).forEach((arch) => {
        const ax0 = arch.side === 'left' ? x0 : x1 - arch.intrude;
        const ax1 = arch.side === 'left' ? x0 + arch.intrude : x1;
        const az0 = arch.zCenter - arch.length / 2; const az1 = arch.zCenter + arch.length / 2; const ay = arch.height;
        fillQuad([{ x: ax0, y: ay, z: az0 }, { x: ax1, y: ay, z: az0 }, { x: ax1, y: ay, z: az1 }, { x: ax0, y: ay, z: az1 }], 'rgba(100,116,139,0.18)');
        polyline([{ x: ax0, y: ay, z: az0 }, { x: ax1, y: ay, z: az0 }, { x: ax1, y: ay, z: az1 }, { x: ax0, y: ay, z: az1 }, { x: ax0, y: ay, z: az0 }], ARCH, 1.2);
        ([[ax0, az0], [ax1, az0], [ax0, az1], [ax1, az1]] as const).forEach(([vx, vz]) => drawSeg({ x: vx, y: 0, z: vz }, { x: vx, y: ay, z: vz }, ARCH, 1.2));
      });
    });

    // ── Loaded objects: solid shaded boxes, labelled on each visible face ─────
    const v0 = layout.placed[0];
    if (v0 && itemsRef.current.length) {
      const ox = v0.ox;
      const camPos = view.camPos;
      const lightDir = norm({ x: 0.4, y: 1, z: 0.35 });
      const BASE: [number, number, number][] = [
        [37, 99, 235], [16, 185, 129], [168, 85, 247], [245, 158, 11], [236, 72, 153],
      ];
      const colorIdx = (s: string) => { let hsh = 0; for (let i = 0; i < s.length; i += 1) hsh = (hsh * 31 + s.charCodeAt(i)) >>> 0; return hsh % BASE.length; };
      // Faces: bottom (no label), top, and 4 sides. For labelled faces, tl/tr/bl
      // are the top-left / top-right / bottom-left corners (so text stays upright).
      const FACE_DEFS: { quad: number[]; tl?: number; tr?: number; bl?: number }[] = [
        { quad: [0, 1, 2, 3] },
        { quad: [4, 5, 6, 7], tl: 4, tr: 5, bl: 7 },
        { quad: [0, 1, 5, 4], tl: 4, tr: 5, bl: 0 },
        { quad: [1, 2, 6, 5], tl: 5, tr: 6, bl: 1 },
        { quad: [2, 3, 7, 6], tl: 6, tr: 7, bl: 2 },
        { quad: [3, 0, 4, 7], tl: 7, tr: 4, bl: 3 },
      ];

      if (!labelCanvasRef.current) labelCanvasRef.current = document.createElement('canvas');
      const lc = labelCanvasRef.current;
      const lctx = lc.getContext('2d');
      const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

      // Paint text onto a face, perspective-mapped via a 3-corner affine.
      const drawSurfaceLabel = (corners: Vec3[], tlI: number, trI: number, blI: number, text: string, darkText: boolean) => {
        if (!lctx) return;
        const wTL = corners[tlI]; const wTR = corners[trI]; const wBL = corners[blI];
        const cTL = toCam(wTL); const cTR = toCam(wTR); const cBL = toCam(wBL);
        if (cTL.z < NEAR || cTR.z < NEAR || cBL.z < NEAR) return;
        const A = project(cTL); const B = project(cTR); const C = project(cBL);
        const PXM = 150;
        const w = Math.max(16, Math.min(640, Math.round(dist3(wTR, wTL) * PXM)));
        const h = Math.max(16, Math.min(640, Math.round(dist3(wBL, wTL) * PXM)));
        lc.width = w; lc.height = h;
        lctx.clearRect(0, 0, w, h);
        const label = text.length > 18 ? `${text.slice(0, 17)}…` : text;
        let fs = h * 0.42;
        lctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`;
        const tw = lctx.measureText(label).width;
        if (tw > w * 0.86) { fs = Math.max(8, (fs * w * 0.86) / tw); lctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`; }
        lctx.textAlign = 'center';
        lctx.textBaseline = 'middle';
        lctx.fillStyle = darkText ? '#0f172a' : '#ffffff';
        lctx.fillText(label, w / 2, h / 2);
        ctx.save();
        ctx.transform((B.x - A.x) / w, (B.y - A.y) / w, (C.x - A.x) / h, (C.y - A.y) / h, A.x, A.y);
        ctx.drawImage(lc, 0, 0);
        ctx.restore();
      };

      // Build box corners + centre, then paint back-to-front (painter's order).
      const boxes = itemsRef.current.map((box) => {
        const cx0 = ox + (box.x || 0); const cz0 = box.z || 0; const rot = box.rotation || 0;
        const hw = box.width / 2; const hl = box.length / 2; const by = box.height;
        const cr = Math.cos(rot); const sr = Math.sin(rot);
        const foot = ([[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]] as const).map(([dx, dz]) => ({
          x: cx0 + dx * cr - dz * sr, z: cz0 + dx * sr + dz * cr,
        }));
        const y0 = box.y || 0;
        const corners: Vec3[] = [
          ...foot.map((f) => ({ x: f.x, y: y0, z: f.z })),
          ...foot.map((f) => ({ x: f.x, y: y0 + by, z: f.z })),
        ];
        const rgb = (box.color && hexToRgb(box.color)) || BASE[colorIdx(box.name || box.id)];
        return { box, corners, center: { x: cx0, y: y0 + by / 2, z: cz0 } as Vec3, rgb };
      });
      const d2 = (a: Vec3) => (a.x - camPos.x) ** 2 + (a.y - camPos.y) ** 2 + (a.z - camPos.z) ** 2;
      boxes.sort((a, b) => d2(b.center) - d2(a.center));

      boxes.forEach(({ box, corners, center, rgb }) => {
        FACE_DEFS.forEach((def) => {
          const pts = def.quad.map((i) => corners[i]);
          let nrm = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
          const fc: Vec3 = {
            x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4,
            y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4,
            z: (pts[0].z + pts[1].z + pts[2].z + pts[3].z) / 4,
          };
          if (dot(nrm, sub(fc, center)) < 0) nrm = { x: -nrm.x, y: -nrm.y, z: -nrm.z };
          if (dot(nrm, sub(camPos, fc)) <= 0) return; // cull faces pointing away
          const sh = 0.5 + 0.5 * Math.max(0, dot(nrm, lightDir));
          const [r, g, b] = rgb;
          const rr = r * sh; const gg = g * sh; const bb = b * sh;
          fillQuad(pts, `rgba(${Math.round(rr)}, ${Math.round(gg)}, ${Math.round(bb)}, 0.97)`);
          polyline([...pts, pts[0]], 'rgba(0,0,0,0.16)', 1);
          if (def.tl != null && box.name) {
            const lum = 0.299 * rr + 0.587 * gg + 0.114 * bb;
            drawSurfaceLabel(corners, def.tl, def.tr!, def.bl!, box.name, lum > 150);
          }
        });
        if (box.id === selectedIdRef.current) {
          const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
          E.forEach(([a, b]) => drawSeg(corners[a], corners[b], 'rgba(255,255,255,0.95)', 1.6));
        }
      });

      // Translate gizmo (3D arrows) on the selected object, in move mode.
      const sel = boxes.find((bx) => bx.box.id === selectedIdRef.current);
      if (sel && toolRef.current === 'move') {
        const { box, center } = sel;
        const Lg = Math.min(1.6, Math.max(0.5, 0.35 + Math.max(box.width, box.length, box.height) * 0.6));
        const AX: { dir: Vec3; color: string }[] = [
          { dir: { x: 1, y: 0, z: 0 }, color: 'rgba(239,68,68,1)' },
          { dir: { x: 0, y: 1, z: 0 }, color: 'rgba(34,197,94,1)' },
          { dir: { x: 0, y: 0, z: 1 }, color: 'rgba(59,130,246,1)' },
        ];
        AX.forEach(({ dir, color }) => {
          const end = { x: center.x + dir.x * Lg, y: center.y + dir.y * Lg, z: center.z + dir.z * Lg };
          const cC = toCam(center); const cE = toCam(end);
          if (cC.z < NEAR || cE.z < NEAR) return;
          const A = project(cC); const B = project(cE);
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
          ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
          const ddx = B.x - A.x; const ddy = B.y - A.y; const len = Math.hypot(ddx, ddy) || 1;
          const ux = ddx / len; const uy = ddy / len; const px = -uy; const py = ux;
          ctx.beginPath();
          ctx.moveTo(B.x, B.y);
          ctx.lineTo(B.x - ux * 12 + px * 5, B.y - uy * 12 + py * 5);
          ctx.lineTo(B.x - ux * 12 - px * 5, B.y - uy * 12 - py * 5);
          ctx.closePath(); ctx.fillStyle = color; ctx.fill();
        });
      }
    }
  }, [getView, layout]);

  drawRef.current = draw;
  React.useEffect(() => { draw(); }, [draw, items, selectedId, tool]);

  const resize = React.useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth; const h = parent.clientHeight;
    sizeRef.current = { w, h };
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }, [draw]);

  React.useEffect(() => {
    resize();
    const parent = canvasRef.current?.parentElement;
    let observer: ResizeObserver | null = null;
    if (parent && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => resize());
      observer.observe(parent);
    }
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); if (observer) observer.disconnect(); };
  }, [resize]);

  // Native, non-passive wheel listener: zoom and prevent the page from scrolling.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camRef.current;
      cam.dist = Math.min(Math.max(cam.dist * Math.exp(e.deltaY * 0.001), 2), 140);
      draw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [draw]);

  const pickItem = (sx: number, sy: number): LoadBox | null => {
    const hit = getView().unprojectFloor(sx, sy);
    if (!hit) return null;
    const v0 = layout.placed[0];
    const ox = v0 ? v0.ox : 0;
    // topmost (last drawn) first
    for (let i = itemsRef.current.length - 1; i >= 0; i -= 1) {
      const box = itemsRef.current[i];
      const cx0 = ox + (box.x || 0); const cz0 = box.z || 0; const rot = box.rotation || 0;
      const dx = hit.x - cx0; const dz = hit.z - cz0;
      const lx = dx * Math.cos(-rot) - dz * Math.sin(-rot);
      const lz = dx * Math.sin(-rot) + dz * Math.cos(-rot);
      if (Math.abs(lx) <= box.width / 2 && Math.abs(lz) <= box.length / 2) return box;
    }
    return null;
  };

  const distToSeg = (px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const vx = b.x - a.x; const vy = b.y - a.y; const wx = px - a.x; const wy = py - a.y;
    const c1 = vx * wx + vy * wy; if (c1 <= 0) return Math.hypot(px - a.x, py - a.y);
    const c2 = vx * vx + vy * vy; if (c2 <= c1) return Math.hypot(px - b.x, py - b.y);
    const t = c1 / c2; return Math.hypot(px - (a.x + t * vx), py - (a.y + t * vy));
  };

  // Which translate-gizmo axis (if any) is under the cursor on the selected box.
  const pickGizmoAxis = (box: LoadBox, sx: number, sy: number) => {
    const view = getView();
    const v0 = layout.placed[0]; const ox = v0 ? v0.ox : 0;
    const center: Vec3 = { x: ox + (box.x || 0), y: (box.y || 0) + box.height / 2, z: box.z || 0 };
    const Lg = Math.min(1.6, Math.max(0.5, 0.35 + Math.max(box.width, box.length, box.height) * 0.6));
    const axes: ['x' | 'y' | 'z', Vec3][] = [
      ['x', { x: 1, y: 0, z: 0 }], ['y', { x: 0, y: 1, z: 0 }], ['z', { x: 0, y: 0, z: 1 }],
    ];
    let best: { axis: 'x' | 'y' | 'z'; dirSx: number; dirSy: number; pxPerWorld: number } | null = null;
    let bestDist = 10;
    for (const [axis, dir] of axes) {
      const cC = view.toCam(center);
      const cE = view.toCam({ x: center.x + dir.x * Lg, y: center.y + dir.y * Lg, z: center.z + dir.z * Lg });
      if (cC.z < NEAR || cE.z < NEAR) continue;
      const A = view.project(cC); const B = view.project(cE);
      const d = distToSeg(sx, sy, A, B);
      if (d < bestDist) {
        bestDist = d;
        const segLen = Math.hypot(B.x - A.x, B.y - A.y) || 1;
        best = { axis, dirSx: (B.x - A.x) / segLen, dirSy: (B.y - A.y) / segLen, pxPerWorld: segLen / Lg };
      }
    }
    return best;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = toolRef.current;
    if (t === 'move') {
      // Drag a gizmo arrow on the currently selected object…
      const sel = itemsRef.current.find((b) => b.id === selectedIdRef.current);
      if (sel) {
        const hit = pickGizmoAxis(sel, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        if (hit) {
          axisDragRef.current = {
            id: sel.id, axis: hit.axis, sx: e.clientX, sy: e.clientY,
            startX: sel.x || 0, startY: sel.y || 0, startZ: sel.z || 0,
            dirSx: hit.dirSx, dirSy: hit.dirSy, pxPerWorld: hit.pxPerWorld,
          };
          return;
        }
      }
      // …otherwise select (or deselect) the clicked object.
      const box = pickItem(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      setSelectedId(box ? box.id : null);
      return;
    }
    if (t === 'rotate') {
      const box = pickItem(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      if (box) {
        const v0 = layout.placed[0]; const ox = v0 ? v0.ox : 0;
        const hit = getView().unprojectFloor(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        objDragRef.current = {
          id: box.id,
          gx: (ox + (box.x || 0)) - (hit?.x ?? 0),
          gz: (box.z || 0) - (hit?.z ?? 0),
          startRot: box.rotation || 0,
          startX: e.clientX,
        };
        setSelectedId(box.id);
      }
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = toolRef.current;
    // Gizmo axis drag (move tool)
    if (axisDragRef.current) {
      const ad = axisDragRef.current;
      const deltaPx = (e.clientX - ad.sx) * ad.dirSx + (e.clientY - ad.sy) * ad.dirSy;
      const worldDelta = deltaPx / (ad.pxPerWorld || 1);
      const v0 = layout.placed[0]; const preset = v0?.preset;
      const box = itemsRef.current.find((b) => b.id === ad.id);
      if (box && preset) {
        const { hx, hz } = footprintHalf(box.width, box.length, box.rotation || 0);
        if (ad.axis === 'x') {
          const nx = clampN(snapPos(ad.startX + worldDelta), -preset.width / 2 + hx, preset.width / 2 - hx);
          onItemTransform?.(ad.id, { x: nx });
        } else if (ad.axis === 'z') {
          const nz = clampN(snapPos(ad.startZ + worldDelta), -preset.length / 2 + hz, preset.length / 2 - hz);
          onItemTransform?.(ad.id, { z: nz });
        } else {
          const ny = clampN(snapPos(ad.startY + worldDelta), 0, Math.max(0, preset.height - box.height));
          onItemTransform?.(ad.id, { y: ny });
        }
      }
      return;
    }
    // Object manipulation
    if (objDragRef.current) {
      const od = objDragRef.current;
      const v0 = layout.placed[0]; const preset = v0?.preset; const ox = v0 ? v0.ox : 0;
      if (t === 'rotate') {
        const rot = snapAng(od.startRot + (e.clientX - od.startX) * 0.01);
        const box = itemsRef.current.find((b) => b.id === od.id);
        if (box && preset) {
          const { hx, hz } = footprintHalf(box.width, box.length, rot);
          const nx = clampN(box.x || 0, -preset.width / 2 + hx, preset.width / 2 - hx);
          const nz = clampN(box.z || 0, -preset.length / 2 + hz, preset.length / 2 - hz);
          onItemTransform?.(od.id, { rotation: rot, x: nx, z: nz });
        } else {
          onItemTransform?.(od.id, { rotation: rot });
        }
      } else {
        const hit = getView().unprojectFloor(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        if (hit && preset) {
          let nx = (hit.x + od.gx) - ox;
          let nz = hit.z + od.gz;
          const box = itemsRef.current.find((b) => b.id === od.id);
          const hw = (box?.width || 0) / 2; const hl = (box?.length || 0) / 2;
          nx = Math.min(Math.max(nx, -preset.width / 2 + hw), preset.width / 2 - hw);
          nz = Math.min(Math.max(nz, -preset.length / 2 + hl), preset.length / 2 - hl);
          onItemTransform?.(od.id, { x: nx, z: nz });
        }
      }
      return;
    }
    // Camera
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    const cam = camRef.current;
    if (t === 'orbit') {
      cam.theta -= dx * 0.01;
      cam.phi = Math.min(Math.max(cam.phi - dy * 0.01, 0.05), Math.PI / 2 - 0.05);
    } else if (t === 'zoom') {
      cam.dist = Math.min(Math.max(cam.dist * Math.exp(dy * 0.005), 2), 140);
    } else if (t === 'pan') {
      const { right, forward, focal } = getView();
      const fwdGround = norm({ x: forward.x, y: 0, z: forward.z });
      const k = cam.dist / (focal || 1);
      targetRef.current.x += (-dx * right.x + dy * fwdGround.x) * k;
      targetRef.current.z += (-dx * right.z + dy * fwdGround.z) * k;
    }
    draw();
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    objDragRef.current = null;
    axisDragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const cursor = tool === 'move' || tool === 'rotate' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing';

  return (
    <div className="relative h-full w-full">
      {/* Tool palette */}
      <div className="absolute left-2 top-2 z-10 flex flex-col gap-1 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        {visibleTools.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            title={label}
            aria-label={label}
            className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
              tool === id ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className={`block h-full w-full touch-none select-none ${cursor} ${className}`}
      />
    </div>
  );
};

export default Loading3DView;
