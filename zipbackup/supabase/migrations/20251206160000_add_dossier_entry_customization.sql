alter table rental_dossier_entries
  add column if not exists color text null,
  add column if not exists icon text null;
