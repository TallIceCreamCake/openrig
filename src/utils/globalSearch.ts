import { supabase } from '../lib/supabase';
import type { RentalStatus, RentalType } from '../types/rental';

export type GlobalSearchSectionKey = 'projects' | 'clients' | 'equipment';
export type GlobalSearchResultKind = 'project' | 'client' | 'equipment';

export type GlobalSearchResult = {
  id: string;
  kind: GlobalSearchResultKind;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  href: string;
  badge?: string | null;
  badgeTone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'gray';
  status?: string | null;
  statusTone?: 'emerald' | 'amber' | 'rose' | 'gray';
};

export type GlobalSearchSection = {
  key: GlobalSearchSectionKey;
  label: string;
  results: GlobalSearchResult[];
};

type ProjectSearchRow = {
  id: string;
  client_id?: string | null;
  reference_code: string | null;
  title: string | null;
  status: RentalStatus | null;
  type: RentalType | null;
  start_date: string | null;
  end_date: string | null;
  location?: string | null;
  description?: string | null;
  clients: { name?: string | null } | Array<{ name?: string | null }> | null;
};

type ClientSearchRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type EquipmentSearchRow = {
  id: string;
  name: string | null;
  type: string | null;
  subtype: string | null;
  status: string | null;
};

type PackItemRow = {
  pack_id: string;
  equipment_id: string;
  quantity: number;
};

const SEARCH_RESULT_LIMIT = 5;

const projectTypeLabels: Record<RentalType, string> = {
  rental: 'Location',
  service: 'Prestation',
  sale: 'Vente',
};

const projectStatusLabels: Partial<Record<RentalStatus, string>> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  preparing: 'Préparation',
  in_progress: 'En cours',
  delivered: 'Livré',
  return_delivery: 'Retour livraison',
  in_return: 'En retour',
  returned: 'Retourné',
  completed: 'Terminé',
  paid: 'Payé',
  cancelled: 'Annulé',
  archived: 'Archivé',
};

const projectStatusTones: Partial<Record<RentalStatus, GlobalSearchResult['statusTone']>> = {
  pending: 'amber',
  confirmed: 'emerald',
  preparing: 'amber',
  in_progress: 'amber',
  delivered: 'emerald',
  return_delivery: 'amber',
  in_return: 'amber',
  returned: 'emerald',
  completed: 'emerald',
  paid: 'emerald',
  cancelled: 'rose',
  archived: 'gray',
};

const equipmentStatusLabels: Record<string, string> = {
  available: 'Disponible',
  in_use: 'En utilisation',
  maintenance: 'Maintenance',
  broken: 'Cassé',
};

const equipmentStatusTones: Record<string, NonNullable<GlobalSearchResult['statusTone']>> = {
  available: 'emerald',
  in_use: 'amber',
  maintenance: 'amber',
  broken: 'rose',
};

const sanitizeSearchTerm = (value: string) => value.replace(/[%_,()]/g, ' ').trim();

const typeQueryMap: Array<{ type: RentalType; aliases: string[] }> = [
  { type: 'service', aliases: ['presta', 'prestation', 'service'] },
  { type: 'rental', aliases: ['location', 'loc', 'rental'] },
  { type: 'sale', aliases: ['vente', 'sale'] },
];

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
};

const formatProjectPeriod = (startDate: string | null, endDate: string | null) => {
  const start = formatShortDate(startDate);
  const end = formatShortDate(endDate);
  if (start && end) return `${start} -> ${end}`;
  return start || end || null;
};

const getClientName = (value: ProjectSearchRow['clients']) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0]?.name?.trim() || null;
  }
  return value.name?.trim() || null;
};

const mapAvailabilityLabel = (availableUnits: number | null | undefined) => {
  if (availableUnits == null) {
    return { label: 'Disponibilité inconnue', tone: 'gray' as const };
  }
  if (availableUnits <= 0) {
    return { label: 'Indisponible', tone: 'rose' as const };
  }
  if (availableUnits <= 2) {
    return { label: `Stock limité (${availableUnits})`, tone: 'amber' as const };
  }
  return { label: `Disponible (${availableUnits})`, tone: 'emerald' as const };
};

const isPackType = (value?: string | null) => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'pack' || normalized === 'kit';
};

const loadBaseAvailabilityMap = async (
  ids: string[],
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> => {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase.rpc('get_units_availability_for_equipment', {
    p_ids: ids,
    p_start: startDate,
    p_end: endDate,
  });

  if (error) {
    console.error('global search unit availability', error);
  } else {
    (data || []).forEach((row: { equipment_id?: string; available?: number | string | null }) => {
      if (!row?.equipment_id) return;
      const available = Math.max(0, Number(row.available ?? 0));
      map.set(row.equipment_id, available);
    });
  }

  const needsFallback = ids.filter((id) => !map.has(id) || (map.get(id) ?? 0) <= 0);
  if (needsFallback.length > 0) {
    const { data: fallback, error: fallbackError } = await supabase.rpc('get_availability_for_equipment', {
      p_ids: needsFallback,
      p_start: startDate,
      p_end: endDate,
    });

    if (fallbackError) {
      console.error('global search aggregate availability', fallbackError);
    } else {
      (fallback || []).forEach((row: { equipment_id?: string; available?: number | string | null }) => {
        if (!row?.equipment_id) return;
        const available = Math.max(0, Number(row.available ?? 0));
        if (!map.has(row.equipment_id) || available > (map.get(row.equipment_id) ?? 0)) {
          map.set(row.equipment_id, available);
        }
      });
    }
  }

  return map;
};

const searchProjects = async (pattern: string): Promise<GlobalSearchResult[]> => {
  const normalizedQuery = pattern.replaceAll('%', '').trim().toLowerCase();
  const matchedTypes = typeQueryMap
    .filter((entry) => entry.aliases.some((alias) => alias.includes(normalizedQuery) || normalizedQuery.includes(alias)))
    .map((entry) => entry.type);

  const { data, error } = await supabase
    .from('rentals')
    .select(`
      id,
      client_id,
      reference_code,
      title,
      status,
      type,
      start_date,
      end_date,
      location,
      description,
      clients:clients(name)
    `)
    .or([
      `reference_code.ilike.${pattern}`,
      `title.ilike.${pattern}`,
      `location.ilike.${pattern}`,
      `description.ilike.${pattern}`,
      ...matchedTypes.map((type) => `type.eq.${type}`),
    ].join(','))
    .order('created_at', { ascending: false })
    .limit(SEARCH_RESULT_LIMIT * 3);

  if (error) throw error;

  const rows = ((data as ProjectSearchRow[] | null) || []);

  let clientMatchedRows: ProjectSearchRow[] = [];
  const { data: clientsData, error: clientsError } = await supabase
    .from('clients')
    .select('id')
    .or(`name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`)
    .limit(SEARCH_RESULT_LIMIT * 3);

  if (clientsError) {
    console.error('global search project clients', clientsError);
  } else {
    const clientIds = ((clientsData as Array<{ id: string }> | null) || []).map((row) => row.id);
    if (clientIds.length > 0) {
      const { data: rentalByClientData, error: rentalByClientError } = await supabase
        .from('rentals')
        .select(`
          id,
          client_id,
          reference_code,
          title,
          status,
          type,
          start_date,
          end_date,
          location,
          description,
          clients:clients(name)
        `)
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(SEARCH_RESULT_LIMIT * 3);

      if (rentalByClientError) {
        console.error('global search rentals by client', rentalByClientError);
      } else {
        clientMatchedRows = (rentalByClientData as ProjectSearchRow[] | null) || [];
      }
    }
  }

  const mergedRows = Array.from(
    new Map(
      [...rows, ...clientMatchedRows].map((row) => [row.id, row]),
    ).values(),
  ).slice(0, SEARCH_RESULT_LIMIT);

  return mergedRows.map((row) => {
    const clientName = getClientName(row.clients);
    const type = row.type && projectTypeLabels[row.type] ? projectTypeLabels[row.type] : 'Projet';
    const title = row.title?.trim() || row.reference_code?.trim() || clientName || 'Projet';
    const subtitleParts = [row.reference_code ? `Ref. ${row.reference_code}` : null, clientName].filter(Boolean);
    const location = row.location?.trim() || null;

    return {
      id: row.id,
      kind: 'project',
      title,
      subtitle: subtitleParts.join(' · ') || null,
      meta: [formatProjectPeriod(row.start_date, row.end_date), location].filter(Boolean).join(' · ') || null,
      href: `/rentals/${row.id}`,
      badge: type,
      badgeTone: 'blue',
      status: row.status ? projectStatusLabels[row.status] || row.status : null,
      statusTone: row.status ? projectStatusTones[row.status] || 'gray' : 'gray',
    };
  });
};

const searchClients = async (pattern: string): Promise<GlobalSearchResult[]> => {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, phone, company')
    .or(`name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(SEARCH_RESULT_LIMIT);

  if (error) throw error;

  return (((data as ClientSearchRow[] | null) || [])).map((row) => ({
    id: row.id,
    kind: 'client',
    title: row.name?.trim() || 'Client',
    subtitle: row.email?.trim() || null,
    meta: row.phone?.trim() || null,
    href: `/clients/${row.id}`,
    badge: 'Client',
    badgeTone: 'gray',
    status: null,
    statusTone: 'gray',
  }));
};

const searchEquipment = async (pattern: string): Promise<GlobalSearchResult[]> => {
  const { data, error } = await supabase
    .from('equipment')
    .select('id, name, type, subtype, status')
    .or(`name.ilike.${pattern},type.ilike.${pattern},subtype.ilike.${pattern}`)
    .order('name', { ascending: true })
    .limit(SEARCH_RESULT_LIMIT);

  if (error) throw error;

  const list = (data as EquipmentSearchRow[] | null) || [];
  if (list.length === 0) return [];

  const now = new Date().toISOString();
  const equipmentById = new Map(list.map((item) => [item.id, item]));
  const packItemsByPackId = new Map<string, Array<{ equipment_id: string; quantity: number }>>();
  const processedPackIds = new Set<string>();
  let pendingPackIds = list.filter((item) => isPackType(item.type)).map((item) => item.id);

  while (pendingPackIds.length > 0) {
    const batch = pendingPackIds.filter((id) => !processedPackIds.has(id));
    if (batch.length === 0) break;
    batch.forEach((id) => processedPackIds.add(id));

    const { data: packRows, error: packError } = await supabase
      .from('equipment_pack_items')
      .select('pack_id, equipment_id, quantity')
      .in('pack_id', batch);

    if (packError) {
      console.error('global search pack items', packError);
      break;
    }

    const missingComponentIds = new Set<string>();
    ((packRows as PackItemRow[] | null) || []).forEach((row) => {
      if (!row?.pack_id || !row?.equipment_id) return;
      if (!packItemsByPackId.has(row.pack_id)) {
        packItemsByPackId.set(row.pack_id, []);
      }
      packItemsByPackId.get(row.pack_id)!.push({
        equipment_id: row.equipment_id,
        quantity: Math.max(1, Number(row.quantity || 1)),
      });
      if (!equipmentById.has(row.equipment_id)) {
        missingComponentIds.add(row.equipment_id);
      }
    });

    if (missingComponentIds.size > 0) {
      const { data: componentRows, error: componentError } = await supabase
        .from('equipment')
        .select('id, name, type, subtype, status')
        .in('id', Array.from(missingComponentIds));

      if (componentError) {
        console.error('global search pack components', componentError);
      } else {
        ((componentRows as EquipmentSearchRow[] | null) || []).forEach((row) => {
          equipmentById.set(row.id, row);
        });
      }
    }

    pendingPackIds = Array.from(missingComponentIds).filter((id) => isPackType(equipmentById.get(id)?.type));
  }

  const baseAvailabilityMap = await loadBaseAvailabilityMap(Array.from(equipmentById.keys()), now, now);
  const resolvedAvailability = new Map<string, number>();
  const computeAvailability = (equipmentId: string, stack = new Set<string>()): number => {
    if (resolvedAvailability.has(equipmentId)) {
      return resolvedAvailability.get(equipmentId)!;
    }

    if (stack.has(equipmentId)) {
      return 0;
    }

    const equipment = equipmentById.get(equipmentId);
    if (!equipment) {
      return 0;
    }

    if (!isPackType(equipment.type)) {
      const available = Math.max(0, baseAvailabilityMap.get(equipmentId) ?? 0);
      resolvedAvailability.set(equipmentId, available);
      return available;
    }

    const items = packItemsByPackId.get(equipmentId) || [];
    if (items.length === 0) {
      resolvedAvailability.set(equipmentId, 0);
      return 0;
    }

    stack.add(equipmentId);
    let packAvailable = Number.POSITIVE_INFINITY;
    items.forEach((item) => {
      const componentAvailable = computeAvailability(item.equipment_id, stack);
      const possiblePacks = Math.floor(componentAvailable / Math.max(1, item.quantity));
      if (possiblePacks < packAvailable) {
        packAvailable = possiblePacks;
      }
    });
    stack.delete(equipmentId);

    const available = Number.isFinite(packAvailable) ? Math.max(0, packAvailable) : 0;
    resolvedAvailability.set(equipmentId, available);
    return available;
  };

  return list.map((row) => {
    const availability = mapAvailabilityLabel(computeAvailability(row.id));
    const subtype = row.subtype?.trim();
    const type = row.type?.trim();
    const rawStatus = row.status?.trim() || null;

    return {
      id: row.id,
      kind: 'equipment',
      title: row.name?.trim() || 'Matériel',
      subtitle: [type, subtype].filter(Boolean).join(' · ') || null,
      meta: availability.label,
      href: `/equipment/${row.id}`,
      badge: 'Matériel',
      badgeTone: availability.tone,
      status: rawStatus ? equipmentStatusLabels[rawStatus] || rawStatus : null,
      statusTone: rawStatus ? equipmentStatusTones[rawStatus] || 'gray' : availability.tone === 'rose' ? 'rose' : availability.tone === 'amber' ? 'amber' : 'gray',
    };
  });
};

export const searchGlobalEntities = async (query: string): Promise<GlobalSearchSection[]> => {
  const sanitized = sanitizeSearchTerm(query);
  if (!sanitized) return [];

  const pattern = `%${sanitized}%`;
  const [projectsResult, clientsResult, equipmentResult] = await Promise.allSettled([
    searchProjects(pattern),
    searchClients(pattern),
    searchEquipment(pattern),
  ]);

  const sections: GlobalSearchSection[] = [];

  if (projectsResult.status === 'fulfilled' && projectsResult.value.length > 0) {
    sections.push({
      key: 'projects',
      label: 'Projets et prestations',
      results: projectsResult.value,
    });
  } else if (projectsResult.status === 'rejected') {
    console.error('global search projects', projectsResult.reason);
  }

  if (clientsResult.status === 'fulfilled' && clientsResult.value.length > 0) {
    sections.push({
      key: 'clients',
      label: 'Clients',
      results: clientsResult.value,
    });
  } else if (clientsResult.status === 'rejected') {
    console.error('global search clients', clientsResult.reason);
  }

  if (equipmentResult.status === 'fulfilled' && equipmentResult.value.length > 0) {
    sections.push({
      key: 'equipment',
      label: 'Matériel',
      results: equipmentResult.value,
    });
  } else if (equipmentResult.status === 'rejected') {
    console.error('global search equipment', equipmentResult.reason);
  }

  return sections;
};
