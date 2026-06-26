import React from 'react';
import { Document, Page, View, Text, StyleSheet, Svg, Rect, pdf } from '@react-pdf/renderer';
import type { VehiclePreset } from '../../constants/truckPresets';
import { vehicleMetrics } from '../../utils/truckPacking';

export interface PdfItem {
  name: string;
  length: number; width: number; height: number;
  x: number; y: number; z: number; rotation: number;
  weightKg: number;
  color?: string;
}
export interface PdfVehicle { name: string; preset: VehiclePreset; items: PdfItem[] }
export interface PdfData { title: string; vehicles: PdfVehicle[] }

const footprintHalf = (w: number, l: number, rot: number) => {
  const c = Math.abs(Math.cos(rot)); const s = Math.abs(Math.sin(rot));
  return { hx: (c * w + s * l) / 2, hz: (s * w + c * l) / 2 };
};
const PALETTE = ['#2563eb', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#0ea5e9', '#84cc16'];
const colorOf = (it: PdfItem) => {
  if (it.color) return it.color;
  let h = 0; for (let i = 0; i < it.name.length; i += 1) h = (h * 31 + it.name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: '#111827', fontFamily: 'Helvetica' },
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  h2: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  muted: { color: '#6b7280' },
  row: { flexDirection: 'row' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4, padding: 8, marginBottom: 10 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#6b7280' },
  cell: { flex: 1, paddingVertical: 3, paddingRight: 6 },
  viewTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3, color: '#374151' },
  legendItem: { flexDirection: 'row', alignItems: 'center', width: '50%', marginBottom: 2 },
  swatch: { width: 8, height: 8, borderRadius: 2, marginRight: 4 },
});

const TruckView: React.FC<{
  preset: VehiclePreset; items: PdfItem[]; mode: 'top' | 'side'; maxW: number; maxH: number;
}> = ({ preset, items, mode, maxW, maxH }) => {
  const W = preset.width; const L = preset.length; const H = preset.height;
  const aw = mode === 'top' ? W : L;        // horizontal world extent
  const ah = mode === 'top' ? L : H;        // vertical world extent
  const scale = Math.min(maxW / aw, maxH / ah);
  const sw = aw * scale; const sh = ah * scale;

  return (
    <Svg width={sw} height={sh}>
      <Rect x={0} y={0} width={sw} height={sh} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} />
      {mode === 'top' && (preset.wheelArches || []).map((arch, i) => {
        const ax = arch.side === 'left' ? 0 : (W - arch.intrude);
        const az = (arch.zCenter - arch.length / 2) + L / 2;
        return <Rect key={i} x={ax * scale} y={az * scale} width={arch.intrude * scale} height={arch.length * scale} fill="#cbd5e1" />;
      })}
      {items.map((it, i) => {
        const { hx, hz } = footprintHalf(it.width, it.length, it.rotation);
        let rx: number; let ry: number; let rw: number; let rh: number;
        if (mode === 'top') {
          rx = (it.x - hx + W / 2) * scale;
          ry = (it.z - hz + L / 2) * scale;
          rw = 2 * hx * scale; rh = 2 * hz * scale;
        } else {
          rx = (it.z - hz + L / 2) * scale;
          ry = (H - (it.y + it.height)) * scale;
          rw = 2 * hz * scale; rh = it.height * scale;
        }
        return <Rect key={i} x={rx} y={ry} width={rw} height={rh} fill={colorOf(it)} fillOpacity={0.82} stroke="#1f2937" strokeWidth={0.4} />;
      })}
    </Svg>
  );
};

const fmt = (v: number, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });

const LoadPlanDocument: React.FC<{ data: PdfData }> = ({ data }) => (
  <Document>
    {/* Cover / summary */}
    <Page size="A4" style={s.page}>
      <Text style={s.h1}>Plan de chargement</Text>
      <Text style={[s.muted, { marginBottom: 12 }]}>{data.title} — {new Date().toLocaleDateString('fr-FR')}</Text>
      <View style={[s.row, { borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 3 }]}>
        <Text style={[s.th, s.cell, { flex: 2 }]}>Véhicule</Text>
        <Text style={[s.th, s.cell]}>Dim. (m)</Text>
        <Text style={[s.th, s.cell]}>Éléments</Text>
        <Text style={[s.th, s.cell]}>Volume</Text>
        <Text style={[s.th, s.cell]}>Poids</Text>
      </View>
      {data.vehicles.map((v, i) => {
        const m = vehicleMetrics(v.preset, v.items);
        return (
          <View key={i} style={[s.row, { borderBottomWidth: 1, borderColor: '#f3f4f6' }]}>
            <Text style={[s.cell, { flex: 2 }]}>{v.name}</Text>
            <Text style={s.cell}>{v.preset.length} × {v.preset.width} × {v.preset.height}</Text>
            <Text style={s.cell}>{m.count}</Text>
            <Text style={s.cell}>{m.volumePct.toFixed(0)} %</Text>
            <Text style={s.cell}>{fmt(m.weight)} kg{v.preset.payloadKg ? ` / ${fmt(v.preset.payloadKg)}` : ''}</Text>
          </View>
        );
      })}
    </Page>

    {/* One page per vehicle */}
    {data.vehicles.map((v, vi) => {
      const m = vehicleMetrics(v.preset, v.items);
      const names = Array.from(new Set(v.items.map((it) => it.name)));
      return (
        <Page key={vi} size="A4" style={s.page}>
          <Text style={s.h2}>{v.name}</Text>
          <Text style={[s.muted, { marginBottom: 10 }]}>
            {v.preset.length} × {v.preset.width} × {v.preset.height} m · {m.count} élément(s) · volume {m.volumePct.toFixed(0)} % · poids {fmt(m.weight)} kg
          </Text>

          <View style={s.card}>
            <Text style={s.viewTitle}>Vue de dessus</Text>
            <TruckView preset={v.preset} items={v.items} mode="top" maxW={520} maxH={250} />
          </View>
          <View style={s.card}>
            <Text style={s.viewTitle}>Vue de côté (profil)</Text>
            <TruckView preset={v.preset} items={v.items} mode="side" maxW={520} maxH={150} />
          </View>

          <Text style={s.viewTitle}>Légende</Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {names.map((n) => {
              const it = v.items.find((x) => x.name === n)!;
              const count = v.items.filter((x) => x.name === n).length;
              return (
                <View key={n} style={s.legendItem}>
                  <View style={[s.swatch, { backgroundColor: colorOf(it) }]} />
                  <Text>{n} × {count}</Text>
                </View>
              );
            })}
          </View>
        </Page>
      );
    })}
  </Document>
);

export const generateLoadPlanPdf = async (data: PdfData): Promise<void> => {
  const blob = await pdf(<LoadPlanDocument data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chargement-${data.title}`.replace(/[^a-z0-9-]+/gi, '_').toLowerCase() + '.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
