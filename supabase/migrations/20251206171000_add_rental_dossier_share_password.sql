do $$
begin
  if to_regclass('public.rental_dossier_shares') is not null then
    alter table public.rental_dossier_shares
      add column if not exists password_hash text null,
      add column if not exists password_salt text null;
    begin
      alter table public.rental_dossier_shares
        add constraint rental_dossier_shares_password_check
        check (
          (password_hash is null and password_salt is null)
          or (password_hash is not null and password_salt is not null)
        );
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
