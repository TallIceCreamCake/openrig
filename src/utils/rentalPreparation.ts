import { supabase } from '../lib/supabase';

type PreparationRow = {
  id: string;
  rental_id: string;
  status: string;
  created_at?: string | null;
  completed_at?: string | null;
};

type RawPreparationItem = {
  id?: string;
  preparation_id?: string;
  equipment_id?: string | null;
  equipment_name?: string | null;
  equipment_type?: string | null;
  quantity?: number | null;
  prepared_quantity?: number | null;
  completed?: boolean | null;
  is_external?: boolean | null;
  external_supplier?: string | null;
  created_at?: string | null;
};

export type PreparationItem = {
  id: string;
  equipment_id: string | null;
  equipment_name: string;
  equipment_type: string;
  quantity: number;
  prepared_quantity: number;
  completed: boolean;
  is_external?: boolean | null;
  external_supplier?: string | null;
  created_at?: string | null;
};

type AggregatedPreparationItem = PreparationItem & {
  duplicateIds: string[];
  orderIndex: number;
};

const toText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback).trim();

const toInteger = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
};

const buildPreparationItemKey = (row: RawPreparationItem) => {
  const equipmentId = toText(row.equipment_id ?? null, '');
  if (equipmentId) {
    return `equipment:${equipmentId}`;
  }

  const name = toText(row.equipment_name ?? null, '').toLowerCase();
  const type = toText(row.equipment_type ?? null, '').toLowerCase();
  const supplier = toText(row.external_supplier ?? null, '').toLowerCase();
  const scope = row.is_external ? 'external' : 'internal';
  return `${scope}:${name}:${type}:${supplier}`;
};

const aggregatePreparationItems = (rows: RawPreparationItem[]): AggregatedPreparationItem[] => {
  const groups = new Map<string, AggregatedPreparationItem>();

  rows.forEach((row, index) => {
    const key = buildPreparationItemKey(row);
    const normalizedQuantity = toInteger(row.quantity);
    const normalizedPrepared = toInteger(row.prepared_quantity);
    const rowId = toText(row.id ?? '', '');

    const existing = groups.get(key);
    if (existing) {
      existing.quantity += normalizedQuantity;
      existing.prepared_quantity += normalizedPrepared;
      if (!existing.equipment_name && row.equipment_name) {
        existing.equipment_name = toText(row.equipment_name, existing.equipment_name);
      }
      if (!existing.equipment_type && row.equipment_type) {
        existing.equipment_type = toText(row.equipment_type, existing.equipment_type);
      }
      if (!existing.external_supplier && row.external_supplier) {
        existing.external_supplier = toText(row.external_supplier, existing.external_supplier);
      }
      if (rowId) {
        existing.duplicateIds.push(rowId);
      }
      return;
    }

    groups.set(key, {
      id: rowId,
      equipment_id: toText(row.equipment_id ?? null, '') || null,
      equipment_name: toText(row.equipment_name ?? null, 'Équipement'),
      equipment_type: toText(row.equipment_type ?? null, '-'),
      quantity: normalizedQuantity,
      prepared_quantity: normalizedPrepared,
      completed: false,
      is_external: !!row.is_external,
      external_supplier: toText(row.external_supplier ?? null, '') || null,
      created_at: row.created_at || null,
      duplicateIds: [],
      orderIndex: index,
    });
  });

  return Array.from(groups.values())
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((item) => {
      const quantity = Math.max(0, item.quantity);
      const preparedQuantity = Math.max(0, Math.min(quantity, item.prepared_quantity));
      return {
        ...item,
        quantity,
        prepared_quantity: preparedQuantity,
        completed: preparedQuantity >= quantity,
      };
    });
};

const fetchExpectedRentalItems = async (rentalId: string, externalLabel: string): Promise<RawPreparationItem[]> => {
  const { data, error } = await supabase
    .from('rental_items')
    .select('equipment_id, quantity, is_external, external_name, external_type, external_subtype, external_supplier, equipment:equipment(name, type), created_at, position')
    .eq('rental_id', rentalId)
    .order('created_at', { ascending: true })
    .order('position', { ascending: true });

  if (error) throw error;

  return ((data as any[]) || []).map((row) => {
    const isExternal = !!row.is_external;
    const externalBaseType = [row.external_type, row.external_subtype].filter(Boolean).join(' / ');
    return {
      equipment_id: row.equipment_id || null,
      equipment_name: isExternal ? row.external_name || externalLabel : row.equipment?.name || 'Équipement',
      equipment_type: isExternal ? (externalBaseType || externalLabel) : row.equipment?.type || '-',
      quantity: row.quantity || 0,
      prepared_quantity: 0,
      completed: false,
      is_external: isExternal,
      external_supplier: isExternal ? row.external_supplier || null : null,
      created_at: row.created_at || null,
    } satisfies RawPreparationItem;
  });
};

const fetchPreparationItems = async (preparationId: string): Promise<RawPreparationItem[]> => {
  const { data, error } = await supabase
    .from('rental_preparation_items')
    .select('id, preparation_id, equipment_id, equipment_name, equipment_type, quantity, prepared_quantity, completed, is_external, external_supplier, created_at')
    .eq('preparation_id', preparationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as RawPreparationItem[]) || [];
};

const seedPreparationItems = async (rentalId: string, preparationId: string, externalLabel: string) => {
  const aggregatedSeed = aggregatePreparationItems(await fetchExpectedRentalItems(rentalId, externalLabel));

  if (aggregatedSeed.length === 0) return;

  const payload = aggregatedSeed.map((item) => ({
    preparation_id: preparationId,
    equipment_id: item.equipment_id,
    equipment_name: item.equipment_name,
    equipment_type: item.equipment_type,
    quantity: item.quantity,
    prepared_quantity: item.prepared_quantity,
    completed: item.completed,
    is_external: item.is_external ?? false,
    external_supplier: item.external_supplier,
  }));

  const { error: insertError } = await supabase.from('rental_preparation_items').insert(payload);
  if (insertError) throw insertError;
};

const reconcilePreparationItems = async (
  expectedRows: RawPreparationItem[],
  existingRows: RawPreparationItem[],
  preparationId: string,
): Promise<PreparationItem[]> => {
  const expected = aggregatePreparationItems(expectedRows);
  const existing = aggregatePreparationItems(existingRows);
  const existingByKey = new Map(existing.map((item) => [buildPreparationItemKey(item), item]));
  const expectedKeys = new Set(expected.map((item) => buildPreparationItemKey(item)));

  const merged = expected.map((item) => {
    const existingItem = existingByKey.get(buildPreparationItemKey(item));
    const preparedQuantity = existingItem ? Math.min(item.quantity, toInteger(existingItem.prepared_quantity)) : 0;
    return {
      ...item,
      id: existingItem?.id || '',
      prepared_quantity: preparedQuantity,
      completed: preparedQuantity >= item.quantity,
      duplicateIds: existingItem?.duplicateIds || [],
    };
  });

  const orphanDuplicateIds = existing
    .filter((item) => !expectedKeys.has(buildPreparationItemKey(item)))
    .flatMap((item) => [item.id, ...item.duplicateIds])
    .filter((value): value is string => Boolean(value));

  const duplicateIds = [...merged.flatMap((item) => item.duplicateIds), ...orphanDuplicateIds];

  await Promise.all(
    merged
      .filter((item) => item.id)
      .map((item) =>
        supabase
          .from('rental_preparation_items')
          .update({
            equipment_id: item.equipment_id,
            equipment_name: item.equipment_name,
            equipment_type: item.equipment_type,
            quantity: item.quantity,
            prepared_quantity: item.prepared_quantity,
            completed: item.completed,
            is_external: item.is_external ?? false,
            external_supplier: item.external_supplier,
          })
          .eq('id', item.id),
      ),
  );

  const missingRows = merged.filter((item) => !item.id);
  if (missingRows.length > 0) {
    const { data: insertedRows, error: insertError } = await supabase
      .from('rental_preparation_items')
      .insert(
        missingRows.map((item) => ({
          preparation_id: preparationId,
          equipment_id: item.equipment_id,
          equipment_name: item.equipment_name,
          equipment_type: item.equipment_type,
          quantity: item.quantity,
          prepared_quantity: item.prepared_quantity,
          completed: item.completed,
          is_external: item.is_external ?? false,
          external_supplier: item.external_supplier,
        })),
      )
      .select('id, equipment_id, equipment_name, equipment_type, quantity, prepared_quantity, completed, is_external, external_supplier, created_at');

    if (insertError) throw insertError;

    const insertedByKey = new Map(
      ((insertedRows as RawPreparationItem[]) || []).map((row) => [buildPreparationItemKey(row), row]),
    );

    merged.forEach((item) => {
      if (item.id) return;
      const inserted = insertedByKey.get(buildPreparationItemKey(item));
      if (!inserted?.id) return;
      item.id = inserted.id;
      item.created_at = inserted.created_at || item.created_at;
    });
  }

  if (duplicateIds.length > 0) {
    await Promise.all(
      merged
        .filter((item) => item.id && item.duplicateIds.length > 0)
        .map((item) =>
          supabase
            .from('rental_preparation_unit_scans')
            .update({ preparation_item_id: item.id })
            .in('preparation_item_id', item.duplicateIds),
        ),
    );

    const { error: deleteError } = await supabase
      .from('rental_preparation_items')
      .delete()
      .in('id', duplicateIds);

    if (deleteError) throw deleteError;
  }

  return merged.map(({ duplicateIds: _duplicateIds, orderIndex: _orderIndex, ...item }) => item);
};

const consolidatePreparations = async (rentalId: string): Promise<PreparationRow | null> => {
  const { data, error } = await supabase
    .from('rental_preparation')
    .select('id, rental_id, status, created_at, completed_at')
    .eq('rental_id', rentalId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = (data as PreparationRow[]) || [];
  if (rows.length === 0) return null;

  const canonical = rows[0];
  const duplicateIds = rows.slice(1).map((row) => row.id);

  if (duplicateIds.length > 0) {
    await Promise.all([
      supabase.from('rental_preparation_items').update({ preparation_id: canonical.id }).in('preparation_id', duplicateIds),
      supabase.from('rental_preparation_unit_scans').update({ preparation_id: canonical.id }).in('preparation_id', duplicateIds),
    ]);

    const { error: deleteError } = await supabase.from('rental_preparation').delete().in('id', duplicateIds);
    if (deleteError) throw deleteError;
  }

  return canonical;
};

export const getOrCreateRentalPreparation = async (rentalId: string): Promise<PreparationRow> => {
  const existing = await consolidatePreparations(rentalId);
  if (existing) return existing;

  const { error: createError } = await supabase
    .from('rental_preparation')
    .insert([{ rental_id: rentalId, status: 'in_progress' }]);

  if (createError) throw createError;

  const created = await consolidatePreparations(rentalId);
  if (!created) {
    throw new Error('Unable to create rental preparation');
  }

  return created;
};

export const loadPreparationItemsForRental = async (
  rentalId: string,
  preparationId: string,
  externalLabel: string,
): Promise<PreparationItem[]> => {
  const expectedRows = await fetchExpectedRentalItems(rentalId, externalLabel);
  let prepItems = await fetchPreparationItems(preparationId);

  if (prepItems.length === 0) {
    await seedPreparationItems(rentalId, preparationId, externalLabel);
    prepItems = await fetchPreparationItems(preparationId);
  }

  return reconcilePreparationItems(expectedRows, prepItems, preparationId);
};
