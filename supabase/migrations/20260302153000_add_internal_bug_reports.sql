create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  page_path text not null,
  page_url text not null default '',
  page_title text not null default '',
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text not null default '',
  created_by_email text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_bug_reports_created_at
  on public.bug_reports (created_at desc);

create index if not exists idx_bug_reports_status_created_at
  on public.bug_reports (status, created_at desc);

create index if not exists idx_bug_reports_page_path
  on public.bug_reports (page_path);

drop trigger if exists trg_bug_reports_touch_updated_at on public.bug_reports;
create trigger trg_bug_reports_touch_updated_at
before update on public.bug_reports
for each row
execute function public.touch_updated_at_column();

create table if not exists public.bug_report_attachments (
  id uuid primary key default gen_random_uuid(),
  bug_report_id uuid not null references public.bug_reports(id) on delete cascade,
  storage_path text not null default '',
  file_url text not null,
  file_name text not null default '',
  file_type text,
  file_size integer,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_bug_report_attachments_report
  on public.bug_report_attachments (bug_report_id, created_at);

alter table public.bug_reports enable row level security;
alter table public.bug_report_attachments enable row level security;

drop policy if exists "Anon full access bug_reports" on public.bug_reports;
create policy "Anon full access bug_reports"
  on public.bug_reports
  using (true)
  with check (true);

drop policy if exists "Anon full access bug_report_attachments" on public.bug_report_attachments;
create policy "Anon full access bug_report_attachments"
  on public.bug_report_attachments
  using (true)
  with check (true);

grant all on table public.bug_reports to anon;
grant all on table public.bug_reports to authenticated;
grant all on table public.bug_reports to service_role;

grant all on table public.bug_report_attachments to anon;
grant all on table public.bug_report_attachments to authenticated;
grant all on table public.bug_report_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types, owner)
values (
  'bug-report-images',
  'bug-report-images',
  true,
  5242880,
  '{"image/png","image/jpeg","image/webp","image/gif","image/bmp","image/svg+xml"}'::text[],
  null
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read bug-report-images" on storage.objects;
create policy "Public read bug-report-images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'bug-report-images');

drop policy if exists "Anon insert bug-report-images" on storage.objects;
create policy "Anon insert bug-report-images"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'bug-report-images');

drop policy if exists "Anon update bug-report-images" on storage.objects;
create policy "Anon update bug-report-images"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'bug-report-images')
  with check (bucket_id = 'bug-report-images');

drop policy if exists "Anon delete bug-report-images" on storage.objects;
create policy "Anon delete bug-report-images"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'bug-report-images');
