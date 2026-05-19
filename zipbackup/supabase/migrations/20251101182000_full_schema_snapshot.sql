create extension if not exists btree_gist;



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."activity_status" AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."activity_status" OWNER TO "postgres";


CREATE TYPE "public"."activity_type" AS ENUM (
    'preparation',
    'delivery',
    'pickup',
    'maintenance',
    'service',
    'meeting',
    'training'
);


ALTER TYPE "public"."activity_type" OWNER TO "postgres";


CREATE TYPE "public"."event_type" AS ENUM (
    'task',
    'meeting',
    'reminder',
    'rental',
    'service'
);


ALTER TYPE "public"."event_type" OWNER TO "postgres";


CREATE TYPE "public"."invoice_status" AS ENUM (
    'draft',
    'sent',
    'paid',
    'overdue',
    'cancelled'
);


ALTER TYPE "public"."invoice_status" OWNER TO "postgres";


CREATE TYPE "public"."maintenance_priority" AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


ALTER TYPE "public"."maintenance_priority" OWNER TO "postgres";


CREATE TYPE "public"."maintenance_status" AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."maintenance_status" OWNER TO "postgres";


CREATE TYPE "public"."maintenance_type" AS ENUM (
    'preventive',
    'corrective',
    'inspection'
);


ALTER TYPE "public"."maintenance_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'completed',
    'failed'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."personnel_role" AS ENUM (
    'admin',
    'manager',
    'technician',
    'driver',
    'commercial',
    'accountant'
);


ALTER TYPE "public"."personnel_role" OWNER TO "postgres";


CREATE TYPE "public"."personnel_status" AS ENUM (
    'active',
    'inactive',
    'vacation',
    'sick_leave'
);


ALTER TYPE "public"."personnel_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."allocate_units_for_rental"("p_equipment_id" "uuid", "p_qty" integer, "p_rental_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS "uuid"[]
    LANGUAGE "plpgsql"
    AS $$
declare
  v_units uuid[] := '{}';
  v_unit uuid;
begin
  for v_unit in select unit_id from get_available_units(p_equipment_id, p_start, p_end) limit p_qty loop
    v_units := array_append(v_units, v_unit);
    insert into rental_unit_reservations (rental_id, equipment_unit_id, start_date, end_date)
    values (p_rental_id, v_unit, p_start, p_end);
  end loop;
  if array_length(v_units,1) is distinct from p_qty then
    -- rollback inserts
    delete from rental_unit_reservations where rental_id = p_rental_id and equipment_unit_id = any(v_units);
    raise exception 'Not enough units available for equipment % (needed %, got %)', p_equipment_id, p_qty, coalesce(array_length(v_units,1),0);
  end if;
  return v_units;
end;
$$;


ALTER FUNCTION "public"."allocate_units_for_rental"("p_equipment_id" "uuid", "p_qty" integer, "p_rental_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_rental_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.reference_code is null then
    new.reference_code := public.generate_rental_reference(new.type);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."assign_rental_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_password"("p_user_id" "uuid", "p_old_password" "text", "p_new_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_hash text;
begin
  select hashed_password into v_hash from app_users where id = p_user_id;
  if v_hash is null then
    return false;
  end if;

  if extensions.crypt(p_old_password, v_hash) <> v_hash then
    return false;
  end if;

  if length(coalesce(p_new_password, '')) < 8 then
    raise exception 'Password too short';
  end if;

  update app_users
     set hashed_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         must_change_password = false,
         password_changed_at = now()
   where id = p_user_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."change_password"("p_user_id" "uuid", "p_old_password" "text", "p_new_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_password_reset"("p_email" "text", "p_code" "text", "p_new_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
  v_entry auth_password_reset_codes%rowtype;
  v_user_id uuid;
begin
  v_email := lower(trim(p_email));
  if v_email is null or v_email = '' then
    raise exception 'Email requis';
  end if;

  select *
    into v_entry
    from auth_password_reset_codes
    where email = v_email
    order by requested_at desc
    limit 1;

  if v_entry.id is null then
    return false;
  end if;

  if v_entry.consumed_at is not null or v_entry.expires_at < now() then
    return false;
  end if;

  if extensions.crypt(p_code, v_entry.code_hash) <> v_entry.code_hash then
    return false;
  end if;

  if length(coalesce(p_new_password, '')) < 8 then
    raise exception 'Password too short';
  end if;

  select id
    into v_user_id
    from app_users
    where lower(email) = v_email;

  if v_user_id is null then
    return false;
  end if;

  update app_users
     set hashed_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         must_change_password = false,
         password_changed_at = now()
   where id = v_user_id;

  update auth_password_reset_codes
     set consumed_at = now()
   where id = v_entry.id;

  return true;
end;
$$;


ALTER FUNCTION "public"."confirm_password_reset"("p_email" "text", "p_code" "text", "p_new_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_two_factor_code"("p_challenge_id" "uuid", "p_code" "text") RETURNS TABLE("user_id" "uuid", "email" "text", "full_name" "text", "superadmin" boolean, "must_change_password" boolean, "two_factor_email_enabled" boolean, "two_factor_totp_enabled" boolean, "two_factor_required" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entry auth_two_factor_codes%rowtype;
  v_user record;
begin
  if p_challenge_id is null or p_code is null then
    return;
  end if;

  select *
    into v_entry
    from auth_two_factor_codes
   where id = p_challenge_id;

  if v_entry.id is null then
    return;
  end if;

  if v_entry.consumed_at is not null or v_entry.expires_at < now() then
    return;
  end if;

  if extensions.crypt(p_code, v_entry.code_hash) <> v_entry.code_hash then
    return;
  end if;

  update auth_two_factor_codes
     set consumed_at = now()
   where id = v_entry.id;

  delete from auth_two_factor_codes
   where auth_two_factor_codes.user_id = v_entry.user_id
     and auth_two_factor_codes.id <> v_entry.id;

  select
    u.id as user_id,
    u.email,
    coalesce(u.full_name, '') as full_name,
    coalesce(perms.superadmin, false) as superadmin,
    coalesce(u.must_change_password, false) as must_change_password,
    coalesce(u.two_factor_email_enabled, false) as two_factor_email_enabled,
    coalesce(u.two_factor_totp_enabled, false) as two_factor_totp_enabled,
    false as two_factor_required
  into v_user
  from app_users u
  left join app_permissions perms on perms.user_id = u.id
  where u.id = v_entry.user_id;

  if v_user.user_id is null then
    return;
  end if;

  return query select v_user.user_id, v_user.email, v_user.full_name, v_user.superadmin, v_user.must_change_password, v_user.two_factor_email_enabled, v_user.two_factor_totp_enabled, v_user.two_factor_required;
end;
$$;


ALTER FUNCTION "public"."confirm_two_factor_code"("p_challenge_id" "uuid", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_user"("p_email" "text", "p_full_name" "text", "p_password" "text", "p_role" "text" DEFAULT 'manager'::"text", "p_phone" "text" DEFAULT NULL::"text", "p_job_title" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
begin
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password too short';
  end if;

  insert into app_users(email, full_name, hashed_password, must_change_password, password_changed_at)
  values (
    p_email,
    p_full_name,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    true,
    null
  )
  returning id into v_id;

  insert into app_user_profiles(user_id, phone, job_title)
  values (v_id, p_phone, p_job_title)
  on conflict (user_id) do nothing;

  insert into app_user_hr(user_id, role)
  values (v_id, coalesce(p_role, 'manager'))
  on conflict (user_id) do nothing;

  insert into app_permissions(user_id) values (v_id) on conflict (user_id) do nothing;

  return v_id::uuid;
end;
$$;


ALTER FUNCTION "public"."create_user"("p_email" "text", "p_full_name" "text", "p_password" "text", "p_role" "text", "p_phone" "text", "p_job_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_cascade"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_exists boolean;
begin
  if p_user_id is null then
    raise exception 'User id requis';
  end if;

  select true
    into v_exists
    from app_users
   where id = p_user_id
   limit 1;

  if not found then
    return false;
  end if;

  if to_regclass('public.personnel_activities') is not null then
    delete from personnel_activities where personnel_id = p_user_id;
  end if;

  if to_regclass('public.personnel_schedules') is not null then
    delete from personnel_schedules where personnel_id = p_user_id;
  end if;

  if to_regclass('public.rental_affectation') is not null then
    delete from rental_affectation where personnel_id = p_user_id;
  end if;

  if to_regclass('public.rental_personnel_assignments') is not null then
    delete from rental_personnel_assignments where personnel_id = p_user_id;
  end if;

  if to_regclass('public.maintenance_tasks') is not null then
    update maintenance_tasks set personnel_id = null where personnel_id = p_user_id;
  end if;

  if to_regclass('public.vehicle_assignments') is not null then
    update vehicle_assignments set driver_personnel_id = null where driver_personnel_id = p_user_id;
  end if;

  if to_regclass('public.vehicle_inspections') is not null then
    update vehicle_inspections set inspector_personnel_id = null where inspector_personnel_id = p_user_id;
  end if;

  delete from app_users where id = p_user_id;
  return found;
end;
$$;


ALTER FUNCTION "public"."delete_user_cascade"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_rental_reference"("p_type" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_prefix text := case when p_type = 'service' then 'PR' else 'LOC' end;
  v_seq bigint;
begin
  v_seq := nextval('rental_reference_seq');
  return v_prefix || lpad(v_seq::text, 5, '0');
end;
$$;


ALTER FUNCTION "public"."generate_rental_reference"("p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("equipment_id" "uuid", "available" integer)
    LANGUAGE "sql"
    AS $$
  select id as equipment_id,
         public.get_equipment_availability(id, p_start, p_end) as available
  from equipment
  where id = any(p_ids);
$$;


ALTER FUNCTION "public"."get_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_units"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("unit_id" "uuid")
    LANGUAGE "sql"
    AS $$
  with missing as (
    select coalesce(sum(greatest(ri.expected_quantity - ri.returned_quantity, 0)), 0) as missing_qty
    from rental_return_items ri
    join rental_returns rr on rr.id = ri.return_id
    where ri.equipment_id = p_equipment_id
      and rr.status in ('pending','in_progress','completed')
  ),
  eligible_units as (
    select
      u.id as unit_id,
      row_number() over (order by u.created_at, u.id) as rn
    from equipment_units u
    where u.equipment_id = p_equipment_id
      and u.status = 'available'
      and not exists (
        select 1 from rental_unit_reservations r
        where r.equipment_unit_id = u.id
          and r.start_date <= p_end and r.end_date >= p_start
      )
      and not exists (
        select 1 from equipment_maintenance em
        where em.equipment_id = u.equipment_id
          and em.status = 'open'
          and em.serial_number is not null
          and em.serial_number = u.serial_number
      )
  )
  select unit_id
  from eligible_units eu
  where eu.rn > coalesce((select missing_qty from missing), 0);
$$;


ALTER FUNCTION "public"."get_available_units"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_equipment_availability"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  v_stock int := 0;
  v_rented int := 0;
  v_maint int := 0;
begin
  -- total stock across warehouses
  select coalesce(sum(quantity),0) into v_stock
  from equipment_stock
  where equipment_id = p_equipment_id;

  -- quantity reserved by rentals overlapping the period
  select coalesce(sum(ri.quantity),0) into v_rented
  from rental_items ri
  join rentals r on r.id = ri.rental_id
  where ri.equipment_id = p_equipment_id
    and r.status in ('pending','confirmed','in_progress')
    and r.start_date <= p_end
    and r.end_date >= p_start;

  -- units in maintenance (open entries)
  select coalesce(count(*),0) into v_maint
  from equipment_maintenance em
  where em.equipment_id = p_equipment_id
    and em.status = 'open';

  return greatest(0, v_stock - v_rented - v_maint);
end;
$$;


ALTER FUNCTION "public"."get_equipment_availability"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_login_audit"("p_user_id" "uuid", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "user_id" "uuid", "ip_address" "inet", "user_agent" "text", "success" boolean, "method" "text", "location" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    audit.id,
    audit.user_id,
    audit.ip_address,
    audit.user_agent,
    audit.success,
    audit.method,
    audit.location,
    audit.created_at
  from auth_login_audit audit
  where audit.user_id = p_user_id
  order by audit.created_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0)
$$;


ALTER FUNCTION "public"."get_login_audit"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_return_date"("p_equipment_id" "uuid", "p_start" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "sql"
    AS $$
  select min(r.end_date)
  from rental_items ri
  join rentals r on r.id = ri.rental_id
  where ri.equipment_id = p_equipment_id
    and r.status in ('pending','confirmed','in_progress')
    and r.end_date >= p_start
$$;


ALTER FUNCTION "public"."get_next_return_date"("p_equipment_id" "uuid", "p_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_return_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone) RETURNS TABLE("equipment_id" "uuid", "next_return" timestamp with time zone)
    LANGUAGE "sql"
    AS $$
  select id as equipment_id,
         public.get_next_return_date(id, p_start) as next_return
  from equipment
  where id = any(p_ids)
$$;


ALTER FUNCTION "public"."get_next_return_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_units_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("equipment_id" "uuid", "available" integer)
    LANGUAGE "sql"
    AS $$
  select e.id as equipment_id,
    (
      select count(*) from get_available_units(e.id, p_start, p_end)
    )::int as available
  from equipment e
  where e.id = any(p_ids)
$$;


ALTER FUNCTION "public"."get_units_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_equipment_maintenance_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    if NEW.status = 'open' then
      update equipment set status = 'maintenance' where id = NEW.equipment_id;
    end if;
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if NEW.status = 'open' then
      update equipment set status = 'maintenance' where id = NEW.equipment_id;
    elsif OLD.status = 'open' and NEW.status <> 'open' then
      if not exists (select 1 from equipment_maintenance where equipment_id = NEW.equipment_id and status = 'open') then
        update equipment set status = 'available' where id = NEW.equipment_id and status = 'maintenance';
      end if;
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    if OLD.status = 'open' then
      if not exists (select 1 from equipment_maintenance where equipment_id = OLD.equipment_id and status = 'open') then
        update equipment set status = 'available' where id = OLD.equipment_id and status = 'maintenance';
      end if;
    end if;
    return OLD;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."handle_equipment_maintenance_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."login_user"("p_email" "text", "p_password" "text") RETURNS TABLE("user_id" "uuid", "email" "text", "full_name" "text", "superadmin" boolean, "must_change_password" boolean, "two_factor_email_enabled" boolean, "two_factor_totp_enabled" boolean, "two_factor_required" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with target as (
    select
      u.id,
      u.email,
      coalesce(u.full_name, '') as full_name,
      coalesce(perms.superadmin, false) as superadmin,
      coalesce(u.must_change_password, false) as must_change_password,
      coalesce(u.two_factor_email_enabled, false) as two_factor_email_enabled,
      coalesce(u.two_factor_totp_enabled, false) as two_factor_totp_enabled,
      u.hashed_password
    from app_users u
    left join app_permissions perms on perms.user_id = u.id
    where lower(u.email) = lower(p_email)
  ),
  validated as (
    select
      t.id,
      t.email,
      t.full_name,
      t.superadmin,
      t.must_change_password,
      t.two_factor_email_enabled,
      t.two_factor_totp_enabled
    from target t
    where extensions.crypt(p_password, t.hashed_password) = t.hashed_password
  ),
  log_attempt as (
    insert into auth_login_audit(user_id, success, method)
    select
      coalesce(v.id, t.id),
      v.id is not null,
      'password'
    from target t
    left join validated v on v.id = t.id
    limit 1
    returning 1
  )
  select
    v.id,
    v.email,
    v.full_name,
    v.superadmin,
    v.must_change_password,
    v.two_factor_email_enabled,
    v.two_factor_totp_enabled,
    v.two_factor_email_enabled or v.two_factor_totp_enabled
  from validated v
$$;


ALTER FUNCTION "public"."login_user"("p_email" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personnel_chat_get_messages"("p_user_id" "uuid", "p_thread_id" "uuid", "p_limit" integer DEFAULT 200, "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("id" "uuid", "thread_id" "uuid", "author_id" "uuid", "message" "text", "created_at" timestamp with time zone, "reply_to" "jsonb", "reply_to_message_id" "uuid", "attachments" "jsonb", "receipts" "jsonb", "reactions" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM personnel_chat_participants
    WHERE thread_id = p_thread_id
      AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Utilisateur non participant du fil %', p_thread_id USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT ordered.id,
         ordered.thread_id,
         ordered.author_id,
         ordered.message,
         ordered.created_at,
         ordered.reply_to,
         ordered.reply_to_message_id,
         ordered.attachments,
         ordered.receipts,
         public.personnel_chat_reactions_json(ordered.id)
  FROM (
    SELECT
      m.id,
      m.thread_id,
      m.author_id,
      m.message,
      m.created_at,
      m.reply_to_message_id,
      (
        SELECT jsonb_build_object(
          'id', ref.id,
          'thread_id', ref.thread_id,
          'author_id', ref.author_id,
          'message', ref.message,
          'created_at', ref.created_at
        )
        FROM personnel_chat_messages ref
        WHERE ref.id = m.reply_to_message_id
      ) AS reply_to,
      coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', attachment.id,
              'storage_path', attachment.storage_path,
              'file_name', attachment.file_name,
              'file_type', attachment.file_type,
              'file_size', attachment.file_size,
              'public_url', attachment.public_url
            )
            ORDER BY attachment.created_at
          )
          FROM personnel_chat_message_attachments attachment
          WHERE attachment.message_id = m.id
        ),
        '[]'::jsonb
      ) AS attachments,
      coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'user_id', receipt.user_id,
              'delivered_at', receipt.delivered_at,
              'read_at', receipt.read_at
            )
            ORDER BY receipt.user_id
          )
          FROM personnel_chat_message_receipts receipt
          WHERE receipt.message_id = m.id
        ),
        '[]'::jsonb
      ) AS receipts
    FROM personnel_chat_messages m
    WHERE m.thread_id = p_thread_id
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
    LIMIT coalesce(p_limit, 200)
  ) AS ordered
  ORDER BY ordered.created_at ASC;
END;
$$;


ALTER FUNCTION "public"."personnel_chat_get_messages"("p_user_id" "uuid", "p_thread_id" "uuid", "p_limit" integer, "p_before" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personnel_chat_get_threads"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "topic" "text", "is_group" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "last_message_at" timestamp with time zone, "participants" "jsonb", "last_message" "jsonb", "unread_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    threads.id,
    threads.topic,
    threads.is_group,
    threads.created_at,
    threads.updated_at,
    threads.last_message_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'thread_id', participants.thread_id,
          'user_id', participants.user_id,
          'added_at', participants.added_at,
          'last_read_at', participants.last_read_at,
          'user', CASE
            WHEN u.id IS NULL THEN NULL
            ELSE jsonb_build_object('id', u.id, 'full_name', u.full_name, 'avatar_url', u.avatar_url)
          END
        )
        ORDER BY participants.added_at
      ) FILTER (WHERE participants.user_id IS NOT NULL),
      '[]'::jsonb
    ) AS participants,
    (
      SELECT jsonb_strip_nulls(to_jsonb(msg)) || jsonb_build_object(
        'reactions', public.personnel_chat_reactions_json(msg.id)
      )
      FROM (
        SELECT
          m.id,
          m.thread_id,
          m.author_id,
          m.message,
          m.created_at,
          m.reply_to_message_id,
          (
            SELECT jsonb_build_object(
              'id', ref.id,
              'thread_id', ref.thread_id,
              'author_id', ref.author_id,
              'message', ref.message,
              'created_at', ref.created_at
            )
            FROM personnel_chat_messages ref
            WHERE ref.id = m.reply_to_message_id
          ) AS reply_to,
          coalesce(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', attachment.id,
                  'storage_path', attachment.storage_path,
                  'file_name', attachment.file_name,
                  'file_type', attachment.file_type,
                  'file_size', attachment.file_size,
                  'public_url', attachment.public_url
                )
                ORDER BY attachment.created_at
              )
              FROM personnel_chat_message_attachments attachment
              WHERE attachment.message_id = m.id
            ),
            '[]'::jsonb
          ) AS attachments,
          coalesce(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'user_id', receipt.user_id,
                  'delivered_at', receipt.delivered_at,
                  'read_at', receipt.read_at
                )
                ORDER BY receipt.user_id
              )
              FROM personnel_chat_message_receipts receipt
              WHERE receipt.message_id = m.id
            ),
            '[]'::jsonb
          ) AS receipts
        FROM personnel_chat_messages m
        WHERE m.thread_id = threads.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) msg
    ) AS last_message,
    coalesce(
      (
        SELECT count(*)::integer
        FROM personnel_chat_messages m
        WHERE m.thread_id = threads.id
          AND m.created_at > coalesce(
            (
              SELECT pr.last_read_at
              FROM personnel_chat_participants pr
              WHERE pr.thread_id = threads.id
                AND pr.user_id = p_user_id
            ),
            '-infinity'::timestamptz
          )
      ),
      0
    ) AS unread_count
  FROM personnel_chat_threads threads
  JOIN personnel_chat_participants self
    ON self.thread_id = threads.id AND self.user_id = p_user_id
  LEFT JOIN personnel_chat_participants participants
    ON participants.thread_id = threads.id
  LEFT JOIN app_users u ON u.id = participants.user_id
  GROUP BY threads.id
  ORDER BY coalesce(threads.last_message_at, threads.updated_at, threads.created_at) DESC;
END;
$$;


ALTER FUNCTION "public"."personnel_chat_get_threads"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personnel_chat_mark_delivered"("p_user_id" "uuid", "p_message_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  UPDATE personnel_chat_message_receipts
  SET delivered_at = greatest(coalesce(delivered_at, '-infinity'::timestamptz), v_now)
  WHERE user_id = p_user_id
    AND message_id = ANY(p_message_ids);
END;
$$;


ALTER FUNCTION "public"."personnel_chat_mark_delivered"("p_user_id" "uuid", "p_message_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personnel_chat_mark_read"("p_thread_id" "uuid", "p_user_id" "uuid", "p_read_at" timestamp with time zone DEFAULT "now"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_effective timestamptz := coalesce(p_read_at, now());
BEGIN
  UPDATE personnel_chat_participants
  SET last_read_at = greatest(coalesce(last_read_at, '-infinity'::timestamptz), v_effective)
  WHERE thread_id = p_thread_id AND user_id = p_user_id;

  UPDATE personnel_chat_message_receipts
  SET delivered_at = greatest(coalesce(delivered_at, '-infinity'::timestamptz), v_effective),
      read_at = greatest(coalesce(read_at, '-infinity'::timestamptz), v_effective)
  WHERE user_id = p_user_id
    AND message_id IN (
      SELECT id
      FROM personnel_chat_messages
      WHERE thread_id = p_thread_id
        AND created_at <= v_effective
    );
END;
$$;


ALTER FUNCTION "public"."personnel_chat_mark_read"("p_thread_id" "uuid", "p_user_id" "uuid", "p_read_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personnel_chat_reactions_json"("p_message_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_relation_exists boolean := to_regclass('public.personnel_chat_message_reactions') IS NOT NULL;
BEGIN
  IF NOT v_relation_exists THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'emoji', agg.emoji,
          'count', agg.ct,
          'user_ids', agg.user_ids
        )
      )
      FROM (
        SELECT r.emoji,
               count(*) AS ct,
               array_agg(r.user_id ORDER BY r.user_id) AS user_ids
        FROM personnel_chat_message_reactions r
        WHERE r.message_id = p_message_id
        GROUP BY r.emoji
        ORDER BY r.emoji
      ) agg
    ),
    '[]'::jsonb
  );
END;
$$;


ALTER FUNCTION "public"."personnel_chat_reactions_json"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personnel_chat_send_message"("p_thread_id" "uuid", "p_author" "uuid", "p_message" "text", "p_reply_to" "uuid" DEFAULT NULL::"uuid", "p_attachments" "jsonb" DEFAULT '[]'::"jsonb") RETURNS TABLE("id" "uuid", "thread_id" "uuid", "author_id" "uuid", "message" "text", "created_at" timestamp with time zone, "reply_to" "jsonb", "reply_to_message_id" "uuid", "attachments" "jsonb", "receipts" "jsonb", "reactions" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_message personnel_chat_messages%rowtype;
  v_reply_thread uuid;
  v_thread_topic text;
  v_thread_is_group boolean;
  v_author_name text;
  v_author_avatar text;
  v_preview text;
  v_has_attachments boolean;
BEGIN
  IF trim(coalesce(p_message, '')) = '' THEN
    IF p_attachments IS NULL OR jsonb_array_length(p_attachments) = 0 THEN
      RAISE EXCEPTION 'Message vide' USING errcode = '22023';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM personnel_chat_participants
    WHERE thread_id = p_thread_id
      AND user_id = p_author
  ) THEN
    RAISE EXCEPTION 'Utilisateur non autorisé à écrire sur ce fil' USING errcode = '42501';
  END IF;

  IF p_reply_to IS NOT NULL THEN
    SELECT thread_id
    INTO v_reply_thread
    FROM personnel_chat_messages
    WHERE id = p_reply_to;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Message de référence introuvable' USING errcode = 'P0002';
    END IF;

    IF v_reply_thread <> p_thread_id THEN
      RAISE EXCEPTION 'Impossible de répondre à un message d''un autre fil' USING errcode = '22023';
    END IF;
  END IF;

  INSERT INTO personnel_chat_messages(thread_id, author_id, message, reply_to_message_id)
  VALUES (p_thread_id, p_author, trim(p_message), p_reply_to)
  RETURNING * INTO v_message;

  IF p_attachments IS NULL THEN
    p_attachments := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_attachments) <> 'array' THEN
    RAISE EXCEPTION 'Attachments payload invalide' USING errcode = '22023';
  END IF;

  IF jsonb_array_length(p_attachments) > 0 THEN
    INSERT INTO personnel_chat_message_attachments(message_id, storage_path, file_name, file_type, file_size, public_url)
    SELECT
      v_message.id,
      attachment->>'storage_path',
      attachment->>'file_name',
      attachment->>'file_type',
      NULLIF(attachment->>'file_size', '')::bigint,
      attachment->>'public_url'
    FROM jsonb_array_elements(p_attachments) AS attachment;
  END IF;

  INSERT INTO personnel_chat_message_receipts (message_id, user_id, delivered_at, read_at)
  SELECT
    v_message.id,
    participant.user_id,
    CASE
      WHEN participant.user_id = p_author THEN v_message.created_at
      ELSE NULL
    END,
    CASE
      WHEN participant.user_id = p_author THEN v_message.created_at
      ELSE NULL
    END
  FROM personnel_chat_participants participant
  WHERE participant.thread_id = p_thread_id
  ON CONFLICT (message_id, user_id) DO UPDATE
  SET delivered_at = EXCLUDED.delivered_at,
      read_at = EXCLUDED.read_at;

  UPDATE personnel_chat_participants
  SET last_read_at = greatest(coalesce(last_read_at, '-infinity'::timestamptz), v_message.created_at)
  WHERE thread_id = p_thread_id AND user_id = p_author;

  SELECT t.topic, t.is_group
  INTO v_thread_topic, v_thread_is_group
  FROM personnel_chat_threads t
  WHERE t.id = p_thread_id;

  SELECT coalesce(u.full_name, ''), u.avatar_url
  INTO v_author_name, v_author_avatar
  FROM app_users u
  WHERE u.id = v_message.author_id;

  v_preview := trim(coalesce(v_message.message, ''));
  IF v_preview = '' THEN
    SELECT EXISTS (
      SELECT 1
      FROM personnel_chat_message_attachments att
      WHERE att.message_id = v_message.id
    ) INTO v_has_attachments;
    IF v_has_attachments THEN
      v_preview := 'Pièce jointe envoyée';
    ELSE
      v_preview := 'Nouveau message';
    END IF;
  ELSE
    IF length(v_preview) > 140 THEN
      v_preview := substring(v_preview FROM 1 FOR 137) || '…';
    END IF;
  END IF;

  INSERT INTO notifications(type, title, message, action_url, action_label, avatar, metadata, recipient_id)
  SELECT
    'info',
    CASE
      WHEN coalesce(v_thread_is_group, false) THEN
        'Nouveau message · ' || coalesce(nullif(v_thread_topic, ''), 'Discussion')
      ELSE
        'Message de ' || coalesce(nullif(v_author_name, ''), 'Un collaborateur')
    END,
    CASE
      WHEN coalesce(v_thread_is_group, false) THEN
        coalesce(nullif(v_author_name, ''), 'Un collaborateur') || ': ' || v_preview
      ELSE
        v_preview
    END,
    '/chat?thread=' || p_thread_id::text,
    'Ouvrir le chat',
    v_author_avatar,
    jsonb_build_object(
      'threadId', p_thread_id,
      'authorId', p_author,
      'messageId', v_message.id,
      'createdAt', v_message.created_at
    ),
    participant.user_id
  FROM personnel_chat_participants participant
  WHERE participant.thread_id = p_thread_id
    AND participant.user_id <> p_author;

  RETURN QUERY
  SELECT v_message.id,
         v_message.thread_id,
         v_message.author_id,
         v_message.message,
         v_message.created_at,
         (
           SELECT jsonb_build_object(
             'id', ref.id,
             'thread_id', ref.thread_id,
             'author_id', ref.author_id,
             'message', ref.message,
             'created_at', ref.created_at
           )
           FROM personnel_chat_messages ref
           WHERE ref.id = v_message.reply_to_message_id
         ),
         v_message.reply_to_message_id,
         coalesce(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'id', attachment.id,
                 'storage_path', attachment.storage_path,
                 'file_name', attachment.file_name,
                 'file_type', attachment.file_type,
                 'file_size', attachment.file_size,
                 'public_url', attachment.public_url
               )
               ORDER BY attachment.created_at
             )
             FROM personnel_chat_message_attachments attachment
             WHERE attachment.message_id = v_message.id
           ),
           '[]'::jsonb
         ),
         coalesce(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'user_id', receipt.user_id,
                 'delivered_at', receipt.delivered_at,
                 'read_at', receipt.read_at
               )
               ORDER BY receipt.user_id
             )
             FROM personnel_chat_message_receipts receipt
             WHERE receipt.message_id = v_message.id
           ),
           '[]'::jsonb
         ),
         public.personnel_chat_reactions_json(v_message.id);
END;
$$;


ALTER FUNCTION "public"."personnel_chat_send_message"("p_thread_id" "uuid", "p_author" "uuid", "p_message" "text", "p_reply_to" "uuid", "p_attachments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personnel_chat_start_direct_thread"("p_requester" "uuid", "p_partner" "uuid") RETURNS TABLE("id" "uuid", "topic" "text", "is_group" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "last_message_at" timestamp with time zone, "participants" "jsonb", "last_message" "jsonb", "unread_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_thread_id uuid;
  v_now timestamptz := now();
begin
  if p_requester = p_partner then
    raise exception 'Impossible de démarrer une conversation avec soi-même' using errcode = '22023';
  end if;

  select threads.id
  into v_thread_id
  from personnel_chat_threads threads
  join personnel_chat_participants participants on participants.thread_id = threads.id
  where threads.is_group = false
  group by threads.id
  having count(distinct participants.user_id) = 2
     and bool_or(participants.user_id = p_requester)
     and bool_or(participants.user_id = p_partner)
  limit 1;

  if v_thread_id is null then
    insert into personnel_chat_threads(is_group, created_at, updated_at)
    values (false, v_now, v_now)
    returning id into v_thread_id;

    insert into personnel_chat_participants(thread_id, user_id, added_at, last_read_at)
    values
      (v_thread_id, p_requester, v_now, v_now),
      (v_thread_id, p_partner, v_now, null)
    on conflict do nothing;
  end if;

  return query
  select *
  from personnel_chat_get_threads(p_requester) as threads
  where threads.id = v_thread_id;
end;
$$;


ALTER FUNCTION "public"."personnel_chat_start_direct_thread"("p_requester" "uuid", "p_partner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personnel_chat_threads_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."personnel_chat_threads_set_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personnel_chat_touch_thread"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  update personnel_chat_threads
  set last_message_at = coalesce(new.created_at, now()),
      updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."personnel_chat_touch_thread"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_password_reset"("p_email" "text") RETURNS TABLE("code" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
  v_code text;
  v_expires_at timestamptz;
begin
  v_email := lower(trim(p_email));
  if v_email is null or v_email = '' then
    raise exception 'Email requis';
  end if;

  delete from auth_password_reset_codes
   where email = v_email
     and consumed_at is null
     and auth_password_reset_codes.expires_at < now();

  delete from auth_password_reset_codes
   where email = v_email
     and consumed_at is null;

  if not exists (select 1 from app_users where lower(email) = v_email) then
  return query select null::text as code, now() as expires_at;
  end if;

  v_code := lpad((trunc(random() * 1000000)::int)::text, 6, '0');
  v_expires_at := now() + interval '15 minutes';

  insert into auth_password_reset_codes(email, code_hash, expires_at)
  values (v_email, extensions.crypt(v_code, extensions.gen_salt('bf')), v_expires_at);

  return query select v_code as code, v_expires_at as expires_at;
end;
$$;


ALTER FUNCTION "public"."request_password_reset"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_two_factor_code"("p_user_id" "uuid") RETURNS TABLE("challenge_id" "uuid", "code" "text", "expires_at" timestamp with time zone, "email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user record;
  v_code text;
  v_expires_at timestamptz;
  v_id uuid;
begin
  if p_user_id is null then
    return;
  end if;

  select u.id, u.email, u.two_factor_email_enabled
    into v_user
    from app_users as u
   where u.id = p_user_id;

  if v_user.id is null then
    return;
  end if;

  if not coalesce(v_user.two_factor_email_enabled, false) then
    return;
  end if;

  delete from auth_two_factor_codes
   where user_id = p_user_id
     and (auth_two_factor_codes.expires_at < now() or auth_two_factor_codes.consumed_at is not null);

  delete from auth_two_factor_codes
   where user_id = p_user_id
     and auth_two_factor_codes.consumed_at is null;

  v_code := lpad((trunc(random() * 1000000)::int)::text, 6, '0');
  v_expires_at := now() + interval '10 minutes';

  insert into auth_two_factor_codes(user_id, code_hash, expires_at)
  values (p_user_id, extensions.crypt(v_code, extensions.gen_salt('bf')), v_expires_at)
  returning id into v_id;

  return query
  select
    v_id as challenge_id,
    v_code as code,
    v_expires_at as expires_at,
    v_user.email as email;
end;
$$;


ALTER FUNCTION "public"."request_two_factor_code"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_two_factor_email"("p_user_id" "uuid", "p_enabled" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_updated boolean := false;
begin
  update app_users
     set two_factor_email_enabled = coalesce(p_enabled, false),
         two_factor_enabled_at = case
           when coalesce(p_enabled, false) then coalesce(two_factor_enabled_at, now())
           else null
         end
   where id = p_user_id
  returning true into v_updated;

  if v_updated and not coalesce(p_enabled, false) then
    delete from auth_two_factor_codes
     where user_id = p_user_id;
  end if;

  return coalesce(v_updated, false);
end;
$$;


ALTER FUNCTION "public"."set_two_factor_email"("p_user_id" "uuid", "p_enabled" boolean) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_permissions" (
    "user_id" "uuid" NOT NULL,
    "can_create_service" boolean DEFAULT false,
    "can_edit_equipment" boolean DEFAULT false,
    "can_manage_warehouses" boolean DEFAULT false,
    "can_manage_personnel" boolean DEFAULT false,
    "can_manage_clients" boolean DEFAULT false,
    "can_view_accounting" boolean DEFAULT false,
    "can_manage_maintenance" boolean DEFAULT false,
    "can_manage_notifications" boolean DEFAULT false,
    "can_edit_settings" boolean DEFAULT false,
    "superadmin" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "eq_view_menu" boolean DEFAULT false,
    "eq_view_list" boolean DEFAULT false,
    "eq_view_detail" boolean DEFAULT false,
    "eq_create" boolean DEFAULT false,
    "eq_edit" boolean DEFAULT false,
    "eq_delete" boolean DEFAULT false,
    "eq_manage_pricing" boolean DEFAULT false,
    "eq_manage_stock" boolean DEFAULT false,
    "eq_manage_serials" boolean DEFAULT false,
    "eq_upload_media" boolean DEFAULT false,
    "eq_export" boolean DEFAULT false,
    "eq_import" boolean DEFAULT false,
    "eq_bulk_actions" boolean DEFAULT false,
    "eq_archive" boolean DEFAULT false,
    "eq_manage_categories" boolean DEFAULT false,
    "eq_view_costs" boolean DEFAULT false,
    "eq_view_margins" boolean DEFAULT false,
    "eq_view_history" boolean DEFAULT false,
    "eq_view_audit" boolean DEFAULT false,
    "eq_assign_warehouse" boolean DEFAULT false,
    "eq_transfer_stock" boolean DEFAULT false,
    "eq_print_labels" boolean DEFAULT false,
    "eq_view_documents" boolean DEFAULT false,
    "eq_manage_documents" boolean DEFAULT false,
    "eq_view_maintenance" boolean DEFAULT false,
    "eq_schedule_maintenance" boolean DEFAULT false,
    "eq_calibrate" boolean DEFAULT false,
    "eq_deprecate" boolean DEFAULT false,
    "eq_restore_item" boolean DEFAULT false,
    "eq_tag" boolean DEFAULT false,
    "eq_manage_tags" boolean DEFAULT false,
    "eq_comment" boolean DEFAULT false,
    "eq_manage_comments" boolean DEFAULT false,
    "eq_share" boolean DEFAULT false,
    "eq_publish_catalog" boolean DEFAULT false,
    "eq_view_reports" boolean DEFAULT false,
    "eq_generate_barcodes" boolean DEFAULT false,
    "eq_scan_barcodes" boolean DEFAULT false,
    "eq_change_status" boolean DEFAULT false,
    "eq_link_accessories" boolean DEFAULT false,
    "rn_view_menu" boolean DEFAULT false,
    "rn_view_list" boolean DEFAULT false,
    "rn_view_detail" boolean DEFAULT false,
    "rn_create" boolean DEFAULT false,
    "rn_edit" boolean DEFAULT false,
    "rn_delete" boolean DEFAULT false,
    "rn_change_status" boolean DEFAULT false,
    "rn_manage_items" boolean DEFAULT false,
    "rn_generate_documents" boolean DEFAULT false,
    "rn_send_documents" boolean DEFAULT false,
    "rn_accept_service" boolean DEFAULT false,
    "rn_refuse_service" boolean DEFAULT false,
    "rn_export" boolean DEFAULT false,
    "rn_import" boolean DEFAULT false,
    "rn_view_reports" boolean DEFAULT false,
    "rn_view_calendar" boolean DEFAULT false,
    "rn_schedule" boolean DEFAULT false,
    "rn_invoice" boolean DEFAULT false,
    "rn_discount" boolean DEFAULT false,
    "rn_view_costs" boolean DEFAULT false,
    "rn_view_margins" boolean DEFAULT false,
    "cl_view_menu" boolean DEFAULT false,
    "cl_view_list" boolean DEFAULT false,
    "cl_view_detail" boolean DEFAULT false,
    "cl_create" boolean DEFAULT false,
    "cl_edit" boolean DEFAULT false,
    "cl_delete" boolean DEFAULT false,
    "cl_manage_contacts" boolean DEFAULT false,
    "cl_view_invoices" boolean DEFAULT false,
    "cl_export" boolean DEFAULT false,
    "cl_import" boolean DEFAULT false,
    "cl_view_reports" boolean DEFAULT false,
    "wh_view_menu" boolean DEFAULT false,
    "wh_view_list" boolean DEFAULT false,
    "wh_view_detail" boolean DEFAULT false,
    "wh_create" boolean DEFAULT false,
    "wh_edit" boolean DEFAULT false,
    "wh_delete" boolean DEFAULT false,
    "wh_manage_stock" boolean DEFAULT false,
    "wh_transfer" boolean DEFAULT false,
    "wh_print_labels" boolean DEFAULT false,
    "wh_view_reports" boolean DEFAULT false,
    "wh_export" boolean DEFAULT false,
    "wh_import" boolean DEFAULT false,
    "wh_audit" boolean DEFAULT false,
    "pe_view_menu" boolean DEFAULT false,
    "pe_view_list" boolean DEFAULT false,
    "pe_view_detail" boolean DEFAULT false,
    "pe_create_user" boolean DEFAULT false,
    "pe_edit_user" boolean DEFAULT false,
    "pe_delete_user" boolean DEFAULT false,
    "pe_manage_roles" boolean DEFAULT false,
    "pe_manage_permissions" boolean DEFAULT false,
    "pe_view_activities" boolean DEFAULT false,
    "pe_schedule" boolean DEFAULT false,
    "pe_view_reports" boolean DEFAULT false,
    "pe_export" boolean DEFAULT false,
    "pe_import" boolean DEFAULT false,
    "ac_view_menu" boolean DEFAULT false,
    "ac_view_dashboard" boolean DEFAULT false,
    "ac_view_invoices" boolean DEFAULT false,
    "ac_view_payments" boolean DEFAULT false,
    "ac_view_reports" boolean DEFAULT false,
    "ac_create_invoice" boolean DEFAULT false,
    "ac_edit_invoice" boolean DEFAULT false,
    "ac_delete_invoice" boolean DEFAULT false,
    "ac_send_invoice" boolean DEFAULT false,
    "ac_mark_paid" boolean DEFAULT false,
    "ac_refund" boolean DEFAULT false,
    "ac_manage_taxes" boolean DEFAULT false,
    "ac_manage_accounts" boolean DEFAULT false,
    "ac_export" boolean DEFAULT false,
    "ac_import" boolean DEFAULT false,
    "mt_view_menu" boolean DEFAULT false,
    "mt_view_list" boolean DEFAULT false,
    "mt_view_detail" boolean DEFAULT false,
    "mt_view_calendar" boolean DEFAULT false,
    "mt_view_reports" boolean DEFAULT false,
    "mt_create_task" boolean DEFAULT false,
    "mt_edit_task" boolean DEFAULT false,
    "mt_delete_task" boolean DEFAULT false,
    "mt_schedule" boolean DEFAULT false,
    "mt_assign" boolean DEFAULT false,
    "mt_complete" boolean DEFAULT false,
    "mt_cancel" boolean DEFAULT false,
    "mt_manage_procedures" boolean DEFAULT false,
    "mt_export" boolean DEFAULT false,
    "mt_import" boolean DEFAULT false,
    "cs_view_company" boolean DEFAULT false,
    "cs_edit_company" boolean DEFAULT false
);


ALTER TABLE "public"."app_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_user_appearance" (
    "user_id" "uuid" NOT NULL,
    "accent" "text" DEFAULT '#2563eb'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_user_appearance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_user_hr" (
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'manager'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "hire_date" "date" DEFAULT "now"() NOT NULL,
    "salary" numeric DEFAULT 0 NOT NULL,
    "address" "text",
    "emergency_contact" "jsonb" DEFAULT "jsonb_build_object"('name', '', 'phone', '', 'relationship', ''),
    "skills" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "certifications" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_user_hr" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_user_preferences" (
    "user_id" "uuid" NOT NULL,
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_user_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_user_profiles" (
    "user_id" "uuid" NOT NULL,
    "phone" "text",
    "job_title" "text",
    "company" "text",
    "location" "text",
    "bio" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "hashed_password" "text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "must_change_password" boolean DEFAULT false NOT NULL,
    "password_changed_at" timestamp with time zone,
    "two_factor_email_enabled" boolean DEFAULT false NOT NULL,
    "two_factor_enabled_at" timestamp with time zone,
    "two_factor_totp_enabled" boolean DEFAULT false NOT NULL,
    "two_factor_totp_enabled_at" timestamp with time zone,
    "two_factor_totp_secret" "text"
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_login_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "success" boolean DEFAULT true NOT NULL,
    "method" "text" DEFAULT 'password'::"text" NOT NULL,
    "location" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."auth_login_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_password_reset_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    CONSTRAINT "auth_password_reset_codes_email_lower" CHECK (("email" = "lower"("email")))
);


ALTER TABLE "public"."auth_password_reset_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_two_factor_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone
);


ALTER TABLE "public"."auth_two_factor_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "type" "public"."event_type" NOT NULL,
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "color" "text",
    "rental_id" "uuid",
    "service_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "company" "text",
    "image_url" "text"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "id" smallint DEFAULT 1 NOT NULL,
    "name" "text",
    "legal_name" "text",
    "siren" "text",
    "vat" "text",
    "email" "text",
    "phone" "text",
    "address" "text",
    "about" "text",
    "logo_url" "text",
    "accent_color" "text",
    "secondary_color" "text",
    "plan" "text" DEFAULT 'pro'::"text",
    "billing_email" "text",
    "billing_address" "text",
    "send_invoices" boolean DEFAULT true,
    "integ_slack" boolean DEFAULT false,
    "integ_notion" boolean DEFAULT false,
    "integ_zapier" boolean DEFAULT false,
    "integ_quickbooks" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "templates" "jsonb",
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "document_design" "jsonb",
    CONSTRAINT "company_settings_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'pro'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."company_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_snippets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_snippets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "subtype" "text",
    "rental_price_ht" numeric DEFAULT 0 NOT NULL,
    "rental_price_ttc" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "serial_number" "text",
    "purchase_date" "date",
    "purchase_price" numeric DEFAULT 0,
    "inventory_category" "text" DEFAULT 'series'::"text" NOT NULL,
    "category_id" "uuid",
    "subcategory_id" "uuid",
    "qr_code_value" "text",
    "qr_code_url" "text",
    "qr_code_generated_at" timestamp with time zone,
    CONSTRAINT "equipment_inventory_category_check" CHECK (("inventory_category" = ANY (ARRAY['series'::"text", 'vrac'::"text", 'consommable'::"text"])))
);


ALTER TABLE "public"."equipment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."equipment_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_maintenance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid",
    "warehouse_id" "uuid",
    "serial_number" "text",
    "maintenance_type" "text" DEFAULT 'SAV'::"text",
    "status" "text" DEFAULT 'open'::"text",
    "task_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "equipment_maintenance_maintenance_type_check" CHECK (("maintenance_type" = ANY (ARRAY['SAV'::"text", 'Réparation dépôt'::"text"]))),
    CONSTRAINT "equipment_maintenance_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."equipment_maintenance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_stock" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid",
    "warehouse_id" "uuid",
    "quantity" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipment_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_subcategories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."equipment_subcategories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid",
    "warehouse_id" "uuid",
    "serial_number" "text",
    "status" "text" DEFAULT 'available'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipment_units_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'in_use'::"text", 'maintenance'::"text", 'broken'::"text"])))
);


ALTER TABLE "public"."equipment_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "client_id" "uuid",
    "rental_id" "uuid",
    "amount_ht" numeric DEFAULT 0 NOT NULL,
    "amount_ttc" numeric DEFAULT 0 NOT NULL,
    "vat_amount" numeric DEFAULT 0 NOT NULL,
    "status" "public"."invoice_status" DEFAULT 'draft'::"public"."invoice_status",
    "due_date" "date",
    "paid_date" "date",
    "payment_method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "origin" "text" DEFAULT 'rental'::"text" NOT NULL,
    CONSTRAINT "invoices_origin_check" CHECK (("origin" = ANY (ARRAY['rental'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "maintenance_id" "uuid",
    "doc_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "maintenance_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['rapport'::"text", 'facture'::"text", 'upload'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."maintenance_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid",
    "personnel_id" "uuid",
    "type" "public"."maintenance_type" NOT NULL,
    "priority" "public"."maintenance_priority" DEFAULT 'medium'::"public"."maintenance_priority",
    "title" "text" NOT NULL,
    "description" "text",
    "scheduled_date" "date" NOT NULL,
    "completed_date" "date",
    "status" "public"."maintenance_status" DEFAULT 'pending'::"public"."maintenance_status",
    "cost" numeric DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."maintenance_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "action_url" "text",
    "action_label" "text",
    "avatar" "text",
    "metadata" "jsonb",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipient_id" "uuid"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid",
    "amount" numeric NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_date" "date" NOT NULL,
    "reference" "text",
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rental_id" "uuid",
    "payment_type" "text" DEFAULT 'payment'::"text",
    CONSTRAINT "payments_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['deposit'::"text", 'payment'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."personnel" AS
 SELECT "u"."id",
    "split_part"(COALESCE("u"."full_name", ''::"text"), ' '::"text", 1) AS "first_name",
    TRIM(BOTH FROM "substr"(COALESCE("u"."full_name", ''::"text"), ("length"("split_part"(COALESCE("u"."full_name", ''::"text"), ' '::"text", 1)) + 1))) AS "last_name",
    "u"."email",
    COALESCE("prof"."phone", ''::"text") AS "phone",
    COALESCE("hr"."role", 'manager'::"text") AS "role",
    COALESCE("hr"."status", 'active'::"text") AS "status",
    COALESCE("hr"."hire_date", ("now"())::"date") AS "hire_date",
    COALESCE("hr"."salary", (0)::numeric) AS "salary",
    "u"."avatar_url",
    COALESCE("hr"."address", ''::"text") AS "address",
    COALESCE("hr"."emergency_contact", "jsonb_build_object"('name', '', 'phone', '', 'relationship', '')) AS "emergency_contact",
    COALESCE("hr"."skills", '{}'::"text"[]) AS "skills",
    COALESCE("hr"."certifications", '{}'::"text"[]) AS "certifications",
    "u"."created_at"
   FROM (("public"."app_users" "u"
     LEFT JOIN "public"."app_user_profiles" "prof" ON (("prof"."user_id" = "u"."id")))
     LEFT JOIN "public"."app_user_hr" "hr" ON (("hr"."user_id" = "u"."id")));


ALTER VIEW "public"."personnel" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "personnel_id" "uuid",
    "type" "public"."activity_type" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "rental_id" "uuid",
    "client_name" "text",
    "location" "text",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "duration_minutes" integer,
    "status" "public"."activity_status" DEFAULT 'pending'::"public"."activity_status",
    "notes" "text",
    "equipment_involved" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."personnel_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_chat_message_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid",
    "storage_path" "text" NOT NULL,
    "file_name" "text",
    "file_type" "text",
    "file_size" bigint,
    "public_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."personnel_chat_message_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_chat_message_reactions" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."personnel_chat_message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_chat_message_receipts" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."personnel_chat_message_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid",
    "author_id" "uuid",
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reply_to_message_id" "uuid"
);


ALTER TABLE "public"."personnel_chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_chat_participants" (
    "thread_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_read_at" timestamp with time zone
);


ALTER TABLE "public"."personnel_chat_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_chat_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic" "text",
    "is_group" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone
);


ALTER TABLE "public"."personnel_chat_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personnel_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "personnel_id" "uuid",
    "date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "break_duration" integer DEFAULT 60,
    "is_working_day" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."personnel_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_affectation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rental_id" "uuid" NOT NULL,
    "personnel_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rental_affectation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rental_id" "uuid",
    "doc_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['devis'::"text", 'facture'::"text", 'bon_prepa'::"text"])))
);


ALTER TABLE "public"."rental_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_item_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rental_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_group_id" "uuid"
);


ALTER TABLE "public"."rental_item_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rental_id" "uuid",
    "equipment_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "price_per_day" numeric DEFAULT 0,
    "group_id" "uuid",
    "position" integer DEFAULT 0 NOT NULL,
    "is_external" boolean DEFAULT false,
    "external_name" "text",
    "external_description" "text",
    "external_type" "text",
    "external_subtype" "text",
    "external_supplier" "text"
);


ALTER TABLE "public"."rental_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_maintenance_charges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rental_id" "uuid",
    "maintenance_id" "uuid",
    "label" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rental_maintenance_charges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_preparation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rental_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "started_by" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_preparation_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."rental_preparation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_preparation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "preparation_id" "uuid" NOT NULL,
    "equipment_id" "uuid",
    "equipment_name" "text",
    "equipment_type" "text",
    "quantity" integer DEFAULT 0 NOT NULL,
    "prepared_quantity" integer DEFAULT 0 NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_external" boolean DEFAULT false,
    "external_supplier" "text"
);


ALTER TABLE "public"."rental_preparation_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."rental_reference_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rental_reference_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_return_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "return_id" "uuid" NOT NULL,
    "equipment_id" "uuid",
    "equipment_name" "text",
    "equipment_type" "text",
    "expected_quantity" integer DEFAULT 0 NOT NULL,
    "returned_quantity" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_return_items_expected_quantity_check" CHECK (("expected_quantity" >= 0)),
    CONSTRAINT "rental_return_items_returned_quantity_check" CHECK (("returned_quantity" >= 0))
);


ALTER TABLE "public"."rental_return_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_returns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rental_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "started_by" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rental_returns_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."rental_returns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rental_unit_reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rental_id" "uuid",
    "equipment_unit_id" "uuid",
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rental_unit_reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rentals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "type" "text" NOT NULL,
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "location" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_price" numeric DEFAULT 0 NOT NULL,
    "discount_type" "text",
    "discount_value" numeric DEFAULT 0,
    "generate_invoice" boolean DEFAULT false,
    "color" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "delivery_address" "text",
    "pickup_address" "text",
    "reference_code" "text",
    "returned_at" timestamp with time zone,
    "title" "text",
    CONSTRAINT "rentals_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"]))),
    CONSTRAINT "rentals_type_check" CHECK (("type" = ANY (ARRAY['rental'::"text", 'service'::"text"])))
);


ALTER TABLE "public"."rentals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "rental_id" "uuid" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "driver_personnel_id" "uuid",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivery_at" timestamp with time zone,
    "appointment_at" timestamp with time zone,
    CONSTRAINT "vehicle_assignments_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."vehicle_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_delivery_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "rental_id" "uuid",
    "event" "text" NOT NULL,
    "event_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_delivery_history_event_check" CHECK (("event" = ANY (ARRAY['scheduled'::"text", 'delivery'::"text", 'appointment'::"text", 'returned'::"text", 'cancelled'::"text", 'note'::"text"])))
);


ALTER TABLE "public"."vehicle_delivery_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "doc_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "expires_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_documents_doc_type_check" CHECK (("doc_type" = ANY (ARRAY['registration'::"text", 'insurance'::"text", 'inspection'::"text", 'maintenance_report'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."vehicle_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_fuel_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "fill_date" "date" NOT NULL,
    "liters" numeric NOT NULL,
    "cost" numeric,
    "odometer_km" numeric,
    "station" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicle_fuel_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "inspection_date" "date" NOT NULL,
    "inspector_personnel_id" "uuid",
    "mileage_km" numeric,
    "checklist" "jsonb" DEFAULT '{}'::"jsonb",
    "notes" "text",
    "status" "text" DEFAULT 'passed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_inspections_status_check" CHECK (("status" = ANY (ARRAY['passed'::"text", 'attention'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."vehicle_inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_maintenance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "scheduled_date" "date",
    "completed_date" "date",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "cost" numeric,
    "mileage_km_at_service" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_maintenance_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "vehicle_maintenance_type_check" CHECK (("type" = ANY (ARRAY['service'::"text", 'repair'::"text", 'inspection'::"text"])))
);


ALTER TABLE "public"."vehicle_maintenance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "license_plate" "text" NOT NULL,
    "make" "text",
    "model" "text",
    "model_year" integer,
    "color" "text",
    "capacity_weight_kg" numeric,
    "capacity_volume_m3" numeric,
    "odometer_km" numeric DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "acquisition_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'maintenance'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."warehouses" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_permissions"
    ADD CONSTRAINT "app_permissions_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_user_appearance"
    ADD CONSTRAINT "app_user_appearance_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_user_hr"
    ADD CONSTRAINT "app_user_hr_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_user_preferences"
    ADD CONSTRAINT "app_user_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_user_profiles"
    ADD CONSTRAINT "app_user_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_login_audit"
    ADD CONSTRAINT "auth_login_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_password_reset_codes"
    ADD CONSTRAINT "auth_password_reset_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_two_factor_codes"
    ADD CONSTRAINT "auth_two_factor_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_snippets"
    ADD CONSTRAINT "company_snippets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_maintenance"
    ADD CONSTRAINT "equipment_maintenance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_stock"
    ADD CONSTRAINT "equipment_stock_equipment_id_warehouse_id_key" UNIQUE ("equipment_id", "warehouse_id");



ALTER TABLE ONLY "public"."equipment_stock"
    ADD CONSTRAINT "equipment_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_subcategories"
    ADD CONSTRAINT "equipment_subcategories_category_id_name_key" UNIQUE ("category_id", "name");



ALTER TABLE ONLY "public"."equipment_subcategories"
    ADD CONSTRAINT "equipment_subcategories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_units"
    ADD CONSTRAINT "equipment_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_documents"
    ADD CONSTRAINT "maintenance_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_tasks"
    ADD CONSTRAINT "maintenance_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."payments"
    ADD CONSTRAINT "payments_invoice_or_rental_chk" CHECK ((("invoice_id" IS NOT NULL) OR ("rental_id" IS NOT NULL))) NOT VALID;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_activities"
    ADD CONSTRAINT "personnel_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_chat_message_attachments"
    ADD CONSTRAINT "personnel_chat_message_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_chat_message_reactions"
    ADD CONSTRAINT "personnel_chat_message_reactions_pkey" PRIMARY KEY ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."personnel_chat_message_receipts"
    ADD CONSTRAINT "personnel_chat_message_receipts_pkey" PRIMARY KEY ("message_id", "user_id");



ALTER TABLE ONLY "public"."personnel_chat_messages"
    ADD CONSTRAINT "personnel_chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_chat_participants"
    ADD CONSTRAINT "personnel_chat_participants_pkey" PRIMARY KEY ("thread_id", "user_id");



ALTER TABLE ONLY "public"."personnel_chat_threads"
    ADD CONSTRAINT "personnel_chat_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personnel_schedules"
    ADD CONSTRAINT "personnel_schedules_personnel_id_date_key" UNIQUE ("personnel_id", "date");



ALTER TABLE ONLY "public"."personnel_schedules"
    ADD CONSTRAINT "personnel_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_affectation"
    ADD CONSTRAINT "rental_affectation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_affectation"
    ADD CONSTRAINT "rental_affectation_rental_id_personnel_id_key" UNIQUE ("rental_id", "personnel_id");



ALTER TABLE ONLY "public"."rental_documents"
    ADD CONSTRAINT "rental_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_item_groups"
    ADD CONSTRAINT "rental_item_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_items"
    ADD CONSTRAINT "rental_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_maintenance_charges"
    ADD CONSTRAINT "rental_maintenance_charges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_preparation_items"
    ADD CONSTRAINT "rental_preparation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_preparation"
    ADD CONSTRAINT "rental_preparation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_preparation"
    ADD CONSTRAINT "rental_preparation_rental_id_key" UNIQUE ("rental_id");



ALTER TABLE ONLY "public"."rental_return_items"
    ADD CONSTRAINT "rental_return_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_returns"
    ADD CONSTRAINT "rental_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rental_returns"
    ADD CONSTRAINT "rental_returns_rental_id_key" UNIQUE ("rental_id");



ALTER TABLE ONLY "public"."rental_unit_reservations"
    ADD CONSTRAINT "rental_unit_no_overlap" EXCLUDE USING "gist" ("equipment_unit_id" WITH =, "tstzrange"("start_date", "end_date", '[]'::"text") WITH &&);



ALTER TABLE ONLY "public"."rental_unit_reservations"
    ADD CONSTRAINT "rental_unit_reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rentals"
    ADD CONSTRAINT "rentals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_no_overlap" EXCLUDE USING "gist" ("vehicle_id" WITH =, "tstzrange"("start_at", "end_at", '[]'::"text") WITH &&);



ALTER TABLE ONLY "public"."vehicle_assignments"
    ADD CONSTRAINT "vehicle_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_delivery_history"
    ADD CONSTRAINT "vehicle_delivery_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_fuel_logs"
    ADD CONSTRAINT "vehicle_fuel_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_inspections"
    ADD CONSTRAINT "vehicle_inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_maintenance"
    ADD CONSTRAINT "vehicle_maintenance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_license_plate_key" UNIQUE ("license_plate");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_app_users_email" ON "public"."app_users" USING "btree" ("lower"("email"));



CREATE INDEX "idx_auth_login_audit_created" ON "public"."auth_login_audit" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_auth_login_audit_user" ON "public"."auth_login_audit" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_auth_password_reset_email" ON "public"."auth_password_reset_codes" USING "btree" ("email");



CREATE INDEX "idx_auth_password_reset_requested" ON "public"."auth_password_reset_codes" USING "btree" ("requested_at" DESC);



CREATE INDEX "idx_auth_two_factor_requested" ON "public"."auth_two_factor_codes" USING "btree" ("requested_at" DESC);



CREATE INDEX "idx_auth_two_factor_user" ON "public"."auth_two_factor_codes" USING "btree" ("user_id");



CREATE INDEX "idx_calendar_events_date" ON "public"."calendar_events" USING "btree" ("start_date");



CREATE INDEX "idx_equipment_categories_sort" ON "public"."equipment_categories" USING "btree" ("sort_order", "name");



CREATE INDEX "idx_equipment_category_id" ON "public"."equipment" USING "btree" ("category_id");



CREATE INDEX "idx_equipment_maintenance_equipment_id" ON "public"."equipment_maintenance" USING "btree" ("equipment_id");



CREATE INDEX "idx_equipment_maintenance_status" ON "public"."equipment_maintenance" USING "btree" ("status");



CREATE INDEX "idx_equipment_maintenance_task_id" ON "public"."equipment_maintenance" USING "btree" ("task_id");



CREATE INDEX "idx_equipment_subcategories_category" ON "public"."equipment_subcategories" USING "btree" ("category_id", "sort_order", "name");



CREATE INDEX "idx_equipment_subcategory_id" ON "public"."equipment" USING "btree" ("subcategory_id");



CREATE INDEX "idx_equipment_units_equipment_id" ON "public"."equipment_units" USING "btree" ("equipment_id");



CREATE INDEX "idx_equipment_units_status" ON "public"."equipment_units" USING "btree" ("status");



CREATE INDEX "idx_invoices_client_id" ON "public"."invoices" USING "btree" ("client_id");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_maintenance_documents_maintenance_id" ON "public"."maintenance_documents" USING "btree" ("maintenance_id");



CREATE INDEX "idx_maintenance_documents_type" ON "public"."maintenance_documents" USING "btree" ("doc_type");



CREATE INDEX "idx_maintenance_equipment_id" ON "public"."maintenance_tasks" USING "btree" ("equipment_id");



CREATE INDEX "idx_maintenance_status" ON "public"."maintenance_tasks" USING "btree" ("status");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_recipient_created" ON "public"."notifications" USING "btree" ("recipient_id", "created_at" DESC);



CREATE INDEX "idx_payments_invoice_id" ON "public"."payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_payments_invoice_rental" ON "public"."payments" USING "btree" ("invoice_id", "rental_id");



CREATE INDEX "idx_payments_rental_id" ON "public"."payments" USING "btree" ("rental_id");



CREATE INDEX "idx_payments_type" ON "public"."payments" USING "btree" ("payment_type");



CREATE INDEX "idx_personnel_activities_personnel_id" ON "public"."personnel_activities" USING "btree" ("personnel_id");



CREATE INDEX "idx_personnel_activities_rental_id" ON "public"."personnel_activities" USING "btree" ("rental_id");



CREATE INDEX "idx_personnel_chat_attachments_message_id" ON "public"."personnel_chat_message_attachments" USING "btree" ("message_id");



CREATE INDEX "idx_personnel_chat_message_receipts_message" ON "public"."personnel_chat_message_receipts" USING "btree" ("message_id");



CREATE INDEX "idx_personnel_chat_message_receipts_user" ON "public"."personnel_chat_message_receipts" USING "btree" ("user_id");



CREATE INDEX "idx_personnel_chat_messages_reply_to" ON "public"."personnel_chat_messages" USING "btree" ("reply_to_message_id");



CREATE INDEX "idx_personnel_chat_messages_thread_created" ON "public"."personnel_chat_messages" USING "btree" ("thread_id", "created_at");



CREATE INDEX "idx_personnel_chat_participants_user" ON "public"."personnel_chat_participants" USING "btree" ("user_id", "thread_id");



CREATE INDEX "idx_personnel_chat_reactions_message" ON "public"."personnel_chat_message_reactions" USING "btree" ("message_id");



CREATE INDEX "idx_personnel_chat_threads_last_message" ON "public"."personnel_chat_threads" USING "btree" ("last_message_at" DESC NULLS LAST);



CREATE INDEX "idx_personnel_schedules_personnel_date" ON "public"."personnel_schedules" USING "btree" ("personnel_id", "date");



CREATE INDEX "idx_ra_personnel" ON "public"."rental_affectation" USING "btree" ("personnel_id");



CREATE INDEX "idx_ra_rental" ON "public"."rental_affectation" USING "btree" ("rental_id");



CREATE UNIQUE INDEX "idx_rentals_reference_code" ON "public"."rentals" USING "btree" ("reference_code") WHERE ("reference_code" IS NOT NULL);



CREATE INDEX "idx_ri_group" ON "public"."rental_items" USING "btree" ("group_id");



CREATE INDEX "idx_ri_position" ON "public"."rental_items" USING "btree" ("position");



CREATE INDEX "idx_rig_parent" ON "public"."rental_item_groups" USING "btree" ("parent_group_id");



CREATE INDEX "idx_rig_rental" ON "public"."rental_item_groups" USING "btree" ("rental_id");



CREATE INDEX "idx_rmc_maintenance" ON "public"."rental_maintenance_charges" USING "btree" ("maintenance_id");



CREATE INDEX "idx_rmc_rental" ON "public"."rental_maintenance_charges" USING "btree" ("rental_id");



CREATE INDEX "idx_rprep_rental" ON "public"."rental_preparation" USING "btree" ("rental_id");



CREATE INDEX "idx_rprepi_prep" ON "public"."rental_preparation_items" USING "btree" ("preparation_id");



CREATE INDEX "idx_rreturn_items_return" ON "public"."rental_return_items" USING "btree" ("return_id");



CREATE INDEX "idx_rreturn_rental" ON "public"."rental_returns" USING "btree" ("rental_id");



CREATE INDEX "idx_rur_rental" ON "public"."rental_unit_reservations" USING "btree" ("rental_id");



CREATE INDEX "idx_rur_unit" ON "public"."rental_unit_reservations" USING "btree" ("equipment_unit_id");



CREATE INDEX "idx_vdh_event_time" ON "public"."vehicle_delivery_history" USING "btree" ("event_time");



CREATE INDEX "idx_vdh_rental" ON "public"."vehicle_delivery_history" USING "btree" ("rental_id");



CREATE INDEX "idx_vdh_vehicle" ON "public"."vehicle_delivery_history" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_assign_rental" ON "public"."vehicle_assignments" USING "btree" ("rental_id");



CREATE INDEX "idx_vehicle_assign_vehicle" ON "public"."vehicle_assignments" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_documents_type" ON "public"."vehicle_documents" USING "btree" ("doc_type");



CREATE INDEX "idx_vehicle_documents_vehicle" ON "public"."vehicle_documents" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_fuel_logs_vehicle" ON "public"."vehicle_fuel_logs" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_inspections_vehicle" ON "public"."vehicle_inspections" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicle_maint_status" ON "public"."vehicle_maintenance" USING "btree" ("status");



CREATE INDEX "idx_vehicle_maint_vehicle" ON "public"."vehicle_maintenance" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicles_make_model" ON "public"."vehicles" USING "btree" ("make", "model");



CREATE INDEX "idx_vehicles_status" ON "public"."vehicles" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "company_settings_set_timestamp" BEFORE UPDATE ON "public"."company_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_timestamp"();



CREATE OR REPLACE TRIGGER "personnel_chat_threads_set_timestamp" BEFORE UPDATE ON "public"."personnel_chat_threads" FOR EACH ROW EXECUTE FUNCTION "public"."personnel_chat_threads_set_timestamp"();



CREATE OR REPLACE TRIGGER "personnel_chat_touch_thread" AFTER INSERT ON "public"."personnel_chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."personnel_chat_touch_thread"();



CREATE OR REPLACE TRIGGER "trg_equipment_maintenance_status" AFTER INSERT OR DELETE OR UPDATE ON "public"."equipment_maintenance" FOR EACH ROW EXECUTE FUNCTION "public"."handle_equipment_maintenance_status"();



CREATE OR REPLACE TRIGGER "trg_rentals_reference" BEFORE INSERT ON "public"."rentals" FOR EACH ROW EXECUTE FUNCTION "public"."assign_rental_reference"();



ALTER TABLE ONLY "public"."app_permissions"
    ADD CONSTRAINT "app_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_user_appearance"
    ADD CONSTRAINT "app_user_appearance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_user_hr"
    ADD CONSTRAINT "app_user_hr_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_user_preferences"
    ADD CONSTRAINT "app_user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_user_profiles"
    ADD CONSTRAINT "app_user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auth_login_audit"
    ADD CONSTRAINT "auth_login_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auth_two_factor_codes"
    ADD CONSTRAINT "auth_two_factor_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_maintenance"
    ADD CONSTRAINT "equipment_maintenance_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_maintenance"
    ADD CONSTRAINT "equipment_maintenance_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."maintenance_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_maintenance"
    ADD CONSTRAINT "equipment_maintenance_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_stock"
    ADD CONSTRAINT "equipment_stock_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_stock"
    ADD CONSTRAINT "equipment_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_subcategories"
    ADD CONSTRAINT "equipment_subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."equipment_subcategories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_units"
    ADD CONSTRAINT "equipment_units_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_units"
    ADD CONSTRAINT "equipment_units_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_documents"
    ADD CONSTRAINT "maintenance_documents_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "public"."maintenance_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."maintenance_tasks"
    ADD CONSTRAINT "maintenance_tasks_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personnel_activities"
    ADD CONSTRAINT "personnel_activities_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personnel_chat_message_attachments"
    ADD CONSTRAINT "personnel_chat_message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."personnel_chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_chat_message_reactions"
    ADD CONSTRAINT "personnel_chat_message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."personnel_chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_chat_message_reactions"
    ADD CONSTRAINT "personnel_chat_message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_chat_message_receipts"
    ADD CONSTRAINT "personnel_chat_message_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."personnel_chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_chat_message_receipts"
    ADD CONSTRAINT "personnel_chat_message_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_chat_messages"
    ADD CONSTRAINT "personnel_chat_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personnel_chat_messages"
    ADD CONSTRAINT "personnel_chat_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."personnel_chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personnel_chat_messages"
    ADD CONSTRAINT "personnel_chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."personnel_chat_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_chat_participants"
    ADD CONSTRAINT "personnel_chat_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."personnel_chat_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personnel_chat_participants"
    ADD CONSTRAINT "personnel_chat_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_documents"
    ADD CONSTRAINT "rental_documents_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_item_groups"
    ADD CONSTRAINT "rental_item_groups_parent_group_id_fkey" FOREIGN KEY ("parent_group_id") REFERENCES "public"."rental_item_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_item_groups"
    ADD CONSTRAINT "rental_item_groups_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_items"
    ADD CONSTRAINT "rental_items_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_items"
    ADD CONSTRAINT "rental_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."rental_item_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_items"
    ADD CONSTRAINT "rental_items_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_maintenance_charges"
    ADD CONSTRAINT "rental_maintenance_charges_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "public"."maintenance_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_maintenance_charges"
    ADD CONSTRAINT "rental_maintenance_charges_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_return_items"
    ADD CONSTRAINT "rental_return_items_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rental_return_items"
    ADD CONSTRAINT "rental_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "public"."rental_returns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_returns"
    ADD CONSTRAINT "rental_returns_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_unit_reservations"
    ADD CONSTRAINT "rental_unit_reservations_equipment_unit_id_fkey" FOREIGN KEY ("equipment_unit_id") REFERENCES "public"."equipment_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rental_unit_reservations"
    ADD CONSTRAINT "rental_unit_reservations_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rentals"
    ADD CONSTRAINT "rentals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



CREATE POLICY "Allow anon to delete calendar_events" ON "public"."calendar_events" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete clients" ON "public"."clients" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete equipment" ON "public"."equipment" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete equipment_stock" ON "public"."equipment_stock" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete invoices" ON "public"."invoices" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete maintenance_tasks" ON "public"."maintenance_tasks" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete payments" ON "public"."payments" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete personnel_activities" ON "public"."personnel_activities" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete personnel_schedules" ON "public"."personnel_schedules" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete rental_items" ON "public"."rental_items" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete rentals" ON "public"."rentals" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to delete warehouses" ON "public"."warehouses" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow anon to insert calendar_events" ON "public"."calendar_events" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert clients" ON "public"."clients" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert equipment" ON "public"."equipment" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert equipment_stock" ON "public"."equipment_stock" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert invoices" ON "public"."invoices" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert maintenance_tasks" ON "public"."maintenance_tasks" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert payments" ON "public"."payments" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert personnel_activities" ON "public"."personnel_activities" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert personnel_schedules" ON "public"."personnel_schedules" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert rental_items" ON "public"."rental_items" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert rentals" ON "public"."rentals" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to insert warehouses" ON "public"."warehouses" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon to select calendar_events" ON "public"."calendar_events" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select clients" ON "public"."clients" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select equipment" ON "public"."equipment" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select equipment_stock" ON "public"."equipment_stock" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select invoices" ON "public"."invoices" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select maintenance_tasks" ON "public"."maintenance_tasks" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select payments" ON "public"."payments" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select personnel_activities" ON "public"."personnel_activities" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select personnel_schedules" ON "public"."personnel_schedules" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select rental_items" ON "public"."rental_items" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select rentals" ON "public"."rentals" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to select warehouses" ON "public"."warehouses" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon to update calendar_events" ON "public"."calendar_events" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update clients" ON "public"."clients" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update equipment" ON "public"."equipment" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update equipment_stock" ON "public"."equipment_stock" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update invoices" ON "public"."invoices" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update maintenance_tasks" ON "public"."maintenance_tasks" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update payments" ON "public"."payments" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update personnel_activities" ON "public"."personnel_activities" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update personnel_schedules" ON "public"."personnel_schedules" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update rental_items" ON "public"."rental_items" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update rentals" ON "public"."rentals" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon to update warehouses" ON "public"."warehouses" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access app_permissions" ON "public"."app_permissions" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access app_user_appearance" ON "public"."app_user_appearance" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access app_user_hr" ON "public"."app_user_hr" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access app_user_preferences" ON "public"."app_user_preferences" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access app_user_profiles" ON "public"."app_user_profiles" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access app_users" ON "public"."app_users" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access company_snippets" ON "public"."company_snippets" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access equipment_categories" ON "public"."equipment_categories" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access equipment_maintenance" ON "public"."equipment_maintenance" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access equipment_subcategories" ON "public"."equipment_subcategories" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access equipment_units" ON "public"."equipment_units" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access maintenance_documents" ON "public"."maintenance_documents" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access notifications" ON "public"."notifications" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access rental_affectation" ON "public"."rental_affectation" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access rental_documents" ON "public"."rental_documents" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access rental_item_groups" ON "public"."rental_item_groups" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access rental_maintenance_charges" ON "public"."rental_maintenance_charges" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access rental_preparation" ON "public"."rental_preparation" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access rental_preparation_items" ON "public"."rental_preparation_items" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access rental_return_items" ON "public"."rental_return_items" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access rental_returns" ON "public"."rental_returns" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access rental_unit_reservations" ON "public"."rental_unit_reservations" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access vehicle_assignments" ON "public"."vehicle_assignments" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access vehicle_delivery_history" ON "public"."vehicle_delivery_history" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access vehicle_documents" ON "public"."vehicle_documents" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access vehicle_fuel_logs" ON "public"."vehicle_fuel_logs" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access vehicle_inspections" ON "public"."vehicle_inspections" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access vehicle_maintenance" ON "public"."vehicle_maintenance" USING (true) WITH CHECK (true);



CREATE POLICY "Anon full access vehicles" ON "public"."vehicles" USING (true) WITH CHECK (true);



CREATE POLICY "Anon insert company_settings" ON "public"."company_settings" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anon select company_settings" ON "public"."company_settings" FOR SELECT USING (true);



CREATE POLICY "Anon update company_settings" ON "public"."company_settings" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Chat messages delete" ON "public"."personnel_chat_messages" FOR DELETE USING (true);



CREATE POLICY "Chat messages insert" ON "public"."personnel_chat_messages" FOR INSERT WITH CHECK (true);



CREATE POLICY "Chat messages select" ON "public"."personnel_chat_messages" FOR SELECT USING (true);



CREATE POLICY "Chat participants delete" ON "public"."personnel_chat_participants" FOR DELETE USING (true);



CREATE POLICY "Chat participants insert" ON "public"."personnel_chat_participants" FOR INSERT WITH CHECK (true);



CREATE POLICY "Chat participants select" ON "public"."personnel_chat_participants" FOR SELECT USING (true);



CREATE POLICY "Chat reactions delete" ON "public"."personnel_chat_message_reactions" FOR DELETE USING (true);



CREATE POLICY "Chat reactions insert" ON "public"."personnel_chat_message_reactions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Chat reactions select" ON "public"."personnel_chat_message_reactions" FOR SELECT USING (true);



CREATE POLICY "Chat threads insert" ON "public"."personnel_chat_threads" FOR INSERT WITH CHECK (true);



CREATE POLICY "Chat threads select" ON "public"."personnel_chat_threads" FOR SELECT USING (true);



CREATE POLICY "Chat threads update" ON "public"."personnel_chat_threads" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Personnel chat receipts insert" ON "public"."personnel_chat_message_receipts" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."personnel_chat_messages" "m"
     JOIN "public"."personnel_chat_participants" "p" ON (("p"."thread_id" = "m"."thread_id")))
  WHERE (("m"."id" = "personnel_chat_message_receipts"."message_id") AND ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Personnel chat receipts select" ON "public"."personnel_chat_message_receipts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."personnel_chat_messages" "m"
     JOIN "public"."personnel_chat_participants" "p" ON (("p"."thread_id" = "m"."thread_id")))
  WHERE (("m"."id" = "personnel_chat_message_receipts"."message_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Personnel chat receipts update" ON "public"."personnel_chat_message_receipts" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Staff can delete clients" ON "public"."clients" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Staff can delete equipment" ON "public"."equipment" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Staff can delete rental items" ON "public"."rental_items" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Staff can delete rentals" ON "public"."rentals" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Staff can delete stock" ON "public"."equipment_stock" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Staff can delete warehouses" ON "public"."warehouses" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Staff can insert activities" ON "public"."personnel_activities" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert clients" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert equipment" ON "public"."equipment" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert events" ON "public"."calendar_events" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert invoices" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert maintenance" ON "public"."maintenance_tasks" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert payments" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert rental items" ON "public"."rental_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert rentals" ON "public"."rentals" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert schedules" ON "public"."personnel_schedules" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert stock" ON "public"."equipment_stock" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can insert warehouses" ON "public"."warehouses" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Staff can manage activities" ON "public"."personnel_activities" TO "authenticated" USING (true);



CREATE POLICY "Staff can manage events" ON "public"."calendar_events" TO "authenticated" USING (true);



CREATE POLICY "Staff can manage invoices" ON "public"."invoices" TO "authenticated" USING (true);



CREATE POLICY "Staff can manage maintenance" ON "public"."maintenance_tasks" TO "authenticated" USING (true);



CREATE POLICY "Staff can manage payments" ON "public"."payments" TO "authenticated" USING (true);



CREATE POLICY "Staff can manage schedules" ON "public"."personnel_schedules" TO "authenticated" USING (true);



CREATE POLICY "Staff can update clients" ON "public"."clients" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Staff can update equipment" ON "public"."equipment" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Staff can update rental items" ON "public"."rental_items" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Staff can update rentals" ON "public"."rentals" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Staff can update stock" ON "public"."equipment_stock" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Staff can update warehouses" ON "public"."warehouses" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Staff can view all clients" ON "public"."clients" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Staff can view all equipment" ON "public"."equipment" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Staff can view all rental items" ON "public"."rental_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Staff can view all rentals" ON "public"."rentals" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Staff can view all stock" ON "public"."equipment_stock" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Staff can view all warehouses" ON "public"."warehouses" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view their own data" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."app_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_user_appearance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_user_hr" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_snippets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_maintenance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_stock" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_subcategories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_chat_message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_chat_message_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_chat_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_chat_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personnel_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_affectation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_item_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_maintenance_charges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_preparation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_preparation_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_return_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_returns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rental_unit_reservations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rentals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_delivery_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_fuel_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_maintenance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."allocate_units_for_rental"("p_equipment_id" "uuid", "p_qty" integer, "p_rental_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."allocate_units_for_rental"("p_equipment_id" "uuid", "p_qty" integer, "p_rental_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."allocate_units_for_rental"("p_equipment_id" "uuid", "p_qty" integer, "p_rental_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_rental_reference"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_rental_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_rental_reference"() TO "service_role";



GRANT ALL ON FUNCTION "public"."change_password"("p_user_id" "uuid", "p_old_password" "text", "p_new_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."change_password"("p_user_id" "uuid", "p_old_password" "text", "p_new_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_password"("p_user_id" "uuid", "p_old_password" "text", "p_new_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_password_reset"("p_email" "text", "p_code" "text", "p_new_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_password_reset"("p_email" "text", "p_code" "text", "p_new_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_password_reset"("p_email" "text", "p_code" "text", "p_new_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_two_factor_code"("p_challenge_id" "uuid", "p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_two_factor_code"("p_challenge_id" "uuid", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_two_factor_code"("p_challenge_id" "uuid", "p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user"("p_email" "text", "p_full_name" "text", "p_password" "text", "p_role" "text", "p_phone" "text", "p_job_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_user"("p_email" "text", "p_full_name" "text", "p_password" "text", "p_role" "text", "p_phone" "text", "p_job_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user"("p_email" "text", "p_full_name" "text", "p_password" "text", "p_role" "text", "p_phone" "text", "p_job_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_cascade"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user_cascade"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_cascade"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_rental_reference"("p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_rental_reference"("p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_rental_reference"("p_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_units"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_units"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_units"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_equipment_availability"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_equipment_availability"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_equipment_availability"("p_equipment_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_login_audit"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_login_audit"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_login_audit"("p_user_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_return_date"("p_equipment_id" "uuid", "p_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_return_date"("p_equipment_id" "uuid", "p_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_return_date"("p_equipment_id" "uuid", "p_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_return_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_return_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_return_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_units_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_units_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_units_availability_for_equipment"("p_ids" "uuid"[], "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_equipment_maintenance_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_equipment_maintenance_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_equipment_maintenance_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."login_user"("p_email" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."login_user"("p_email" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."login_user"("p_email" "text", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."personnel_chat_get_messages"("p_user_id" "uuid", "p_thread_id" "uuid", "p_limit" integer, "p_before" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."personnel_chat_get_messages"("p_user_id" "uuid", "p_thread_id" "uuid", "p_limit" integer, "p_before" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_chat_get_messages"("p_user_id" "uuid", "p_thread_id" "uuid", "p_limit" integer, "p_before" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."personnel_chat_get_threads"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."personnel_chat_get_threads"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_chat_get_threads"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."personnel_chat_mark_delivered"("p_user_id" "uuid", "p_message_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."personnel_chat_mark_delivered"("p_user_id" "uuid", "p_message_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_chat_mark_delivered"("p_user_id" "uuid", "p_message_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."personnel_chat_mark_read"("p_thread_id" "uuid", "p_user_id" "uuid", "p_read_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."personnel_chat_mark_read"("p_thread_id" "uuid", "p_user_id" "uuid", "p_read_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_chat_mark_read"("p_thread_id" "uuid", "p_user_id" "uuid", "p_read_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."personnel_chat_reactions_json"("p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."personnel_chat_reactions_json"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_chat_reactions_json"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."personnel_chat_send_message"("p_thread_id" "uuid", "p_author" "uuid", "p_message" "text", "p_reply_to" "uuid", "p_attachments" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."personnel_chat_send_message"("p_thread_id" "uuid", "p_author" "uuid", "p_message" "text", "p_reply_to" "uuid", "p_attachments" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_chat_send_message"("p_thread_id" "uuid", "p_author" "uuid", "p_message" "text", "p_reply_to" "uuid", "p_attachments" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."personnel_chat_start_direct_thread"("p_requester" "uuid", "p_partner" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."personnel_chat_start_direct_thread"("p_requester" "uuid", "p_partner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_chat_start_direct_thread"("p_requester" "uuid", "p_partner" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."personnel_chat_threads_set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."personnel_chat_threads_set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_chat_threads_set_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."personnel_chat_touch_thread"() TO "anon";
GRANT ALL ON FUNCTION "public"."personnel_chat_touch_thread"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_chat_touch_thread"() TO "service_role";



GRANT ALL ON FUNCTION "public"."request_password_reset"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_password_reset"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_password_reset"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_two_factor_code"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."request_two_factor_code"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_two_factor_code"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_two_factor_email"("p_user_id" "uuid", "p_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_two_factor_email"("p_user_id" "uuid", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_two_factor_email"("p_user_id" "uuid", "p_enabled" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."app_permissions" TO "anon";
GRANT ALL ON TABLE "public"."app_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."app_user_appearance" TO "anon";
GRANT ALL ON TABLE "public"."app_user_appearance" TO "authenticated";
GRANT ALL ON TABLE "public"."app_user_appearance" TO "service_role";



GRANT ALL ON TABLE "public"."app_user_hr" TO "anon";
GRANT ALL ON TABLE "public"."app_user_hr" TO "authenticated";
GRANT ALL ON TABLE "public"."app_user_hr" TO "service_role";



GRANT ALL ON TABLE "public"."app_user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."app_user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."app_user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."app_user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."app_user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."app_user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."auth_login_audit" TO "anon";
GRANT ALL ON TABLE "public"."auth_login_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_login_audit" TO "service_role";



GRANT ALL ON TABLE "public"."auth_password_reset_codes" TO "anon";
GRANT ALL ON TABLE "public"."auth_password_reset_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_password_reset_codes" TO "service_role";



GRANT ALL ON TABLE "public"."auth_two_factor_codes" TO "anon";
GRANT ALL ON TABLE "public"."auth_two_factor_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_two_factor_codes" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."company_settings" TO "anon";
GRANT ALL ON TABLE "public"."company_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."company_settings" TO "service_role";



GRANT ALL ON TABLE "public"."company_snippets" TO "anon";
GRANT ALL ON TABLE "public"."company_snippets" TO "authenticated";
GRANT ALL ON TABLE "public"."company_snippets" TO "service_role";



GRANT ALL ON TABLE "public"."equipment" TO "anon";
GRANT ALL ON TABLE "public"."equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_categories" TO "anon";
GRANT ALL ON TABLE "public"."equipment_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_categories" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_maintenance" TO "anon";
GRANT ALL ON TABLE "public"."equipment_maintenance" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_maintenance" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_stock" TO "anon";
GRANT ALL ON TABLE "public"."equipment_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_stock" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_subcategories" TO "anon";
GRANT ALL ON TABLE "public"."equipment_subcategories" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_subcategories" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_units" TO "anon";
GRANT ALL ON TABLE "public"."equipment_units" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_units" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_documents" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_documents" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_tasks" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."personnel" TO "anon";
GRANT ALL ON TABLE "public"."personnel" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_activities" TO "anon";
GRANT ALL ON TABLE "public"."personnel_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_activities" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_chat_message_attachments" TO "anon";
GRANT ALL ON TABLE "public"."personnel_chat_message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_chat_message_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_chat_message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."personnel_chat_message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_chat_message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_chat_message_receipts" TO "anon";
GRANT ALL ON TABLE "public"."personnel_chat_message_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_chat_message_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."personnel_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_chat_participants" TO "anon";
GRANT ALL ON TABLE "public"."personnel_chat_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_chat_participants" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_chat_threads" TO "anon";
GRANT ALL ON TABLE "public"."personnel_chat_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_chat_threads" TO "service_role";



GRANT ALL ON TABLE "public"."personnel_schedules" TO "anon";
GRANT ALL ON TABLE "public"."personnel_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."rental_affectation" TO "anon";
GRANT ALL ON TABLE "public"."rental_affectation" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_affectation" TO "service_role";



GRANT ALL ON TABLE "public"."rental_documents" TO "anon";
GRANT ALL ON TABLE "public"."rental_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_documents" TO "service_role";



GRANT ALL ON TABLE "public"."rental_item_groups" TO "anon";
GRANT ALL ON TABLE "public"."rental_item_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_item_groups" TO "service_role";



GRANT ALL ON TABLE "public"."rental_items" TO "anon";
GRANT ALL ON TABLE "public"."rental_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_items" TO "service_role";



GRANT ALL ON TABLE "public"."rental_maintenance_charges" TO "anon";
GRANT ALL ON TABLE "public"."rental_maintenance_charges" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_maintenance_charges" TO "service_role";



GRANT ALL ON TABLE "public"."rental_preparation" TO "anon";
GRANT ALL ON TABLE "public"."rental_preparation" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_preparation" TO "service_role";



GRANT ALL ON TABLE "public"."rental_preparation_items" TO "anon";
GRANT ALL ON TABLE "public"."rental_preparation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_preparation_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rental_reference_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rental_reference_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rental_reference_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rental_return_items" TO "anon";
GRANT ALL ON TABLE "public"."rental_return_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_return_items" TO "service_role";



GRANT ALL ON TABLE "public"."rental_returns" TO "anon";
GRANT ALL ON TABLE "public"."rental_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_returns" TO "service_role";



GRANT ALL ON TABLE "public"."rental_unit_reservations" TO "anon";
GRANT ALL ON TABLE "public"."rental_unit_reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."rental_unit_reservations" TO "service_role";



GRANT ALL ON TABLE "public"."rentals" TO "anon";
GRANT ALL ON TABLE "public"."rentals" TO "authenticated";
GRANT ALL ON TABLE "public"."rentals" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_assignments" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_delivery_history" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_delivery_history" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_delivery_history" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_documents" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_documents" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_fuel_logs" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_fuel_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_fuel_logs" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_inspections" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_inspections" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_maintenance" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_maintenance" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_maintenance" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."warehouses" TO "anon";
GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouses" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- Ensure avatar storage bucket exists
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types", "owner")
VALUES ('company-assets', 'company-assets', true, NULL, '{"image/png","image/jpeg","image/webp","image/svg+xml"}'::"text"[], NULL)
ON CONFLICT ("id") DO NOTHING;






INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types", "owner")
VALUES ('avatars', 'avatars', true, NULL, NULL, NULL)
ON CONFLICT ("id") DO NOTHING;





