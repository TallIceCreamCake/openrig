CREATE TABLE IF NOT EXISTS "public"."rental_task_card_item_comments" (
  "id"         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "item_id"    uuid                     NOT NULL,
  "user_id"    uuid,
  "user_name"  text                     NOT NULL DEFAULT '',
  "content"    text                     NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);

ALTER TABLE "public"."rental_task_card_item_comments"
  ADD CONSTRAINT "rental_task_card_item_comments_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "public"."rental_task_card_items"("id") ON DELETE CASCADE;

ALTER TABLE "public"."rental_task_card_item_comments"
  ADD CONSTRAINT "rental_task_card_item_comments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_task_item_comments_item_id" ON "public"."rental_task_card_item_comments" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_task_item_comments_created_at" ON "public"."rental_task_card_item_comments" ("created_at");
