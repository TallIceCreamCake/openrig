alter table public.rental_task_card_items
  add column if not exists base_color text;

update public.rental_task_card_items
set base_color = nullif(btrim(coalesce(base_color, '')), '')
where base_color is not null;
