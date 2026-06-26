// 3D auto-arrangement (bin packing) for the truck-loading view, à la TruckPacker.
//
// Height-map / skyline packer: the floor is a grid of "available top height"
// cells. Wheel arches raise their cells so boxes rest on top of them rather than
// under them. Each box is placed (best-fit, lowest top, back-left) on the
// highest cell under its footprint, which gives natural stacking. Boxes may be
// yaw-rotated 90°, and leftovers spill to the next vehicle (or to "overflow").

import type { VehiclePreset } from '../constants/truckPresets';

export interface PackBox {
  key: string;       // source element key (for grouping/colour)
  name: string;
  length: number;    // metres (Z when un-rotated)
  width: number;     // metres (X when un-rotated)
  height: number;    // metres (Y)
  weightKg: number;
  /** Flights can be tipped onto any side (all 6 orientations); others stay upright. */
  tippable?: boolean;
}

export interface PackedBox extends PackBox {
  uid: string;
  x: number;         // centre, vehicle-relative (metres)
  y: number;         // base height
  z: number;
  rotation: number;  // 0 or π/2
}

const EPS = 1e-6;
const MAX_BOXES = 600; // safety cap

const newUid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Expand quantities into individual boxes, largest first (better packing). */
export const expandElements = (
  elements: { key: string; name: string; quantity: number; length: number; width: number; height: number; weightKg: number; tippable?: boolean }[],
): PackBox[] => {
  const boxes: PackBox[] = [];
  for (const el of elements) {
    const qty = Math.max(0, Math.floor(el.quantity || 0));
    for (let i = 0; i < qty; i += 1) {
      if (boxes.length >= MAX_BOXES) break;
      boxes.push({ key: el.key, name: el.name, length: el.length, width: el.width, height: el.height, weightKg: el.weightKg, tippable: el.tippable });
    }
  }
  // Sort by footprint area then height, descending — packs large items first.
  boxes.sort((a, b) => (b.width * b.length) - (a.width * a.length) || b.height - a.height);
  return boxes;
};

/**
 * Pack as many boxes as fit into one vehicle (height-map / skyline packer).
 * The floor is a grid of "available top height" cells; wheel arches raise their
 * cells to the arch height, so boxes can't be placed under an arch but can rest
 * on top of it. Best-fit: each box goes to the lowest resulting top, packed
 * toward the back-left. Boxes may be yaw-rotated 90°.
 */
export const packIntoVehicle = (boxes: PackBox[], preset: VehiclePreset): { placed: PackedBox[]; remaining: PackBox[] } => {
  const W = preset.width; const L = preset.length; const H = preset.height;
  const c = 0.2; // grid cell (metres)
  const cols = Math.max(1, Math.ceil(W / c));
  const rows = Math.max(1, Math.ceil(L / c));
  const grid = new Float64Array(cols * rows); // available top height per cell
  const at = (ci: number, ri: number) => ri * cols + ci;
  const cellX = (ci: number) => -W / 2 + (ci + 0.5) * c;
  const cellZ = (ri: number) => -L / 2 + (ri + 0.5) * c;

  // Wheel arches: raise the floor to the arch height across their footprint.
  for (const arch of preset.wheelArches || []) {
    const ax0 = arch.side === 'left' ? -W / 2 : W / 2 - arch.intrude;
    const ax1 = arch.side === 'left' ? -W / 2 + arch.intrude : W / 2;
    const az0 = arch.zCenter - arch.length / 2;
    const az1 = arch.zCenter + arch.length / 2;
    for (let ci = 0; ci < cols; ci += 1) {
      const cx = cellX(ci);
      if (cx < ax0 - EPS || cx > ax1 + EPS) continue;
      for (let ri = 0; ri < rows; ri += 1) {
        const cz = cellZ(ri);
        if (cz < az0 - EPS || cz > az1 + EPS) continue;
        const k = at(ci, ri);
        if (arch.height > grid[k]) grid[k] = arch.height;
      }
    }
  }

  const placed: PackedBox[] = [];
  const remaining: PackBox[] = [];

  for (const b of boxes) {
    let best: { ci: number; ri: number; cw: number; cl: number; base: number; top: number; bw: number; bl: number; bh: number } | null = null;
    const d = [b.width, b.length, b.height];
    // Upright = 2 yaw footprints; tippable (flights) = all 6 axis-aligned orientations.
    const upright: [number, number, number][] = [[d[0], d[1], d[2]], [d[1], d[0], d[2]]];
    const tipped: [number, number, number][] = [
      [d[0], d[1], d[2]], [d[1], d[0], d[2]],
      [d[0], d[2], d[1]], [d[2], d[0], d[1]],
      [d[1], d[2], d[0]], [d[2], d[1], d[0]],
    ];
    const orients = b.tippable ? tipped : upright;
    for (const [bw, bl, bh] of orients) {
      if (bw > W + EPS || bl > L + EPS || bh > H + EPS) continue;
      const cw = Math.max(1, Math.ceil(bw / c - EPS));
      const cl = Math.max(1, Math.ceil(bl / c - EPS));
      if (cw > cols || cl > rows) continue;
      for (let ri = 0; ri + cl <= rows; ri += 1) {
        for (let ci = 0; ci + cw <= cols; ci += 1) {
          let base = 0;
          for (let dr = 0; dr < cl; dr += 1) {
            for (let dc = 0; dc < cw; dc += 1) {
              const hh = grid[at(ci + dc, ri + dr)];
              if (hh > base) base = hh;
            }
          }
          if (base + bh > H + EPS) continue;
          const top = base + bh;
          if (!best
            || top < best.top - EPS
            || (Math.abs(top - best.top) < EPS && (ri < best.ri || (ri === best.ri && ci < best.ci)))) {
            best = { ci, ri, cw, cl, base, top, bw, bl, bh };
          }
        }
      }
    }
    if (!best) { remaining.push(b); continue; }
    for (let dr = 0; dr < best.cl; dr += 1) {
      for (let dc = 0; dc < best.cw; dc += 1) grid[at(best.ci + dc, best.ri + dr)] = best.top;
    }
    const xLeft = -W / 2 + best.ci * c;
    const zLeft = -L / 2 + best.ri * c;
    // The chosen orientation is baked into the rendered dimensions (axis-aligned tip).
    placed.push({
      ...b, uid: newUid(),
      width: best.bw, length: best.bl, height: best.bh,
      x: xLeft + best.bw / 2, y: best.base, z: zLeft + best.bl / 2, rotation: 0,
    });
  }
  return { placed, remaining };
};

/** Distribute all boxes across the given vehicles in order, spilling forward. */
export const packVehicles = (
  boxes: PackBox[],
  vehicles: { uid: string; preset: VehiclePreset }[],
): { placements: Record<string, PackedBox[]>; overflow: PackBox[]; placedCount: number } => {
  const placements: Record<string, PackedBox[]> = {};
  let remaining = boxes;
  let placedCount = 0;
  for (const v of vehicles) {
    const { placed, remaining: rem } = packIntoVehicle(remaining, v.preset);
    placements[v.uid] = placed;
    placedCount += placed.length;
    remaining = rem;
  }
  return { placements, overflow: remaining, placedCount };
};

export interface VehicleMetrics {
  volumeUsed: number;
  volumeCap: number;
  volumePct: number;
  weight: number;
  payload: number;
  weightPct: number;
  count: number;
}

export const vehicleMetrics = (
  preset: VehiclePreset,
  placed: { length: number; width: number; height: number; weightKg: number }[],
): VehicleMetrics => {
  const volumeUsed = placed.reduce((s, p) => s + p.length * p.width * p.height, 0);
  const volumeCap = preset.length * preset.width * preset.height;
  const weight = placed.reduce((s, p) => s + (p.weightKg || 0), 0);
  const payload = preset.payloadKg || 0;
  return {
    volumeUsed,
    volumeCap,
    volumePct: volumeCap > 0 ? Math.min(999, (volumeUsed / volumeCap) * 100) : 0,
    weight,
    payload,
    weightPct: payload > 0 ? (weight / payload) * 100 : 0,
    count: placed.length,
  };
};
