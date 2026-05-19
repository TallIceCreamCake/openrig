import { supabase } from '../lib/supabase';

const UNIT_QR_PREFIX = 'equipment_unit:';
const EQUIPMENT_QR_PREFIX = 'equipment:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVISIBLE_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g;

export type ParsedQrPayload = {
  raw: string;
  normalized: string;
  kind: 'equipment_unit' | 'equipment' | 'unknown';
  id: string | null;
};

export type EquipmentUnitRecord = {
  id: string;
  equipment_id: string;
  serial_number: string | null;
  qr_code_value: string | null;
  qr_code_url: string | null;
};

export type SerialTrackingContext = {
  serialEquipmentIds: Set<string>;
  expectedUnitsByEquipmentId: Record<string, EquipmentUnitRecord[]>;
  expectedUnitsById: Record<string, EquipmentUnitRecord>;
};

type AnyObject = Record<string, unknown>;

const emptyContext = (): SerialTrackingContext => ({
  serialEquipmentIds: new Set<string>(),
  expectedUnitsByEquipmentId: {},
  expectedUnitsById: {},
});

const normalizeRowToUnit = (row: AnyObject | null | undefined): EquipmentUnitRecord | null => {
  if (!row) return null;
  const id = typeof row.id === 'string' ? row.id : '';
  const equipmentId = typeof row.equipment_id === 'string' ? row.equipment_id : '';
  if (!id || !equipmentId) return null;
  return {
    id,
    equipment_id: equipmentId,
    serial_number: typeof row.serial_number === 'string' ? row.serial_number : null,
    qr_code_value: typeof row.qr_code_value === 'string' ? row.qr_code_value : null,
    qr_code_url: typeof row.qr_code_url === 'string' ? row.qr_code_url : null,
  };
};

export const buildEquipmentUnitQrValue = (unitId: string) => `${UNIT_QR_PREFIX}${unitId}`;

export const buildEquipmentUnitQrUrl = (payload: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;

const sanitizeScannedCode = (value: string | null | undefined) =>
  (typeof value === 'string' ? value : '')
    .replace(INVISIBLE_CHARS_PATTERN, '')
    .trim();

const tryDecodeURIComponent = (value: string) => {
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractDataParamCandidate = (value: string) => {
  if (!value) return null;
  if (!value.includes('data=')) return null;
  try {
    const url = new URL(value);
    const data = url.searchParams.get('data');
    if (!data) return null;
    return sanitizeScannedCode(tryDecodeURIComponent(data));
  } catch {
    return null;
  }
};

const normalizeCodeCandidates = (rawValue: string | null | undefined) => {
  const sanitized = sanitizeScannedCode(rawValue);
  const decoded = sanitizeScannedCode(tryDecodeURIComponent(sanitized));
  const dataParam = extractDataParamCandidate(sanitized);
  const set = new Set<string>([sanitized, decoded, dataParam || '']);
  return Array.from(set).filter(Boolean);
};

const extractUnitIdFromCode = (code: string) => {
  const normalized = sanitizeScannedCode(code);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  if (lower.startsWith(UNIT_QR_PREFIX)) {
    const id = normalized.slice(UNIT_QR_PREFIX.length).trim();
    return id || null;
  }

  const fromPattern = normalized.match(/equipment_unit\s*[:：]\s*([0-9a-fA-F-]{32,40})/i);
  if (fromPattern?.[1]) return fromPattern[1].trim();

  if (ANY_UUID_PATTERN.test(normalized)) return normalized;
  return null;
};

export const parseEquipmentQrPayload = (rawValue: string | null | undefined): ParsedQrPayload => {
  const raw = typeof rawValue === 'string' ? rawValue : '';
  const candidates = normalizeCodeCandidates(rawValue);
  const normalized = candidates[0] || '';

  if (!normalized && candidates.length === 0) {
    return { raw, normalized, kind: 'unknown', id: null };
  }

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (lower.startsWith(UNIT_QR_PREFIX)) {
      const id = candidate.slice(UNIT_QR_PREFIX.length).trim();
      return {
        raw,
        normalized: candidate,
        kind: id.length > 0 ? 'equipment_unit' : 'unknown',
        id: id.length > 0 ? id : null,
      };
    }

    if (lower.startsWith(EQUIPMENT_QR_PREFIX)) {
      const id = candidate.slice(EQUIPMENT_QR_PREFIX.length).trim();
      return {
        raw,
        normalized: candidate,
        kind: id.length > 0 ? 'equipment' : 'unknown',
        id: id.length > 0 ? id : null,
      };
    }

    if (UUID_PATTERN.test(candidate) || ANY_UUID_PATTERN.test(candidate)) {
      return { raw, normalized: candidate, kind: 'equipment_unit', id: candidate };
    }
  }

  return { raw, normalized, kind: 'unknown', id: null };
};

export const fetchEquipmentUnitByCode = async (rawValue: string | null | undefined): Promise<EquipmentUnitRecord | null> => {
  const parsed = parseEquipmentQrPayload(rawValue);
  const codeCandidates = normalizeCodeCandidates(rawValue);
  if (parsed.normalized && !codeCandidates.includes(parsed.normalized)) {
    codeCandidates.unshift(parsed.normalized);
  }

  const unitIdCandidates = new Set<string>();
  if (parsed.kind === 'equipment_unit' && parsed.id) {
    unitIdCandidates.add(parsed.id);
  }
  codeCandidates.forEach((candidate) => {
    const id = extractUnitIdFromCode(candidate);
    if (id) unitIdCandidates.add(id);
  });

  const sb: any = supabase;

  const selectColumns = 'id, equipment_id, serial_number, qr_code_value, qr_code_url';

  for (const unitId of unitIdCandidates) {
    if (!ANY_UUID_PATTERN.test(unitId)) continue;
    const { data, error } = await sb
      .from('equipment_units')
      .select(selectColumns)
      .eq('id', unitId)
      .maybeSingle();
    if (error) {
      console.warn('fetchEquipmentUnitByCode by id failed', { unitId, error });
      continue;
    }
    if (data) return normalizeRowToUnit(data);
  }

  for (const candidate of codeCandidates) {
    const { data, error } = await sb
      .from('equipment_units')
      .select(selectColumns)
      .eq('qr_code_value', candidate)
      .maybeSingle();
    if (error) {
      console.warn('fetchEquipmentUnitByCode by qr exact failed', { candidate, error });
      continue;
    }
    if (data) return normalizeRowToUnit(data);
  }

  for (const candidate of codeCandidates) {
    const { data, error } = await sb
      .from('equipment_units')
      .select(selectColumns)
      .ilike('qr_code_value', candidate)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('fetchEquipmentUnitByCode by qr ilike failed', { candidate, error });
      continue;
    }
    if (data) return normalizeRowToUnit(data);
  }

  for (const candidate of codeCandidates) {
    const maybeSerial = candidate.includes(':') ? '' : candidate;
    if (!maybeSerial) continue;
    const { data, error } = await sb
      .from('equipment_units')
      .select(selectColumns)
      .eq('serial_number', maybeSerial)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('fetchEquipmentUnitByCode by serial_number failed', { maybeSerial, error });
      continue;
    }
    if (data) return normalizeRowToUnit(data);
  }

  return null;
};

export const loadSerialTrackingContextForPreparation = async (
  rentalId: string,
  equipmentIds: string[],
): Promise<SerialTrackingContext> => {
  if (!rentalId || equipmentIds.length === 0) {
    return emptyContext();
  }

  const sb: any = supabase;

  const { data: equipmentRows, error: equipmentError } = await sb
    .from('equipment')
    .select('id, inventory_category')
    .in('id', equipmentIds);

  if (equipmentError) {
    console.error('loadSerialTrackingContextForPreparation/equipment', equipmentError);
    return emptyContext();
  }

  const serialEquipmentIds = new Set<string>();
  (equipmentRows || []).forEach((row: AnyObject) => {
    if (row?.inventory_category === 'series' && typeof row.id === 'string') {
      serialEquipmentIds.add(row.id);
    }
  });

  if (serialEquipmentIds.size === 0) {
    return emptyContext();
  }

  const { data: reservationRows, error: reservationError } = await sb
    .from('rental_unit_reservations')
    .select('equipment_unit_id, equipment_unit:equipment_unit_id(id, equipment_id, serial_number, qr_code_value, qr_code_url)')
    .eq('rental_id', rentalId);

  if (reservationError) {
    console.error('loadSerialTrackingContextForPreparation/reservations', reservationError);
    return {
      serialEquipmentIds,
      expectedUnitsByEquipmentId: {},
      expectedUnitsById: {},
    };
  }

  const expectedUnitsByEquipmentId: Record<string, EquipmentUnitRecord[]> = {};
  const expectedUnitsById: Record<string, EquipmentUnitRecord> = {};

  (reservationRows || []).forEach((row: AnyObject) => {
    const unit = normalizeRowToUnit((row?.equipment_unit as AnyObject) || null);
    if (!unit) return;
    if (!serialEquipmentIds.has(unit.equipment_id)) return;
    if (expectedUnitsById[unit.id]) return;

    if (!expectedUnitsByEquipmentId[unit.equipment_id]) {
      expectedUnitsByEquipmentId[unit.equipment_id] = [];
    }
    expectedUnitsByEquipmentId[unit.equipment_id].push(unit);
    expectedUnitsById[unit.id] = unit;
  });

  return {
    serialEquipmentIds,
    expectedUnitsByEquipmentId,
    expectedUnitsById,
  };
};

export const loadSerialTrackingContextForReturn = async (
  rentalId: string,
  equipmentIds: string[],
): Promise<SerialTrackingContext> => {
  const base = await loadSerialTrackingContextForPreparation(rentalId, equipmentIds);
  if (base.serialEquipmentIds.size === 0) {
    return base;
  }

  const sb: any = supabase;
  const { data: preparedRows, error: preparedError } = await sb
    .from('rental_preparation_unit_scans')
    .select('equipment_unit_id, equipment_unit:equipment_unit_id(id, equipment_id, serial_number, qr_code_value, qr_code_url)')
    .eq('rental_id', rentalId)
    .eq('counted', true)
    .order('scanned_at', { ascending: true });

  if (preparedError) {
    console.error('loadSerialTrackingContextForReturn/preparedRows', preparedError);
    return base;
  }

  if (!Array.isArray(preparedRows) || preparedRows.length === 0) {
    return base;
  }

  const expectedUnitsByEquipmentId: Record<string, EquipmentUnitRecord[]> = {};
  const expectedUnitsById: Record<string, EquipmentUnitRecord> = {};

  preparedRows.forEach((row: AnyObject) => {
    const unit = normalizeRowToUnit((row?.equipment_unit as AnyObject) || null);
    if (!unit) return;
    if (!base.serialEquipmentIds.has(unit.equipment_id)) return;
    if (expectedUnitsById[unit.id]) return;

    if (!expectedUnitsByEquipmentId[unit.equipment_id]) {
      expectedUnitsByEquipmentId[unit.equipment_id] = [];
    }
    expectedUnitsByEquipmentId[unit.equipment_id].push(unit);
    expectedUnitsById[unit.id] = unit;
  });

  if (Object.keys(expectedUnitsById).length === 0) {
    return base;
  }

  return {
    serialEquipmentIds: base.serialEquipmentIds,
    expectedUnitsByEquipmentId,
    expectedUnitsById,
  };
};

export const loadCountedPreparationUnitIds = async (preparationId: string | null): Promise<Set<string>> => {
  if (!preparationId) return new Set<string>();
  const sb: any = supabase;
  const { data, error } = await sb
    .from('rental_preparation_unit_scans')
    .select('equipment_unit_id')
    .eq('preparation_id', preparationId)
    .eq('counted', true);

  if (error) {
    console.error('loadCountedPreparationUnitIds', error);
    return new Set<string>();
  }

  const ids = new Set<string>();
  (data || []).forEach((row: AnyObject) => {
    if (typeof row.equipment_unit_id === 'string' && row.equipment_unit_id.length > 0) {
      ids.add(row.equipment_unit_id);
    }
  });
  return ids;
};

export const loadCountedReturnUnitIds = async (returnId: string | null): Promise<Set<string>> => {
  if (!returnId) return new Set<string>();
  const sb: any = supabase;
  const { data, error } = await sb
    .from('rental_return_unit_scans')
    .select('equipment_unit_id')
    .eq('return_id', returnId)
    .eq('counted', true);

  if (error) {
    console.error('loadCountedReturnUnitIds', error);
    return new Set<string>();
  }

  const ids = new Set<string>();
  (data || []).forEach((row: AnyObject) => {
    if (typeof row.equipment_unit_id === 'string' && row.equipment_unit_id.length > 0) {
      ids.add(row.equipment_unit_id);
    }
  });
  return ids;
};

export const insertPreparationUnitScanLog = async (payload: AnyObject) => {
  const sb: any = supabase;
  const { error } = await sb.from('rental_preparation_unit_scans').insert([payload]);
  if (error) {
    console.error('insertPreparationUnitScanLog', error);
  }
};

export const insertReturnUnitScanLog = async (payload: AnyObject) => {
  const sb: any = supabase;
  const { error } = await sb.from('rental_return_unit_scans').insert([payload]);
  if (error) {
    console.error('insertReturnUnitScanLog', error);
  }
};

export const insertEquipmentUnitActivityLog = async (payload: AnyObject) => {
  const sb: any = supabase;
  const { error } = await sb.from('equipment_unit_activity_logs').insert([payload]);
  if (error) {
    console.error('insertEquipmentUnitActivityLog', error);
  }
};
