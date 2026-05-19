ALTER TABLE "public"."rental_task_card_items"
  ALTER COLUMN "starts_at" TYPE timestamp with time zone USING "starts_at"::timestamp with time zone,
  ALTER COLUMN "due_at"    TYPE timestamp with time zone USING "due_at"::timestamp with time zone;
