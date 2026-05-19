import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Rental } from '../types/rental';
import toast from 'react-hot-toast';

export const useRental = (id: string) => {
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const getRentalTypeLabel = (value?: string | null) => {
    if (value === 'service') return 'Prestation';
    if (value === 'sale') return 'Vente';
    return 'Location';
  };
  const getExternalLabel = (value?: string | null) => (value === 'sale' ? 'Achat matériel' : 'Sous-location');

  useEffect(() => {
    const fetchRental = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('rentals')
          .select(`
            *,
            clients(name),
            rental_items(
              id,
              rental_id,
              equipment_id,
              quantity,
              price_per_day,
              discount_percent,
              created_at,
              group_id,
              position,
              is_external,
              external_name,
              external_description,
              external_type,
              external_subtype,
              external_supplier,
              equipment(name, type)
            ),
            rental_item_groups(
              id,
              name,
              position,
              color
            ),
            rental_maintenance_charges(
              *,
              maintenance:maintenance_id(title, status, cost)
            ),
            rental_returns(
              id,
              status,
              started_at,
              completed_at,
              rental_return_items(
                id,
                equipment_id,
                equipment_name,
                equipment_type,
                expected_quantity,
                returned_quantity,
                notes
              )
            )
          `)
          .eq('id', id)
          .single();

        if (error) throw error;

        if (!data) {
          throw new Error('Rental not found');
        }

        let assignedPersonnel: Array<{ id: string; first_name: string; last_name: string }> = [];
        let personnelServices: Array<{
          id: string;
          service_record_id: string;
          title: string;
          cost_per_person: number | null;
          quantity: number;
          days: number;
          discount_percent: number;
        }> = [];
        let insuranceServices: Array<{
          id: string;
          service_record_id: string;
          title: string;
          amount_per_day: number | null;
          days: number;
        }> = [];
        let otherServices: Array<{
          id: string;
          service_record_id: string;
          title: string;
          price: number | null;
          quantity: number;
          days: number;
        }> = [];
        const isService = data.type === 'service';
        if (isService) {
          try {
            const { data: links, error: linkError } = await supabase
              .from('rental_affectation')
              .select('personnel_id')
              .eq('rental_id', id);
            if (linkError) throw linkError;
            const personnelIds = (links || [])
              .map((row: any) => row.personnel_id)
              .filter((value: any) => typeof value === 'string' && value.length > 0);
            if (personnelIds.length) {
              const { data: people, error: peopleError } = await supabase
                .from('personnel')
                .select('id, first_name, last_name')
                .in('id', personnelIds);
              if (peopleError) throw peopleError;
              assignedPersonnel = (people || [])
                .map((row: any) => ({
                  id: row.id,
                  first_name: row.first_name,
                  last_name: row.last_name,
                }))
                .sort((a, b) => {
                  const last = a.last_name.localeCompare(b.last_name);
                  return last !== 0 ? last : a.first_name.localeCompare(b.first_name);
                });
            }
          } catch (err) {
            console.warn('load rental personnel assignments', err);
          }

          try {
            const { data: rows, error: serviceError } = await supabase
              .from('rental_personnel_services')
              .select('id, service_record_id, quantity, days, discount_percent, created_at, service_records(title, cost_per_person)')
              .eq('rental_id', id)
              .order('created_at', { ascending: true });
            if (serviceError) throw serviceError;
            personnelServices = (rows || []).map((row: any) => {
              const linked = Array.isArray(row.service_records)
                ? row.service_records[0]
                : row.service_records;
              return {
                id: row.id,
                service_record_id: row.service_record_id,
                title: linked?.title || 'Service',
                cost_per_person: linked?.cost_per_person ?? null,
                quantity: Number(row.quantity || 0),
                days: Number(row.days || 0),
                discount_percent: Number(row.discount_percent || 0),
              };
            });
          } catch (err) {
            console.warn('load rental personnel services', err);
          }
        }

        try {
          const { data: rows, error: insuranceError } = await supabase
            .from('rental_insurance_services')
            .select('id, service_record_id, days, created_at, service_records(title, amount_per_day)')
            .eq('rental_id', id)
            .order('created_at', { ascending: true });
          if (insuranceError) throw insuranceError;
          insuranceServices = (rows || []).map((row: any) => {
            const linked = Array.isArray(row.service_records)
              ? row.service_records[0]
              : row.service_records;
            return {
              id: row.id,
              service_record_id: row.service_record_id,
              title: linked?.title || 'Assurance',
              amount_per_day: linked?.amount_per_day ?? null,
              days: Number(row.days || 0),
            };
          });
        } catch (err) {
          console.warn('load rental insurance services', err);
        }

        try {
          const { data: rows, error: otherError } = await supabase
            .from('rental_other_services')
            .select('id, service_record_id, quantity, days, created_at, service_records(title, price)')
            .eq('rental_id', id)
            .order('created_at', { ascending: true });
          if (otherError) throw otherError;
          otherServices = (rows || []).map((row: any) => {
            const linked = Array.isArray(row.service_records)
              ? row.service_records[0]
              : row.service_records;
            return {
              id: row.id,
              service_record_id: row.service_record_id,
              title: linked?.title || 'Service',
              price: linked?.price ?? null,
              quantity: Number(row.quantity || 0),
              days: Number(row.days || 0),
            };
          });
        } catch (err) {
          console.warn('load rental other services', err);
        }

        const groupMeta = new Map<string, { position: number; parent: string | null }>();
        (data.rental_item_groups || []).forEach((group: any) => {
          if (group && group.id) {
            groupMeta.set(group.id, {
              position: group.position || 0,
              parent: group.parent_group_id || null,
            });
          }
        });
        const pad = (value: number) => value.toString().padStart(4, '0');
        const pathCache = new Map<string, string>();
        const computePath = (groupId: string | null): string => {
          if (!groupId) return '';
          if (pathCache.has(groupId)) return pathCache.get(groupId)!;
          const meta = groupMeta.get(groupId);
          if (!meta) return '';
          const parentPath = computePath(meta.parent);
          const path = parentPath ? `${parentPath}.${pad(meta.position)}` : pad(meta.position);
          pathCache.set(groupId, path);
          return path;
        };

        const externalLabel = getExternalLabel(data.type);
        const formattedRental = {
          ...data,
          client_name: data.clients?.name || 'Client inconnu',
          items: (data.rental_items || []).map(item => {
            const isExternal = !!item.is_external;
            const externalBaseType = [item.external_type, item.external_subtype].filter(Boolean).join(' / ');
            const equipmentType = isExternal
              ? (externalBaseType ? `${externalBaseType} (${externalLabel})` : externalLabel)
              : (item.equipment?.type || 'Type inconnu');
            const equipmentName = isExternal
              ? (item.external_name || externalLabel)
              : (item.equipment?.name || 'Équipement inconnu');
            return {
              id: item.id,
              equipment_id: item.equipment_id,
              equipment_name: equipmentName,
              equipment_type: equipmentType,
              quantity: item.quantity,
              price_per_day: item.price_per_day,
              discount_percent: item.discount_percent ?? 0,
              group_id: item.group_id,
              position: item.position,
              is_external: isExternal,
              external_name: item.external_name,
              external_type: item.external_type,
              external_subtype: item.external_subtype,
              external_description: item.external_description,
              external_supplier: item.external_supplier,
              _path: computePath(item.group_id || null),
            };
          }).sort((a, b) => {
            if (a._path === b._path) return (a.position || 0) - (b.position || 0);
            return a._path.localeCompare(b._path);
          }).map(({ _path, ...rest }) => rest),
          item_groups: Array.isArray(data.rental_item_groups)
            ? data.rental_item_groups
                .map((group: any) => ({
                  id: group.id,
                  name: group.name,
                  position: group.position || 0,
                  color: group.color || null,
                  parent_group_id: group.parent_group_id || null,
                  _path: computePath(group.id),
                }))
                .sort((a, b) => a._path.localeCompare(b._path))
                .map(({ _path, ...rest }) => rest)
            : [],
          maintenance_charges: data.rental_maintenance_charges?.map((charge: any) => ({
            id: charge.id,
            maintenance_id: charge.maintenance_id,
            label: charge.label,
            amount: Number(charge.amount || 0),
            maintenance_title: charge.maintenance?.title,
            maintenance_status: charge.maintenance?.status,
          })) || [],
          assigned_personnel: assignedPersonnel,
          personnel_services: personnelServices,
          insurance_services: insuranceServices,
          other_services: otherServices,
          return_info: (() => {
            const returnRow = Array.isArray(data.rental_returns)
              ? data.rental_returns[0]
              : data.rental_returns;
            if (!returnRow) return null;
            return {
              id: returnRow.id,
              status: returnRow.status,
              started_at: returnRow.started_at,
              completed_at: returnRow.completed_at,
              items: (returnRow.rental_return_items || []).map((row: any) => ({
                id: row.id,
                equipment_id: row.equipment_id,
                equipment_name: row.equipment_name || 'Équipement',
                equipment_type: row.equipment_type || 'Type',
                expected_quantity: row.expected_quantity,
                returned_quantity: row.returned_quantity,
                notes: row.notes,
              })),
            };
          })(),
          returned_at: data.returned_at || null,
        };

        setRental(formattedRental);
      } catch (err) {
        console.error('Error fetching rental:', err);
        setError('Failed to fetch rental details');
        toast.error('Erreur lors du chargement du projet');
      } finally {
        setLoading(false);
      }
    };

    fetchRental();
  }, [id]);

  const updateRental = async (updates: Partial<Rental>) => {
    try {
      const { data, error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setRental(prev => prev ? { ...prev, ...data } : null);
      // Sync calendar event on single rental update as well
      try {
        const effectiveType = (data?.type || updates.type) as string | undefined;
        const isService = effectiveType === 'service';
        const typeLabel = getRentalTypeLabel(effectiveType);
        const eventUpdates: any = {
          title: typeLabel,
          description: (data?.location ?? updates.location) || null,
          type: isService ? 'service' : 'rental',
          start_date: data?.start_date ?? updates.start_date,
          end_date: data?.end_date ?? updates.end_date,
          color: (data?.color ?? updates.color) || null,
        };
        const { data: evs } = await supabase
          .from('calendar_events')
          .select('id')
          .or(`rental_id.eq.${id},service_id.eq.${id}`)
          .limit(1);
        if (evs && evs.length > 0) {
          await supabase.from('calendar_events').update(eventUpdates).eq('id', evs[0].id);
        } else {
          await supabase.from('calendar_events').insert([{ ...eventUpdates, rental_id: id, service_id: isService ? id : null }]);
        }
      } catch (e) {
        console.warn('Calendar event sync skipped:', e);
      }

      toast.success(`${getRentalTypeLabel(data?.type || updates.type)} mise à jour`);
      return data;
    } catch (err) {
      console.error('Error updating rental:', err);
      toast.error('Erreur lors de la mise à jour');
      throw err;
    }
  };

  return { rental, loading, error, setRental, updateRental };
};
