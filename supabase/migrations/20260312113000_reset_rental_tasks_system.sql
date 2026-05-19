drop table if exists public.rental_task_assignees cascade;
drop table if exists public.rental_task_checklist_items cascade;
drop table if exists public.rental_task_cards cascade;
drop table if exists public.rental_task_lists cascade;
drop table if exists public.rental_tasks cascade;

drop function if exists public.propagate_rental_task_list_semantic_key();
drop function if exists public.validate_rental_task_list_link();
drop function if exists public.ensure_rental_task_default_lists(uuid, uuid, text);
