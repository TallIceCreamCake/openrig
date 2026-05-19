import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Rental, RentalCreatePayload } from '../types/rental';
import toast from 'react-hot-toast';

export const useRentals = () => {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  type ActivityActor = {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  };
  const isPackType = (value?: string | null) => {
    const normalized = (value || '').trim().toLowerCase();
    return normalized === 'pack' || normalized === 'kit';
  };
  const getRentalTypeLabel = (value?: string | null) => {
    if (value === 'service') return 'Prestation';
    if (value === 'sale') return 'Vente';
    return 'Location';
  };
  const getRentalLabelFromId = (id: string) => {
    const found = rentals.find((entry) => entry.id === id);
    return getRentalTypeLabel(found?.type);
  };
  const getExternalLabel = (value?: string | null) => (value === 'sale' ? 'Achat matériel' : 'Sous-location');

  const fetchRentals = async () => {
    try {
      setLoading(true);
      const { data: rentalsData, error: rentalsError } = await supabase
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
            id,
            maintenance_id,
            label,
            amount,
            maintenance:maintenance_id(title, status)
          ),
          rental_personnel_services(
            id,
            service_record_id,
            quantity,
            days,
            discount_percent,
            service_record:service_records(title, cost_per_person)
          ),
          rental_insurance_services(
            id,
            service_record_id,
            days,
            service_record:service_records(title, amount_per_day)
          ),
          rental_other_services(
            id,
            service_record_id,
            quantity,
            days,
            service_record:service_records(title, price)
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
        .order('created_at', { ascending: false });

      if (rentalsError) throw rentalsError;

      const formattedRentals = rentalsData?.map(rental => {
        const groupMeta = new Map<string, { position: number; parent: string | null }>();
        (rental.rental_item_groups || []).forEach((group: any) => {
          if (group && group.id) {
            groupMeta.set(group.id, {
              position: group.position || 0,
              parent: group.parent_group_id || null,
            });
          }
        });
        const pathCache = new Map<string, string>();
        const pad = (value: number) => value.toString().padStart(4, '0');
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
        const externalLabel = getExternalLabel(rental.type);
        const mappedItems = (rental.rental_items || []).map(item => {
          const isExternal = !!item.is_external;
          const equipmentName = isExternal
            ? (item.external_name || externalLabel)
            : (item.equipment?.name || 'Équipement inconnu');
          const externalBaseType = [item.external_type, item.external_subtype].filter(Boolean).join(' / ');
          const equipmentType = isExternal
            ? (externalBaseType ? `${externalBaseType} (${externalLabel})` : externalLabel)
            : (item.equipment?.type || 'Type inconnu');
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
        });
        const cleanItems = mappedItems.map(({ _path, ...rest }) => rest);
        const maintenanceCharges = (rental.rental_maintenance_charges || []).map((charge: any) => ({
          id: charge.id,
          maintenance_id: charge.maintenance_id || null,
          label: charge.label || 'Maintenance',
          amount: Number(charge.amount || 0),
          maintenance_title: charge.maintenance?.title,
          maintenance_status: charge.maintenance?.status,
        }));
        const personnelServices = (rental.rental_personnel_services || []).map((row: any) => ({
          id: row.id,
          service_record_id: row.service_record_id,
          title: row.service_record?.title || 'Service',
          cost_per_person: row.service_record?.cost_per_person ?? null,
          quantity: Number(row.quantity || 0),
          days: Number(row.days || 0),
          discount_percent: Number(row.discount_percent || 0),
        }));
        const insuranceServices = (rental.rental_insurance_services || []).map((row: any) => ({
          id: row.id,
          service_record_id: row.service_record_id,
          title: row.service_record?.title || 'Assurance',
          amount_per_day: row.service_record?.amount_per_day ?? null,
          days: Number(row.days || 0),
        }));
        const otherServices = (rental.rental_other_services || []).map((row: any) => ({
          id: row.id,
          service_record_id: row.service_record_id,
          title: row.service_record?.title || 'Service',
          price: row.service_record?.price ?? null,
          quantity: Number(row.quantity || 0),
          days: Number(row.days || 0),
        }));
        return {
          ...rental,
          client_name: rental.clients?.name || 'Client inconnu',
          items: cleanItems,
          maintenance_charges: maintenanceCharges,
          personnel_services: personnelServices,
          insurance_services: insuranceServices,
          other_services: otherServices,
          item_groups: Array.isArray(rental.rental_item_groups)
            ? rental.rental_item_groups
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
          return_info: (() => {
            const returnRow = Array.isArray(rental.rental_returns)
              ? rental.rental_returns[0]
              : rental.rental_returns;
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
                notes: row.notes
              })),
            };
          })(),
          returned_at: rental.returned_at || null,
        };
      }) || [];

      setRentals(formattedRentals);
    } catch (err) {
      console.error('Error fetching rentals:', err);
      setError('Failed to fetch rentals');
      toast.error('Erreur lors du chargement des projets');
    } finally {
      setLoading(false);
    }
  };

  const addRental = async (
    rentalData: RentalCreatePayload,
    actor?: ActivityActor
  ) => {
    try {
      const {
        items,
        item_groups,
        assigned_personnel_ids,
        vehicle_assignments,
        personnel_service_items,
        ...rentalInfo
      } = rentalData as any;
      
      const statusMap: Record<string, string> = {
        pending: 'pending',
        confirmed: 'confirmed',
        preparing: 'preparing',
        in_progress: 'delivered',
        delivered: 'delivered',
        return_delivery: 'return_delivery',
        in_return: 'in_return',
        completed: 'returned',
        returned: 'returned',
        paid: 'paid',
        archived: 'paid',
        cancelled: 'cancelled',
      };

      const nextStatus = statusMap[rentalData.status as string] || 'pending';

      const { data: rental, error: rentalError } = await supabase
        .from('rentals')
        .insert([{ ...rentalInfo, status: nextStatus }])
        .select()
        .single();

      if (rentalError) throw rentalError;

      if (Array.isArray(item_groups) && item_groups.length) {
        const groupsPayload = item_groups.map((group) => ({
          id: group.id,
          rental_id: rental.id,
          name: group.name,
          position: group.position || 0,
          color: group.color || null,
        }));
        const { error: groupInsertError } = await supabase.from('rental_item_groups').insert(groupsPayload);
        if (groupInsertError) throw groupInsertError;
      }

      // Create/update calendar event for services (and rentals)
      try {
        const isService = rental.type === 'service';
        const typeLabel = getRentalTypeLabel(rental.type);
        const refCode = rental.reference_code || rental.id.slice(0, 6);
        const eventTitle = `${typeLabel} – ${refCode}`;
        const eventPayload: any = {
          title: eventTitle,
          description: rental.location || null,
          type: isService ? 'service' : 'rental',
          start_date: rental.start_date,
          end_date: rental.end_date,
          color: rental.color || null,
          rental_id: rental.id,
          service_id: isService ? rental.id : null,
        };
        await supabase.from('calendar_events').insert([eventPayload]);
      } catch (e) {
        console.warn('Calendar event creation skipped:', e);
      }

      // Add rental items if provided (with per-unit availability + allocation)
      const skipAvailability = rental.type === 'sale';
      let equipmentCategories = new Map<string, string>();
      let equipmentTypes = new Map<string, string>();
      const packItemsByPackId = new Map<string, Array<{ equipment_id: string; quantity: number }>>();
      if (!skipAvailability && items && items.length > 0) {
        const equipmentIds = Array.from(new Set(items
          .filter((it: any) => it?.equipment_id && !it.is_external)
          .map((it: any) => it.equipment_id)));
        if (equipmentIds.length) {
          const { data: equipmentRows, error: equipmentErr } = await supabase
            .from('equipment')
            .select('id, inventory_category, type')
            .in('id', equipmentIds);
          if (!equipmentErr && Array.isArray(equipmentRows)) {
            equipmentRows.forEach(row => {
              if (row?.id) {
                equipmentCategories.set(row.id, row.inventory_category || 'series');
                equipmentTypes.set(row.id, row.type || '');
              }
            });
          }
          const packIds = Array.from(new Set(items
            .filter((it: any) => it?.equipment_id && !it.is_external)
            .map((it: any) => ({
              id: it.equipment_id,
              type: equipmentTypes.get(it.equipment_id) || it.equipment_type,
            }))
            .filter((entry: any) => isPackType(entry.type))
            .map((entry: any) => entry.id)));
          if (packIds.length) {
            const { data: packRows, error: packErr } = await supabase
              .from('equipment_pack_items')
              .select('pack_id, equipment_id, quantity')
              .in('pack_id', packIds);
            if (!packErr && Array.isArray(packRows)) {
              const componentIds = new Set<string>();
              packRows.forEach((row: any) => {
                if (!row?.pack_id || !row?.equipment_id) return;
                const qty = Number.isFinite(row.quantity) ? row.quantity : 1;
                if (!packItemsByPackId.has(row.pack_id)) packItemsByPackId.set(row.pack_id, []);
                packItemsByPackId.get(row.pack_id)!.push({
                  equipment_id: row.equipment_id,
                  quantity: Math.max(1, qty),
                });
                componentIds.add(row.equipment_id);
              });
              const missingComponentIds = Array.from(componentIds).filter((id) => !equipmentCategories.has(id));
              if (missingComponentIds.length) {
                const { data: componentRows, error: componentErr } = await supabase
                  .from('equipment')
                  .select('id, inventory_category, type')
                  .in('id', missingComponentIds);
                if (!componentErr && Array.isArray(componentRows)) {
                  componentRows.forEach(row => {
                    if (row?.id) {
                      equipmentCategories.set(row.id, row.inventory_category || 'series');
                      equipmentTypes.set(row.id, row.type || '');
                    }
                  });
                }
              }
            }
          }
        }
      }

      if (items && items.length > 0) {
        const availabilityCache = new Map<string, number>();
        const unitAvailabilityCache = new Map<string, number>();

        const getAggregateAvailability = async (equipmentId: string) => {
          if (availabilityCache.has(equipmentId)) {
            return availabilityCache.get(equipmentId)!;
          }
          const { data: availRows, error: availErr } = await supabase.rpc('get_availability_for_equipment', {
            p_ids: [equipmentId],
            p_start: rental.usage_start_date || rental.start_date,
            p_end: rental.usage_end_date || rental.end_date,
          });
          if (availErr) {
            console.warn('Aggregate availability check failed', equipmentId, availErr);
            availabilityCache.set(equipmentId, 0);
            return 0;
          }
          const available = Array.isArray(availRows) && availRows.length
            ? Math.max(0, Number((availRows[0] as any).available ?? 0))
            : 0;
          availabilityCache.set(equipmentId, available);
          return available;
        };

        const getUnitAvailability = async (equipmentId: string) => {
          if (unitAvailabilityCache.has(equipmentId)) {
            return unitAvailabilityCache.get(equipmentId)!;
          }
          const { data: unitsAvail, error: unitsErr } = await supabase.rpc('get_units_availability_for_equipment', {
            p_ids: [equipmentId],
            p_start: rental.usage_start_date || rental.start_date,
            p_end: rental.usage_end_date || rental.end_date,
          });
          if (unitsErr || !Array.isArray(unitsAvail) || !unitsAvail.length) {
            return null;
          }
          const available = Math.max(0, Number((unitsAvail[0] as any).available ?? 0));
          unitAvailabilityCache.set(equipmentId, available);
          return available;
        };

        const requiredByEquipment = new Map<string, number>();
        const addRequirement = (equipmentId: string, quantity: number) => {
          if (!equipmentId) return;
          const prev = requiredByEquipment.get(equipmentId) || 0;
          requiredByEquipment.set(equipmentId, prev + quantity);
        };

        items.forEach((it: any) => {
          if (!it?.equipment_id || it.is_external) return;
          const eqId = it.equipment_id as string;
          const typeValue = equipmentTypes.get(eqId) || it.equipment_type;
          if (isPackType(typeValue)) {
            const packItems = packItemsByPackId.get(eqId) || [];
            if (!packItems.length) {
              addRequirement(eqId, it.quantity);
              return;
            }
            packItems.forEach((packItem) => {
              const perPackQty = Math.max(1, packItem.quantity || 1);
              addRequirement(packItem.equipment_id, perPackQty * it.quantity);
            });
          } else {
            addRequirement(eqId, it.quantity);
          }
        });

        if (!skipAvailability) {
          for (const [equipmentId, requiredQty] of requiredByEquipment) {
            const category = equipmentCategories.get(equipmentId) || 'series';
            if (category === 'series') {
              const availableUnits = await getUnitAvailability(equipmentId);
              if (typeof availableUnits === 'number') {
                if (availableUnits < requiredQty) {
                  await supabase.from('calendar_events').delete().or(`rental_id.eq.${rental.id},service_id.eq.${rental.id}`);
                  await supabase.from('rentals').delete().eq('id', rental.id);
                  throw new Error(`Stock insuffisant (unités) pour l'équipement ${equipmentId}. Dispo: ${availableUnits}, demandé: ${requiredQty}`);
                }
                continue;
              }
            }
            const available = await getAggregateAvailability(equipmentId);
            if (available < requiredQty) {
              await supabase.from('calendar_events').delete().or(`rental_id.eq.${rental.id},service_id.eq.${rental.id}`);
              await supabase.from('rentals').delete().eq('id', rental.id);
              throw new Error(`Stock insuffisant pour l'équipement ${equipmentId}. Dispo: ${available}, demandé: ${requiredQty}`);
            }
          }
          // Allocate real units
          for (const [equipmentId, requiredQty] of requiredByEquipment) {
            const category = equipmentCategories.get(equipmentId) || 'series';
            if (category === 'series') {
              const { error: allocErr } = await supabase.rpc('allocate_units_for_rental', {
                p_equipment_id: equipmentId,
                p_qty: requiredQty,
                p_rental_id: rental.id,
                p_start: rental.usage_start_date || rental.start_date,
                p_end: rental.usage_end_date || rental.end_date,
              });
              if (allocErr) {
                await supabase.from('rental_unit_reservations').delete().eq('rental_id', rental.id);
                await supabase.from('calendar_events').delete().or(`rental_id.eq.${rental.id},service_id.eq.${rental.id}`);
                await supabase.from('rentals').delete().eq('id', rental.id);
                throw allocErr;
              }
            }
          }
        }
        // Insert rental_items snapshot for pricing
        const rentalItems = items.map(item => ({
          rental_id: rental.id,
          equipment_id: item.equipment_id,
          quantity: item.quantity,
          price_per_day: item.price_per_day,
          discount_percent: Number.isFinite(item.discount_percent)
            ? Math.min(100, Math.max(0, Number(item.discount_percent)))
            : 0,
          group_id: item.group_id || null,
          position: item.position || 0,
          is_external: !!item.is_external,
          external_name: item.is_external ? (item.external_name || item.equipment_name) : null,
          external_description: item.is_external ? item.external_description || null : null,
          external_type: item.is_external ? (item.external_type || item.equipment_type) : null,
          external_subtype: item.is_external ? item.external_subtype || null : null,
          external_supplier: item.is_external ? item.external_supplier || null : null,
        }));
        const { error: itemsError } = await supabase.from('rental_items').insert(rentalItems);
        if (itemsError) throw itemsError;
      }

      // Add vehicle assignments if provided
      try {
        const vas = Array.isArray(vehicle_assignments) ? vehicle_assignments.filter((a) => a.vehicle_id) : [];
        if (vas.length) {
          const rows = vas.map(a => ({
            vehicle_id: a.vehicle_id,
            rental_id: rental.id,
            start_at: rental.start_date,
            end_at: rental.end_date,
            driver_personnel_id: a.driver_personnel_id || null,
            status: 'scheduled',
            delivery_at: a.delivery_at || null,
            appointment_at: a.appointment_at || null,
            return_delivery_at: a.return_delivery_at || null,
            return_appointment_at: a.return_appointment_at || null,
          }));
          await supabase.from('vehicle_assignments').insert(rows);
          // Log delivery/appointment history events
          const historyRows: any[] = [];
          for (const a of vas) {
            if (a.delivery_at) historyRows.push({ vehicle_id: a.vehicle_id, rental_id: rental.id, event: 'delivery', event_time: a.delivery_at, location: rental.location || null, notes: null });
            if (a.appointment_at) historyRows.push({ vehicle_id: a.vehicle_id, rental_id: rental.id, event: 'appointment', event_time: a.appointment_at, location: rental.location || null, notes: null });
            if (!a.delivery_at && !a.appointment_at) historyRows.push({ vehicle_id: a.vehicle_id, rental_id: rental.id, event: 'scheduled', event_time: rental.start_date, location: rental.location || null, notes: null });
          }
          if (historyRows.length) await supabase.from('vehicle_delivery_history').insert(historyRows);
        }
      } catch (vehErr) {
        console.warn('Vehicle assignments insert failed or skipped:', vehErr);
      }

      // Add personnel service assignments for services
      try {
        const serviceRows = Array.isArray(personnel_service_items)
          ? personnel_service_items.filter((row) => row.service_record_id)
          : [];
        if (rental.type === 'service' && serviceRows.length) {
          const rows = serviceRows.map((row) => ({
            rental_id: rental.id,
            service_record_id: row.service_record_id,
            quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)),
            days: Math.max(1, Math.floor(Number(row.days) || 1)),
            discount_percent: Math.min(100, Math.max(0, Number(row.discount_percent) || 0)),
          }));
          await supabase.from('rental_personnel_services').insert(rows);
        }
      } catch (svcErr) {
        console.warn('Personnel service assignments insert failed or skipped:', svcErr);
      }

      await fetchRentals(); // Refresh the list
      toast.success(`${getRentalTypeLabel(rental.type)} créée avec succès`);

      // Create personnel activities for assigned personnel (services)
      try {
        const isService = rental.type === 'service';
        const ids = assigned_personnel_ids || [];
        if (isService && ids.length > 0) {
          const rows = ids.map(pid => ({
            personnel_id: pid,
            type: 'service',
            title: 'Affectation prestation',
            description: rental.location || null,
            rental_id: rental.id,
            client_name: rental.client_id ? null : null,
            location: rental.location || null,
            start_time: rental.start_date,
            end_time: rental.end_date,
            status: 'pending',
          }));
          await supabase.from('personnel_activities').insert(rows);
          // Mirror assignment into dedicated link table
          const links = ids.map(pid => ({ rental_id: rental.id, personnel_id: pid }));
          await supabase.from('rental_affectation').insert(links).select();
        }
      } catch (e) {
        console.warn('Assign personnel failed', e);
      }

      try {
        const actorName = actor?.name?.trim() || actor?.email?.trim() || 'Système';
        await supabase.from('rental_activity_logs').insert([{
          rental_id: rental.id,
          actor_id: actor?.id || null,
          actor_name: actorName,
          action: 'created',
          details: `${getRentalTypeLabel(rental.type)} créée`,
          metadata: { type: rental.type },
        }]);
      } catch (logErr) {
        console.warn('Activity log insert failed', logErr);
      }

      return rental;
    } catch (err: any) {
      console.error('Error adding rental:', err);
      const msg = (err && (err.message || err.error_description)) ? String(err.message || err.error_description) : 'Erreur lors de la création du projet';
      toast.error(msg);
      throw err;
    }
  };

  const updateRental = async (id: string, updates: Partial<Rental>) => {
    try {
      const { items, ...rentalInfo } = updates;
      
      const { data, error } = await supabase
        .from('rentals')
        .update(rentalInfo)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Sync calendar event
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

      await fetchRentals(); // Refresh to get updated data with relations
      toast.success(`${getRentalTypeLabel(data?.type || updates.type)} mise à jour`);
      return data;
    } catch (err) {
      console.error('Error updating rental:', err);
      toast.error('Erreur lors de la mise à jour');
      throw err;
    }
  };

  const deleteRental = async (id: string) => {
    try {
      // Delete related calendar events
      try {
        await supabase
          .from('calendar_events')
          .delete()
          .or(`rental_id.eq.${id},service_id.eq.${id}`);
      } catch (e) {
        console.warn('Calendar event deletion skipped:', e);
      }

      const { error } = await supabase
        .from('rentals')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setRentals(prev => prev.filter(rental => rental.id !== id));
      toast.success(`${getRentalLabelFromId(id)} supprimée`);
    } catch (err) {
      console.error('Error deleting rental:', err);
      toast.error('Erreur lors de la suppression');
      throw err;
    }
  };

  const deleteRentalsBulk = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      try {
        await supabase.from('calendar_events').delete().in('rental_id', ids);
        await supabase.from('calendar_events').delete().in('service_id', ids);
      } catch (e) {
        console.warn('Calendar event bulk deletion skipped:', e);
      }

      const { error } = await supabase
        .from('rentals')
        .delete()
        .in('id', ids);

      if (error) throw error;

      const removed = new Set(ids);
      setRentals(prev => prev.filter(rental => !removed.has(rental.id)));
      if (ids.length > 1) {
        toast.success('Éléments supprimés');
      } else {
        toast.success(`${getRentalLabelFromId(ids[0])} supprimée`);
      }
    } catch (err) {
      console.error('Error deleting rentals batch:', err);
      toast.error('Erreur lors de la suppression');
      throw err;
    }
  };

  const getRentalsWithPayments = async (ids: string[]) => {
    if (!ids.length) return new Set<string>();
    const { data, error } = await supabase
      .from('payments')
      .select('rental_id, status')
      .in('rental_id', ids)
      .neq('status', 'failed');
    if (error) throw error;
    const found = new Set<string>();
    (data || []).forEach((row: any) => {
      if (row?.rental_id) found.add(row.rental_id);
    });
    return found;
  };

  const getRentalsPaymentTotals = async (ids: string[]) => {
    if (!ids.length) return {} as Record<string, number>;
    const { data, error } = await supabase
      .from('payments')
      .select('rental_id, amount, status')
      .in('rental_id', ids)
      .neq('status', 'failed');
    if (error) throw error;
    const totals: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      const rentalId = row?.rental_id;
      if (!rentalId) return;
      const amount = Number(row.amount || 0);
      if (!Number.isFinite(amount)) return;
      totals[rentalId] = (totals[rentalId] || 0) + amount;
    });
    return totals;
  };

  const restoreRentalStatus = async (id: string, status: Rental['status']) => {
    try {
      const { error } = await supabase.from('rentals').update({ status }).eq('id', id);
      if (error) throw error;
      setRentals(prev => prev.map(rental => rental.id === id ? { ...rental, status } : rental));
      toast.success(`${getRentalLabelFromId(id)} réactivée`);
    } catch (err) {
      console.error('Error restoring rental:', err);
      toast.error('Erreur lors de la restauration');
      throw err;
    }
  };

  const archiveRentalsBulk = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const { error } = await supabase
        .from('rentals')
        .update({ status: 'archived' })
        .in('id', ids);
      if (error) throw error;
      const archived = new Set(ids);
      setRentals(prev => prev.map(rental => archived.has(rental.id) ? { ...rental, status: 'archived' } : rental));
      if (ids.length > 1) {
        toast.success('Éléments archivés');
      } else {
        toast.success(`${getRentalLabelFromId(ids[0])} archivée`);
      }
    } catch (err) {
      console.error('Error archiving rentals batch:', err);
      toast.error("Erreur lors de l'archivage");
      throw err;
    }
  };

  const purgeRentalsBulk = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      try {
        const { error: calRentalErr } = await supabase.from('calendar_events').delete().in('rental_id', ids);
        if (calRentalErr) throw calRentalErr;
        const { error: calServiceErr } = await supabase.from('calendar_events').delete().in('service_id', ids);
        if (calServiceErr) throw calServiceErr;
      } catch (e) {
        console.warn('Calendar event bulk deletion skipped:', e);
      }

      const { error: vdhErr } = await supabase.from('vehicle_delivery_history').delete().in('rental_id', ids);
      if (vdhErr) throw vdhErr;
      const { error: vaErr } = await supabase.from('vehicle_assignments').delete().in('rental_id', ids);
      if (vaErr) throw vaErr;
      const { error: actErr } = await supabase.from('personnel_activities').delete().in('rental_id', ids);
      if (actErr) throw actErr;
      const { error: payErr } = await supabase.from('payments').delete().in('rental_id', ids);
      if (payErr) throw payErr;
      const { error: invErr } = await supabase.from('invoices').delete().in('rental_id', ids);
      if (invErr) throw invErr;
      const { error: docErr } = await supabase.from('rental_documents').delete().in('rental_id', ids);
      if (docErr) throw docErr;

      const { error } = await supabase
        .from('rentals')
        .delete()
        .in('id', ids);

      if (error) throw error;

      const removed = new Set(ids);
      setRentals(prev => prev.filter(rental => !removed.has(rental.id)));
      if (ids.length > 1) {
        toast.success('Éléments supprimés');
      } else {
        toast.success(`${getRentalLabelFromId(ids[0])} supprimée`);
      }
    } catch (err) {
      console.error('Error purging rentals batch:', err);
      toast.error('Erreur lors de la suppression');
      throw err;
    }
  };

  useEffect(() => {
    fetchRentals();
  }, []);

  return {
    rentals,
    loading,
    error,
    addRental,
    updateRental,
    deleteRental,
    deleteRentalsBulk,
    archiveRentalsBulk,
    purgeRentalsBulk,
    getRentalsWithPayments,
    getRentalsPaymentTotals,
    restoreRentalStatus,
    refetch: fetchRentals
  };
};
