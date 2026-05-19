do $$
begin
  if to_regclass('public.rentals') is not null then
    alter table public.rentals
      add column if not exists return_delivery_at timestamptz null,
      add column if not exists return_delivery_confirmation_note text null;
  end if;

  if to_regclass('public.vehicle_assignments') is not null then
    alter table public.vehicle_assignments
      add column if not exists return_delivery_at timestamptz null,
      add column if not exists return_appointment_at timestamptz null;
  end if;
end $$;
