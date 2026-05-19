-- Company-wide accounting mode: auto-entrepreneur (TTC-only workflow)

alter table public.company_settings
  add column if not exists is_auto_entrepreneur boolean not null default false;
