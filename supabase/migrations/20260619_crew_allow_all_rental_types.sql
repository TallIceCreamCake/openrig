-- Allow crew assignments on all rental types, not just 'service'
create or replace function public.enforce_rental_crew_assignment_consistency()
returns trigger
language plpgsql
as $$
declare
  v_rental record;
  v_role record;
  v_profile public.personnel_compensation_profiles%rowtype;
begin
  select r.id, r.start_date, r.end_date, r.location
    into v_rental
  from public.rentals r
  where r.id = new.rental_id;

  if v_rental.id is null then
    raise exception 'Rental % not found', new.rental_id;
  end if;

  select rr.name, rr.default_payment_model
    into v_role
  from public.rental_crew_roles rr
  where rr.id = new.crew_role_id;

  v_profile := public.get_personnel_compensation_profile(new.personnel_id, coalesce(new.planned_start_at::date, v_rental.start_date::date, current_date));

  new.assignment_source := coalesce(new.assignment_source, 'manual');
  new.assignment_status := coalesce(new.assignment_status, 'confirmed');
  new.planned_start_at := coalesce(new.planned_start_at, v_rental.start_date);
  new.planned_end_at := coalesce(new.planned_end_at, v_rental.end_date, new.planned_start_at);

  if new.planned_end_at < new.planned_start_at then
    raise exception 'planned_end_at must be >= planned_start_at';
  end if;

  new.location_override := coalesce(new.location_override, v_rental.location);
  new.planned_break_minutes := greatest(least(coalesce(new.planned_break_minutes, 0), 1440), 0);
  new.workload_percent := greatest(least(coalesce(new.workload_percent, 100), 200), 0);

  new.expected_payment_model := coalesce(new.expected_payment_model, v_role.default_payment_model, v_profile.payment_model, 'hourly');
  new.expected_hourly_rate := case
    when new.expected_hourly_rate is not null then greatest(new.expected_hourly_rate, 0)
    when v_profile.hourly_rate is not null then greatest(v_profile.hourly_rate, 0)
    else null
  end;
  new.expected_day_rate := case
    when new.expected_day_rate is not null then greatest(new.expected_day_rate, 0)
    when v_profile.day_rate is not null then greatest(v_profile.day_rate, 0)
    else null
  end;
  new.expected_cachet_rate := case
    when new.expected_cachet_rate is not null then greatest(new.expected_cachet_rate, 0)
    when v_profile.cachet_rate is not null then greatest(v_profile.cachet_rate, 0)
    else null
  end;

  new.expected_hours := greatest(coalesce(new.expected_hours, 0), 0);
  new.expected_days := greatest(coalesce(new.expected_days, 0), 0);
  new.expected_gross_amount := greatest(coalesce(new.expected_gross_amount, 0), 0);
  new.expected_expenses_amount := greatest(coalesce(new.expected_expenses_amount, 0), 0);
  new.expected_total_cost := greatest(coalesce(new.expected_total_cost, 0), 0);
  new.actual_hours := greatest(coalesce(new.actual_hours, 0), 0);
  new.actual_gross_amount := greatest(coalesce(new.actual_gross_amount, 0), 0);
  new.actual_expenses_amount := greatest(coalesce(new.actual_expenses_amount, 0), 0);
  new.actual_total_cost := greatest(coalesce(new.actual_total_cost, 0), 0);

  if coalesce(new.title, '') = '' then
    new.title := coalesce(v_role.name, 'Intervenant prestation');
  end if;

  if new.assignment_status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif tg_op = 'UPDATE' and old.assignment_status = 'cancelled' and new.assignment_status <> 'cancelled' then
    new.cancelled_at := null;
  end if;

  return new;
end;
$$;
