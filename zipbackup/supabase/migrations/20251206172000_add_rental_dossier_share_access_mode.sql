do $$
begin
  if to_regclass('public.rental_dossier_shares') is not null then
    alter table public.rental_dossier_shares
      add column if not exists access_mode text not null default 'viewer';
    begin
      alter table public.rental_dossier_shares
        add constraint rental_dossier_shares_access_mode_check
        check (access_mode = any (array['viewer'::text, 'editor'::text]));
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
