CREATE TABLE IF NOT EXISTS "public"."equipment_accessories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."equipment_accessories" OWNER TO "postgres";

ALTER TABLE ONLY "public"."equipment_accessories"
    ADD CONSTRAINT "equipment_accessories_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."equipment_accessories"
    ADD CONSTRAINT "equipment_accessories_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "equipment_accessories_equipment_id_idx" ON "public"."equipment_accessories" USING btree ("equipment_id");
