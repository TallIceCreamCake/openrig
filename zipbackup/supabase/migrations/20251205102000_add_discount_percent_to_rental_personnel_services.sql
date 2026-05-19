do $$
begin
  if to_regclass('public.rental_personnel_services') is not null then
    alter table public.rental_personnel_services
      add column if not exists discount_percent numeric not null default 0;
    begin
      alter table public.rental_personnel_services
        add constraint rental_personnel_services_discount_check
        check (discount_percent >= 0 and discount_percent <= 100);
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
