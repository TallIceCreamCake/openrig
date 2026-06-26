// Predefined cargo volumes for the 3D loading view. Interior cargo dimensions
// in metres: length (Z, front↔rear), width (X), height (Y). Wheel arches model
// the boxes that intrude into the floor on each side of a van; roofCurve models
// a rounded roof (drop at the sides vs the centre).

export interface WheelArch {
  side: 'left' | 'right';
  intrude: number; // metres taken from the side (along X)
  height: number;  // metres up (Y)
  length: number;  // metres along the vehicle (Z)
  zCenter: number; // position along length relative to the cargo centre (rear is negative)
}

export interface VehiclePreset {
  id: string;
  name: string;
  category: string;
  length: number;
  width: number;
  height: number;
  payloadKg?: number;
  /** Roof drop at the sides (metres). 0 = flat roof. */
  roofCurve?: number;
  wheelArches?: WheelArch[];
}

export interface VehiclePresetGroup {
  id: string;
  label: string;
  presets: VehiclePreset[];
}

// Symmetric pair of rear wheel arches for a van.
const vanArches = (intrude: number, height: number, length: number, zCenter: number): WheelArch[] => [
  { side: 'left', intrude, height, length, zCenter },
  { side: 'right', intrude, height, length, zCenter },
];

export const VEHICLE_PRESET_GROUPS: VehiclePresetGroup[] = [
  {
    id: 'small_vans',
    label: 'Petits fourgons',
    presets: [
      { id: 'kangoo', name: 'Renault Kangoo / Citroën Berlingo', category: 'Petits fourgons', length: 1.8, width: 1.22, height: 1.2, payloadKg: 650, roofCurve: 0.08, wheelArches: vanArches(0.16, 0.28, 0.7, -0.3) },
      { id: 'caddy', name: 'VW Caddy Maxi', category: 'Petits fourgons', length: 2.25, width: 1.23, height: 1.24, payloadKg: 750, roofCurve: 0.08, wheelArches: vanArches(0.16, 0.28, 0.7, -0.4) },
    ],
  },
  {
    id: 'medium_vans',
    label: 'Fourgons moyens',
    presets: [
      { id: 'trafic_l1h1', name: 'Renault Trafic / Vivaro L1H1', category: 'Fourgons moyens', length: 2.5, width: 1.66, height: 1.39, payloadKg: 1100, roofCurve: 0.12, wheelArches: vanArches(0.2, 0.32, 0.9, -0.5) },
      { id: 'trafic_l2h1', name: 'Renault Trafic L2H1', category: 'Fourgons moyens', length: 2.94, width: 1.66, height: 1.39, payloadKg: 1150, roofCurve: 0.12, wheelArches: vanArches(0.2, 0.32, 0.9, -0.7) },
      { id: 'transit_custom', name: 'Ford Transit Custom L2', category: 'Fourgons moyens', length: 2.85, width: 1.77, height: 1.4, payloadKg: 1300, roofCurve: 0.12, wheelArches: vanArches(0.2, 0.32, 0.9, -0.7) },
      { id: 'vito_long', name: 'Mercedes Vito L3', category: 'Fourgons moyens', length: 2.83, width: 1.69, height: 1.39, payloadKg: 1000, roofCurve: 0.12, wheelArches: vanArches(0.19, 0.3, 0.85, -0.6) },
    ],
  },
  {
    id: 'large_vans',
    label: 'Grands fourgons',
    presets: [
      { id: 'master_l1h1', name: 'Renault Master / Movano L1H1', category: 'Grands fourgons', length: 2.58, width: 1.76, height: 1.7, payloadKg: 1400, roofCurve: 0.15, wheelArches: vanArches(0.22, 0.34, 1.0, -0.5) },
      { id: 'master_l2h2', name: 'Renault Master L2H2', category: 'Grands fourgons', length: 3.73, width: 1.76, height: 1.89, payloadKg: 1500, roofCurve: 0.15, wheelArches: vanArches(0.22, 0.34, 1.0, -0.9) },
      { id: 'master_l3h2', name: 'Renault Master L3H2', category: 'Grands fourgons', length: 4.38, width: 1.76, height: 1.89, payloadKg: 1550, roofCurve: 0.15, wheelArches: vanArches(0.22, 0.34, 1.0, -1.1) },
      { id: 'ducato_l3h2', name: 'Fiat Ducato / Boxer / Jumper L3H2', category: 'Grands fourgons', length: 4.07, width: 1.87, height: 1.93, payloadKg: 1500, roofCurve: 0.14, wheelArches: vanArches(0.2, 0.34, 1.0, -1.0) },
      { id: 'sprinter_l3h2', name: 'Mercedes Sprinter L3H2', category: 'Grands fourgons', length: 4.41, width: 1.78, height: 1.94, payloadKg: 1450, roofCurve: 0.16, wheelArches: vanArches(0.21, 0.34, 1.0, -1.1) },
      { id: 'crafter_l4h3', name: 'VW Crafter / MAN TGE L4H3', category: 'Grands fourgons', length: 4.86, width: 1.83, height: 2.18, payloadKg: 1500, roofCurve: 0.16, wheelArches: vanArches(0.21, 0.34, 1.0, -1.2) },
    ],
  },
  {
    id: 'box_trucks',
    label: 'Caisses / porteurs',
    presets: [
      { id: 'box_12', name: 'Caisse 12 m³ (3,5 T)', category: 'Caisses / porteurs', length: 3.3, width: 2.0, height: 2.0, payloadKg: 1000 },
      { id: 'box_20', name: 'Caisse 20 m³ (7,5 T)', category: 'Caisses / porteurs', length: 4.3, width: 2.1, height: 2.3, payloadKg: 2500 },
      { id: 'box_30', name: 'Caisse 30 m³ (12 T)', category: 'Caisses / porteurs', length: 6.1, width: 2.2, height: 2.35, payloadKg: 5500 },
      { id: 'porteur_19t', name: 'Porteur 19 T caisse', category: 'Caisses / porteurs', length: 7.2, width: 2.45, height: 2.5, payloadKg: 9000 },
    ],
  },
  {
    id: 'trailers',
    label: 'Semi-remorques',
    presets: [
      { id: 'tautliner', name: 'Semi tautliner standard', category: 'Semi-remorques', length: 13.6, width: 2.48, height: 2.7, payloadKg: 24000 },
      { id: 'mega', name: 'Semi méga (toit relevé)', category: 'Semi-remorques', length: 13.6, width: 2.48, height: 3.0, payloadKg: 24000 },
      { id: 'frigo', name: 'Semi frigorifique', category: 'Semi-remorques', length: 13.3, width: 2.45, height: 2.6, payloadKg: 22000 },
      { id: 'fourgon_semi', name: 'Semi fourgon (box)', category: 'Semi-remorques', length: 13.6, width: 2.46, height: 2.75, roofCurve: 0.1, payloadKg: 24000 },
    ],
  },
];

export const VEHICLE_PRESETS_BY_ID: Record<string, VehiclePreset> = VEHICLE_PRESET_GROUPS.reduce(
  (acc, group) => {
    group.presets.forEach((p) => { acc[p.id] = p; });
    return acc;
  },
  {} as Record<string, VehiclePreset>,
);

export const presetVolume = (p: VehiclePreset): number => p.length * p.width * p.height;
