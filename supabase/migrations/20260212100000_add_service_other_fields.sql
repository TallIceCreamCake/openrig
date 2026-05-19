do $$
begin
  if to_regclass('public.service_records') is not null then
    alter table public.service_records
      add column if not exists price numeric null,
      add column if not exists category_id uuid null,
      add column if not exists subcategory_id uuid null;

    alter table public.service_records
      drop constraint if exists service_records_category_check;
    begin
      alter table public.service_records
        add constraint service_records_category_check
        check (category = any (array['personnel'::text, 'insurance'::text, 'other'::text]));
    exception when duplicate_object then
      null;
    end;

    begin
      alter table public.service_records
        add constraint service_records_category_id_fkey
        foreign key (category_id) references public.equipment_categories(id) on delete set null;
    exception when duplicate_object then
      null;
    end;

    begin
      alter table public.service_records
        add constraint service_records_subcategory_id_fkey
        foreign key (subcategory_id) references public.equipment_subcategories(id) on delete set null;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
