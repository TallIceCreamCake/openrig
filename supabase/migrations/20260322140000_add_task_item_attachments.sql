CREATE TABLE IF NOT EXISTS "public"."rental_task_item_attachments" (
  "id"               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "task_item_id"     uuid                     NOT NULL,
  "dossier_entry_id" uuid                     NOT NULL,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("task_item_id", "dossier_entry_id")
);

ALTER TABLE "public"."rental_task_item_attachments"
  ADD CONSTRAINT "rental_task_item_attachments_task_item_id_fkey"
  FOREIGN KEY ("task_item_id") REFERENCES "public"."rental_task_card_items"("id") ON DELETE CASCADE;

ALTER TABLE "public"."rental_task_item_attachments"
  ADD CONSTRAINT "rental_task_item_attachments_dossier_entry_id_fkey"
  FOREIGN KEY ("dossier_entry_id") REFERENCES "public"."rental_dossier_entries"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_task_item_attachments_task_item_id"
  ON "public"."rental_task_item_attachments" ("task_item_id");

CREATE INDEX IF NOT EXISTS "idx_task_item_attachments_dossier_entry_id"
  ON "public"."rental_task_item_attachments" ("dossier_entry_id");
