ALTER TABLE "public"."rental_task_card_items"
  ADD COLUMN IF NOT EXISTS "starts_at" date,
  ADD COLUMN IF NOT EXISTS "due_at" date;
