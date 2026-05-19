create table if not exists public.personnel_directory (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text not null default '',
  role text not null default 'manager',
  status text not null default 'active',
  hire_date date not null default current_date,
  salary numeric(12,2) not null default 0,
  avatar_url text,
  address text not null default '',
  emergency_contact jsonb not null default jsonb_build_object('name', '', 'phone', '', 'relationship', ''),
  skills text[] not null default '{}'::text[],
  certifications text[] not null default '{}'::text[],
  employment_type text not null default 'employee' check (employment_type in ('employee', 'intermittent', 'auto_entrepreneur', 'intern', 'freelance', 'subcontractor')),
  payment_model text not null default 'salary' check (payment_model in ('salary', 'hourly', 'daily', 'cachet', 'mixed')),
  default_hourly_rate numeric(12,2),
  default_day_rate numeric(12,2),
  default_cachet_rate numeric(12,2),
  contract_start_date date,
  contract_end_date date,
  legal_identifier text,
  school_name text,
  payroll_notes text,
  job_title text,
  company text,
  location text,
  bio text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (salary >= 0),
  check (default_hourly_rate is null or default_hourly_rate >= 0),
  check (default_day_rate is null or default_day_rate >= 0),
  check (default_cachet_rate is null or default_cachet_rate >= 0),
  check (contract_end_date is null or contract_start_date is null or contract_end_date >= contract_start_date)
);

create index if not exists idx_personnel_directory_created_at
  on public.personnel_directory (created_at desc);

create index if not exists idx_personnel_directory_name
  on public.personnel_directory (last_name, first_name);

drop trigger if exists trg_personnel_directory_touch_updated_at on public.personnel_directory;
create trigger trg_personnel_directory_touch_updated_at
before update on public.personnel_directory
for each row
execute function public.touch_updated_at_column();

create or replace view public.personnel as
select
  u.id,
  split_part(coalesce(u.full_name, ''), ' ', 1) as first_name,
  trim(both from substr(coalesce(u.full_name, ''), length(split_part(coalesce(u.full_name, ''), ' ', 1)) + 1)) as last_name,
  u.email,
  coalesce(prof.phone, '') as phone,
  coalesce(hr.role, 'manager') as role,
  coalesce(hr.status, 'active') as status,
  coalesce(hr.hire_date, now()::date) as hire_date,
  coalesce(hr.salary, 0::numeric) as salary,
  u.avatar_url,
  coalesce(hr.address, '') as address,
  coalesce(hr.emergency_contact, jsonb_build_object('name', '', 'phone', '', 'relationship', '')) as emergency_contact,
  coalesce(hr.skills, '{}'::text[]) as skills,
  coalesce(hr.certifications, '{}'::text[]) as certifications,
  u.created_at,
  coalesce(hr.employment_type, 'employee') as employment_type,
  coalesce(hr.payment_model, 'salary') as payment_model,
  hr.default_hourly_rate,
  hr.default_day_rate,
  hr.default_cachet_rate,
  hr.contract_start_date,
  hr.contract_end_date,
  hr.legal_identifier,
  hr.school_name,
  hr.payroll_notes,
  prof.job_title,
  prof.company,
  prof.location,
  prof.bio,
  true as has_app_user
from public.app_users u
left join public.app_user_profiles prof on prof.user_id = u.id
left join public.app_user_hr hr on hr.user_id = u.id

union all

select
  d.id,
  d.first_name,
  d.last_name,
  coalesce(d.email, '') as email,
  coalesce(d.phone, '') as phone,
  coalesce(d.role, 'manager') as role,
  coalesce(d.status, 'active') as status,
  coalesce(d.hire_date, current_date) as hire_date,
  coalesce(d.salary, 0::numeric) as salary,
  d.avatar_url,
  coalesce(d.address, '') as address,
  coalesce(d.emergency_contact, jsonb_build_object('name', '', 'phone', '', 'relationship', '')) as emergency_contact,
  coalesce(d.skills, '{}'::text[]) as skills,
  coalesce(d.certifications, '{}'::text[]) as certifications,
  d.created_at,
  coalesce(d.employment_type, 'employee') as employment_type,
  coalesce(d.payment_model, 'salary') as payment_model,
  d.default_hourly_rate,
  d.default_day_rate,
  d.default_cachet_rate,
  d.contract_start_date,
  d.contract_end_date,
  d.legal_identifier,
  d.school_name,
  d.payroll_notes,
  d.job_title,
  d.company,
  d.location,
  d.bio,
  false as has_app_user
from public.personnel_directory d;
