do $$
begin
  if to_regclass('public.rentals') is not null then
    alter table public.rentals
      add column if not exists client_represents_company boolean not null default true;
  end if;
end $$;
