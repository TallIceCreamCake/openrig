do $$
begin
  if to_regclass('public.company_settings') is not null then
    alter table public.company_settings
      add column if not exists ical_enabled boolean not null default false,
      add column if not exists ical_token text null;
  end if;
end $$;
