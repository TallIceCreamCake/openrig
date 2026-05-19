do $$
begin
  if to_regclass('public.rental_dossier_share_access_sessions') is not null then
    alter table public.rental_dossier_share_access_sessions
      add column if not exists method text not null default 'whitelist';
    begin
      alter table public.rental_dossier_share_access_sessions
        add constraint rental_dossier_share_access_sessions_method_check
        check (method = any (array['whitelist'::text, 'password'::text]));
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
