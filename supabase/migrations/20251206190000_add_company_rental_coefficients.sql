do $$
begin
  if to_regclass('public.company_settings') is not null then
    alter table public.company_settings
      add column if not exists rental_coefficient_mode text not null default 'none',
      add column if not exists rental_coefficient_formula text null,
      add column if not exists rental_coefficient_examples jsonb null;
    begin
      alter table public.company_settings
        add constraint company_settings_rental_coefficient_mode_check
        check (rental_coefficient_mode = any (array['none'::text, 'automatic'::text, 'formula'::text]));
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
