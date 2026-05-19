import { supabase } from '../lib/supabase';
import {
  fetchEquipmentUnitByCode,
  insertEquipmentUnitActivityLog,
  parseEquipmentQrPayload,
} from './equipmentUnitTracking';

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const INVISIBLE_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g;

export type RentalSummary = {
  id: string;
  reference_code: string | null;
  title: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  client_name: string | null;
};

export type UnitHistoryEvent = {
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

export type ScannedUnitResult = {
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

export type ScannedEquipmentResult = {
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

export type RentalItemDetail = {
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

export type ScannedRentalResult = {
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

export type ScannedUnknownResult = {
  kind: 'unknown';
  code: string;
};

export type DepotScanResult =
  | ScannedUnitResult
  | ScannedEquipmentResult
  | ScannedRentalResult
  | ScannedUnknownResult;

const sanitizeScannedCode = (value: string | null | undefined) =>
  (typeof value === 'string' ? value : '')
    .replace(INVISIBLE_CHARS_PATTERN, '')
    .trim();

const tryDecodeUriComponentSafe = (value: string) => {
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractDataParamCandidate = (value: string) => {
  if (!value || !value.includes('data=')) return null;
  try {
    const parsed = new URL(value);
    const data = parsed.searchParams.get('data');
    if (!data) return null;
    return sanitizeScannedCode(tryDecodeUriComponentSafe(data));
  } catch {
    return null;
  }
};

const normalizeScanCandidates = (raw: string) => {
  const sanitized = sanitizeScannedCode(raw);
  const decoded = sanitizeScannedCode(tryDecodeUriComponentSafe(sanitized));
  const dataParam = extractDataParamCandidate(sanitized);
  return Array.from(new Set([sanitized, decoded, dataParam || ''])).filter(Boolean);
};

const fetchUnitResolutionFromServer = async (code: string): Promise<ScannedUnitResult | null> => {
  if (typeof window === 'undefined') return null;
  const normalized = code.trim();
  if (!normalized) return null;
  try {
    const response = await fetch(`/api/depot/resolve-unit?code=${encodeURIComponent(normalized)}`);
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.found || !payload?.unit?.id || !payload?.unit?.equipment_id) {
      return null;
    }

    return {
      kind: 'equipment_unit',
      code: normalized,
      unit: {
        id: payload.unit.id as string,
        serial_number: (payload.unit.serial_number as string | null) ?? null,
        qr_code_value: (payload.unit.qr_code_value as string | null) ?? null,
        qr_code_url: (payload.unit.qr_code_url as string | null) ?? null,
        status: (payload.unit.status as string | null) ?? null,
        warehouse_name: (payload.unit.warehouse_name as string | null) ?? null,
      },
      equipment: payload.equipment
        ? {
            id: payload.equipment.id as string,
            name: (payload.equipment.name as string | null) ?? null,
            type: (payload.equipment.type as string | null) ?? null,
            subtype: (payload.equipment.subtype as string | null) ?? null,
            description: (payload.equipment.description as string | null) ?? null,
            image_url: (payload.equipment.image_url as string | null) ?? null,
            status: (payload.equipment.status as string | null) ?? null,
          }
        : null,
      history: Array.isArray(payload.history)
        ? payload.history
          .filter((event: any) => event?.source_id && event?.event_at)
          .map((event: any) => ({
            source_id: event.source_id as string,
            event_type: (event.event_type as string) || 'event',
            event_at: event.event_at as string,
            scan_result: (event.scan_result as string | null) ?? null,
            forced: event.forced === true,
            rental_id: (event.rental_id as string | null) ?? null,
            reference_code: (event.reference_code as string | null) ?? null,
            rental_title: (event.rental_title as string | null) ?? null,
            client_name: (event.client_name as string | null) ?? null,
          }))
        : [],
      latestRentals: Array.isArray(payload.latestRentals)
        ? payload.latestRentals
          .filter((rental: any) => rental?.id)
          .map((rental: any) => ({
            id: rental.id as string,
            reference_code: (rental.reference_code as string | null) ?? null,
            title: (rental.title as string | null) ?? null,
            status: (rental.status as string | null) ?? null,
            start_date: (rental.start_date as string | null) ?? null,
            end_date: (rental.end_date as string | null) ?? null,
            location: (rental.location as string | null) ?? null,
            client_name: (rental.client_name as string | null) ?? null,
          }))
        : [],
    };
  } catch (error) {
    console.warn('fetchUnitResolutionFromServer failed', error);
    return null;
  }
};

const fetchRentalResolutionFromServer = async (code: string): Promise<ScannedRentalResult | null> => {
  if (typeof window === 'undefined') return null;
  const normalized = sanitizeScannedCode(code);
  if (!normalized) return null;
  try {
    const response = await fetch(`/api/depot/resolve-rental?code=${encodeURIComponent(normalized)}`);
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.found || !payload?.rental?.id) return null;

    const rental = payload.rental || {};
    const items = Array.isArray(payload.items)
      ? payload.items.map((row: any) => ({
          key: (row.key as string) || Math.random().toString(36).slice(2, 8),
          label: (row.label as string) || 'Matériel',
          typeLabel: (row.typeLabel as string) || 'Type —',
          quantity: Number(row.quantity || 0),
          serials: Array.isArray(row.serials)
            ? row.serials.map((serial: any) => ({
                id: (serial.id as string) || '',
                serial_number: (serial.serial_number as string | null) ?? null,
                status: (serial.status as string | null) ?? null,
              }))
            : [],
        } as RentalItemDetail))
      : [];

    return {
      kind: 'rental',
      code: normalized,
      rental: {
        id: rental.id as string,
        reference_code: (rental.reference_code as string | null) ?? null,
        title: (rental.title as string | null) ?? null,
        status: (rental.status as string | null) ?? null,
        start_date: (rental.start_date as string | null) ?? null,
        end_date: (rental.end_date as string | null) ?? null,
        location: (rental.location as string | null) ?? null,
        delivery_address: (rental.delivery_address as string | null) ?? null,
        pickup_address: (rental.pickup_address as string | null) ?? null,
        description: (rental.description as string | null) ?? null,
        notes: (rental.notes as string | null) ?? null,
        total_price: typeof rental.total_price === 'number' ? rental.total_price : null,
        client_name: (rental.client_name as string | null) ?? null,
        client_email: (rental.client_email as string | null) ?? null,
        client_phone: (rental.client_phone as string | null) ?? null,
      },
      items,
    };
  } catch (error) {
    console.warn('fetchRentalResolutionFromServer failed', error);
    return null;
  }
};

const parseRentalIdCandidate = (raw: string) => {
  const candidates = normalizeScanCandidates(raw);
  for (const candidate of candidates) {
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    if (lower.startsWith('rental:')) {
      const fromPrefix = candidate.slice(candidate.indexOf(':') + 1).trim();
      if (fromPrefix) return fromPrefix;
    }
    const fromPath = candidate.match(/\/rentals\/([0-9a-fA-F-]{36})/);
    if (fromPath?.[1]) return fromPath[1];
    const uuidMatch = candidate.match(UUID_PATTERN);
    if (uuidMatch?.[0]) return uuidMatch[0];
  }
  return null;
};

const fetchRentalClientInfo = async (clientId: string | null) => {
  if (!clientId) {
    return { name: null, email: null, phone: null };
  }

  const withFull = await supabase
    .from('clients')
    .select('name, email, phone')
    .eq('id', clientId)
    .maybeSingle();

  if (!withFull.error && withFull.data) {
    return {
      name: (withFull.data.name as string | null) ?? null,
      email: (withFull.data.email as string | null) ?? null,
      phone: (withFull.data.phone as string | null) ?? null,
    };
  }

  if (withFull.error) {
    console.warn('fetchRentalClientInfo full fields failed, fallback to name only', withFull.error);
  }

  const nameOnly = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .maybeSingle();

  if (nameOnly.error) {
    console.warn('fetchRentalClientInfo name fallback failed', nameOnly.error);
    return { name: null, email: null, phone: null };
  }

  return {
    name: (nameOnly.data?.name as string | null) ?? null,
    email: null,
    phone: null,
  };
};

const fetchRentalsByIds = async (rentalIds: string[]) => {
  if (!rentalIds.length) return [] as RentalSummary[];
  const { data, error } = await supabase
    .from('rentals')
    .select('id, reference_code, title, status, start_date, end_date, location, clients(name)')
    .in('id', rentalIds);

  let rows = (data || []) as any[];
  if (error) {
    console.warn('fetchRentalsByIds with clients relation failed, retrying without clients join', error);
    const fallback = await supabase
      .from('rentals')
      .select('id, reference_code, title, status, start_date, end_date, location')
      .in('id', rentalIds);
    if (fallback.error) {
      console.error('fetchRentalsByIds fallback failed', fallback.error);
      return [] as RentalSummary[];
    }
    rows = (fallback.data || []) as any[];
  }

  const orderMap = new Map(rentalIds.map((id, idx) => [id, idx]));
  return rows
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
};

export const resolveDepotScannedCode = async (rawCode: string): Promise<DepotScanResult> => {
  const normalizedCandidates = normalizeScanCandidates(rawCode);
  const normalized = normalizedCandidates[0] || sanitizeScannedCode(rawCode);
  if (!normalized) {
    return { kind: 'unknown', code: normalized };
  }

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

      return {
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
    }

    const serverResolvedUnit = await fetchUnitResolutionFromServer(normalized);
    if (serverResolvedUnit) {
      void insertEquipmentUnitActivityLog({
        equipment_unit_id: serverResolvedUnit.unit.id,
        equipment_id: serverResolvedUnit.equipment?.id || null,
        event_type: 'depot_scan_lookup',
        severity: 'info',
        source: 'depot_scan',
        message: 'Scan dépôt: unité résolue (fallback serveur)',
        payload: {
          scanned_code: normalized,
          result_kind: 'equipment_unit',
          strategy: 'server_fallback',
        },
      });
      return serverResolvedUnit;
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
    if (equipmentError) {
      console.warn('resolveDepotScannedCode equipment lookup failed', equipmentError);
    }

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

      return {
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
    }
  }

  const rentalIdCandidate = parseRentalIdCandidate(normalized);
  const referenceCandidates = Array.from(
    new Set([
      ...normalizedCandidates,
      normalized,
      normalized.toLowerCase().startsWith('rental:')
        ? sanitizeScannedCode(normalized.slice(normalized.indexOf(':') + 1))
        : '',
    ]),
  ).filter(Boolean);
  let rentalRow: any | null = null;
  let rentalClientInfo: { name: string | null; email: string | null; phone: string | null } = {
    name: null,
    email: null,
    phone: null,
  };

  if (rentalIdCandidate) {
    const { data, error } = await supabase
      .from('rentals')
      .select('id, client_id, reference_code, title, status, start_date, end_date, location, delivery_address, pickup_address, description, notes, total_price')
      .eq('id', rentalIdCandidate)
      .maybeSingle();
    if (error) {
      console.warn('resolveDepotScannedCode rental lookup by id failed', error);
    }
    rentalRow = data || null;
    if (rentalRow) {
      rentalClientInfo = await fetchRentalClientInfo((rentalRow.client_id as string | null) ?? null);
    }
  }

  if (!rentalRow) {
    for (const candidate of referenceCandidates) {
      const { data, error } = await supabase
        .from('rentals')
        .select('id, client_id, reference_code, title, status, start_date, end_date, location, delivery_address, pickup_address, description, notes, total_price')
        .ilike('reference_code', candidate)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('resolveDepotScannedCode rental lookup by reference failed', { candidate, error });
        continue;
      }
      rentalRow = data || null;
      if (rentalRow) {
        rentalClientInfo = await fetchRentalClientInfo((rentalRow.client_id as string | null) ?? null);
        break;
      }
    }
  }

  if (rentalRow?.id) {
    const [itemsRes, reservationsRes] = await Promise.all([
      supabase
        .from('rental_items')
        .select('id, equipment_id, quantity, is_external, external_name, external_type, external_subtype, equipment:equipment_id(id, name, type)')
        .eq('rental_id', rentalRow.id),
      sb
        .from('rental_unit_reservations')
        .select('equipment_id, equipment_unit_id, equipment_unit:equipment_unit_id(id, serial_number, status)')
        .eq('rental_id', rentalRow.id),
    ]);

    if (itemsRes.error) {
      console.warn('resolveDepotScannedCode rental items lookup failed', itemsRes.error);
    }
    if (reservationsRes.error) {
      console.warn('resolveDepotScannedCode rental unit reservations lookup failed', reservationsRes.error);
    }

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

    return {
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
        client_name: rentalClientInfo.name,
        client_email: rentalClientInfo.email,
        client_phone: rentalClientInfo.phone,
      },
      items,
    };
  }

  const serverResolvedRental = await fetchRentalResolutionFromServer(normalized);
  if (serverResolvedRental) {
    void insertEquipmentUnitActivityLog({
      rental_id: serverResolvedRental.rental.id,
      event_type: 'depot_scan_lookup',
      severity: 'info',
      source: 'depot_scan',
      message: 'Scan dépôt: prestation résolue (fallback serveur)',
      payload: {
        scanned_code: normalized,
        result_kind: 'rental',
        strategy: 'server_fallback',
      },
    });
    return serverResolvedRental;
  }

  void insertEquipmentUnitActivityLog({
    event_type: 'depot_scan_unknown',
    severity: 'warning',
    source: 'depot_scan',
    message: 'Scan dépôt: code inconnu',
    payload: {
      scanned_code: normalized,
    },
  });

  return {
    kind: 'unknown',
    code: normalized,
  };
};
