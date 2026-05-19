-- Assignees for rental task card items
CREATE TABLE IF NOT EXISTS rental_task_card_item_assignees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES rental_task_card_items(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  assigned_by    uuid REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_by_name text NOT NULL DEFAULT 'Systeme',
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_item_assignees_item_id ON rental_task_card_item_assignees(item_id);
CREATE INDEX IF NOT EXISTS idx_task_item_assignees_user_id ON rental_task_card_item_assignees(user_id);

ALTER TABLE rental_task_card_item_assignees ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "full_access_task_item_assignees"
    ON rental_task_card_item_assignees FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
