CREATE TABLE IF NOT EXISTS "public"."equipment_packs" (
    "equipment_id" "uuid" NOT NULL,
    "overview" "text",
    "highlights" "text",
    "conditions" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."equipment_packs" OWNER TO "postgres";

ALTER TABLE ONLY "public"."equipment_packs"
    ADD CONSTRAINT "equipment_packs_pkey" PRIMARY KEY ("equipment_id");

ALTER TABLE ONLY "public"."equipment_packs"
    ADD CONSTRAINT "equipment_packs_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS "public"."equipment_pack_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pack_id" "uuid" NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."equipment_pack_items" OWNER TO "postgres";

ALTER TABLE ONLY "public"."equipment_pack_items"
    ADD CONSTRAINT "equipment_pack_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."equipment_pack_items"
    ADD CONSTRAINT "equipment_pack_items_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."equipment_pack_items"
    ADD CONSTRAINT "equipment_pack_items_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "equipment_pack_items_pack_id_idx" ON "public"."equipment_pack_items" USING btree ("pack_id");

CREATE INDEX IF NOT EXISTS "equipment_pack_items_equipment_id_idx" ON "public"."equipment_pack_items" USING btree ("equipment_id");
